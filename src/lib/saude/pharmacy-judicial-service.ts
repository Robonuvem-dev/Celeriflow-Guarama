import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";

export async function savePharmacyLawyer(context: AppContext, raw: unknown) {
  const input = z.object({ personId: z.string().min(1), registration: z.string().trim().min(1).max(60), registrationState: z.string().regex(/^[A-Z]{2}$/) }).strict().parse(raw);
  if (!await context.prisma.person.count({ where: { id: input.personId, status: "Ativo" } })) throw new Error("Selecione o advogado no cadastro comum de pessoas.");
  return context.prisma.healthPharmacyLawyer.upsert({ where: { personId: input.personId }, create: input, update: { registration: input.registration, registrationState: input.registrationState, isActive: true } });
}

const itemSchema = z.object({ medicineId: z.string().min(1), quantity: z.number().positive(), dosage: z.string().trim().min(1).max(4000), prescriptionItemId: z.string().nullable() }).strict();
const caseSchema = z.object({ caseNumber: z.string().trim().min(1).max(100), patientId: z.string().min(1), unitId: z.string().min(1), lawyerId: z.string().min(1), openedAt: z.coerce.date(), validUntil: z.coerce.date(), reason: z.string().trim().min(1).max(4000), processId: z.string().nullable(), purchaseRequestId: z.string().nullable(), items: z.array(itemSchema).min(1).max(100) }).strict();

async function validateCase(tx: Prisma.TransactionClient, context: AppContext, input: z.infer<typeof caseSchema>) {
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.validUntil < input.openedAt || input.openedAt > new Date()) throw new Error("Confira as datas de abertura e validade do processo.");
  if (!await tx.patient.count({ where: { id: input.patientId, status: "Ativo" } }) || !await tx.healthUnit.count({ where: { id: input.unitId, isActive: true } }) || !await tx.healthPharmacyLawyer.count({ where: { id: input.lawyerId, isActive: true, person: { status: "Ativo" } } })) throw new Error("Selecione paciente, unidade e advogado ativos.");
  if (input.processId && !await tx.process.count({ where: { id: input.processId, personId: (await tx.patient.findUniqueOrThrow({ where: { id: input.patientId }, select: { personId: true } })).personId } })) throw new Error("O protocolo deve pertencer ao paciente.");
  if (input.purchaseRequestId && !await tx.purchaseRequest.count({ where: { id: input.purchaseRequestId } })) throw new Error("Pedido de compra não encontrado.");
  if (new Set(input.items.map(item => item.medicineId)).size !== input.items.length) throw new Error("Não repita o medicamento no processo.");
  for (const item of input.items) {
    if (!await tx.medicine.count({ where: { id: item.medicineId, isActive: true, materialId: { not: null } } })) throw new Error("Selecione medicamento ativo vinculado ao material único.");
    if (item.prescriptionItemId && !await tx.healthPrescriptionItem.count({ where: { id: item.prescriptionItemId, medicineId: item.medicineId, prescription: { patientId: input.patientId } } })) throw new Error("A receita deve corresponder ao paciente e medicamento do processo.");
  }
}

export async function createPharmacyJudicialCase(context: AppContext, raw: unknown) {
  const input = caseSchema.parse(raw);
  return context.prisma.$transaction(async tx => {
    await validateCase(tx, context, input);
    const { items, ...data } = input;
    return tx.healthPharmacyJudicialCase.create({ data: { ...data, createdByUsuarioId: context.user.id, items: { create: items }, events: { create: { toStatus: "OPEN", reason: input.reason, actorUsuarioId: context.user.id } } } });
  });
}

export async function transitionPharmacyJudicialCase(context: AppContext, raw: unknown) {
  const input = z.object({ caseId: z.string().min(1), status: z.enum(["ANALYSIS", "APPROVED", "DENIED", "CANCELLED", "ARCHIVED"]), reason: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const identity = await tx.healthPharmacyJudicialCase.findUniqueOrThrow({ where: { id: input.caseId }, select: { caseNumber: true } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_CASE:${identity.caseNumber}`}))`;
    await tx.$queryRaw`SELECT id FROM "HealthPharmacyJudicialCase" WHERE id=${input.caseId} FOR UPDATE`;
    const current = await tx.healthPharmacyJudicialCase.findUniqueOrThrow({ where: { id: input.caseId } });
    assertHealthUnitAccess(context.user, current.unitId);
    if (current.status === input.status) return current;
    const transitions: Record<string, string[]> = { OPEN: ["ANALYSIS", "CANCELLED"], ANALYSIS: ["APPROVED", "DENIED", "CANCELLED"], APPROVED: ["CANCELLED", "ARCHIVED"], DENIED: ["ANALYSIS", "ARCHIVED"], CANCELLED: ["ARCHIVED"] };
    if (!transitions[current.status]?.includes(input.status)) throw new Error("Transição não permitida para esta fase do processo.");
    if (input.status === "APPROVED" && current.validUntil < new Date()) throw new Error("Processo vencido exige renovação antes da aprovação.");
    if (input.status === "APPROVED") {
      const latest = await tx.healthPharmacyJudicialCase.findFirstOrThrow({ where: { caseNumber: current.caseNumber }, orderBy: { version: "desc" } });
      if (latest.id !== current.id) throw new Error("A aprovação deve utilizar a última versão do processo.");
      const predecessors = await tx.healthPharmacyJudicialCase.findMany({ where: { caseNumber: current.caseNumber, id: { not: current.id }, status: "APPROVED" }, select: { id: true } });
      for (const previous of predecessors) await tx.healthPharmacyJudicialCase.update({ where: { id: previous.id }, data: { status: "ARCHIVED", events: { create: { fromStatus: "APPROVED", toStatus: "ARCHIVED", reason: `Substituído pela versão ${current.version}`, actorUsuarioId: context.user.id } } } });
    }
    return tx.healthPharmacyJudicialCase.update({ where: { id: current.id }, data: { status: input.status, events: { create: { fromStatus: current.status, toStatus: input.status, reason: input.reason, actorUsuarioId: context.user.id } } } });
  });
}

export async function renewPharmacyJudicialCase(context: AppContext, raw: unknown) {
  const input = z.object({ caseId: z.string().min(1), validUntil: z.coerce.date(), reason: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const original = await tx.healthPharmacyJudicialCase.findUniqueOrThrow({ where: { id: input.caseId }, include: { items: true } });
    assertHealthUnitAccess(context.user, original.unitId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_CASE:${original.caseNumber}`}))`;
    if (input.validUntil <= original.validUntil || input.validUntil <= new Date()) throw new Error("A renovação exige nova validade posterior à anterior e à data atual.");
    const latest = await tx.healthPharmacyJudicialCase.findFirstOrThrow({ where: { caseNumber: original.caseNumber }, orderBy: { version: "desc" } });
    if (latest.id !== original.id) throw new Error("Renove a última versão do processo.");
    return tx.healthPharmacyJudicialCase.create({ data: { caseNumber: original.caseNumber, version: original.version + 1, patientId: original.patientId, unitId: original.unitId, lawyerId: original.lawyerId, openedAt: new Date(), validUntil: input.validUntil, reason: input.reason, processId: original.processId, purchaseRequestId: original.purchaseRequestId, renewalOfId: original.id, createdByUsuarioId: context.user.id, items: { create: original.items.map(item => ({ medicineId: item.medicineId, quantity: item.quantity, dosage: item.dosage, prescriptionItemId: item.prescriptionItemId })) }, events: { create: { toStatus: "OPEN", reason: `Renovação: ${input.reason}`, actorUsuarioId: context.user.id } } } });
  });
}

export async function assertJudicialDispensation(tx: Prisma.TransactionClient, context: AppContext, itemId: string, patientId: string, medicineId: string, quantity: number, prescriptionItemId?: string) {
  const item = await tx.healthPharmacyJudicialItem.findUniqueOrThrow({ where: { id: itemId } });
  await tx.$queryRaw`SELECT id FROM "HealthPharmacyJudicialCase" WHERE id=${item.caseId} FOR UPDATE`;
  const current = await tx.healthPharmacyJudicialCase.findUniqueOrThrow({ where: { id: item.caseId } });
  assertHealthUnitAccess(context.user, current.unitId);
  if (current.status !== "APPROVED" || current.openedAt > new Date() || current.validUntil < new Date()) throw new Error("A dispensação judicial exige processo aprovado e vigente.");
  if (current.patientId !== patientId || item.medicineId !== medicineId || item.prescriptionItemId && item.prescriptionItemId !== prescriptionItemId) throw new Error("Paciente, medicamento ou receita incompatível com o processo judicial.");
  const delivered = await tx.medicineDispensation.aggregate({ where: { judicialCaseItemId: item.id, status: "ACTIVE" }, _sum: { quantity: true } });
  if ((delivered._sum.quantity || 0) + quantity > item.quantity) throw new Error("A entrega ultrapassa o saldo aprovado no processo judicial.");
}
