import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { applyStockMovement, reverseStockMovementInTransaction } from "@/lib/patrimonio/stock-service";
import { HealthStockError } from "./health-stock-service";
import { assertJudicialDispensation } from "./pharmacy-judicial-service";
import { assertPatientPharmacyRequest, cancelDispensationPharmacyRequest, lockDispensationPharmacyRequest, recordPharmacyRequestFulfillment } from "./pharmacy-request-policy";

type Tx = Prisma.TransactionClient;
const base = {
  pharmacyRequestItemId: z.string().nullable().optional(),
  judicialCaseItemId: z.string().nullable().optional(),
  warehouseId: z.string().min(1), quantity: z.number().positive(), batchNumber: z.string().trim().max(80).nullable().optional(),
  observation: z.string().trim().max(500).nullable().optional(), nextWithdrawalAt: z.coerce.date().nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(180), receiverPersonId: z.string().nullable().optional(), receiverRelationship: z.string().trim().max(200).nullable().optional(),
};
const prescriptionSchema = z.object({ ...base, prescriptionItemId: z.string().min(1) }).strict();
const manualSchema = z.object({ ...base, patientId: z.string().min(1), medicineId: z.string().min(1), prescriptionType: z.enum(["SIMPLE", "SPECIAL", "CONTROLLED", "MANIPULATED"]), prescriberProfessionalId: z.string().nullable(), dosage: z.string().trim().min(1).max(4000) }).strict();

export async function pharmacyDispensationAccess(tx: Tx, context: AppContext, warehouseId: string) {
  const warehouse = await tx.warehouse.findFirstOrThrow({ where: { id: warehouseId, isActive: true } });
  if (!warehouse.healthUnitId) throw new HealthStockError("Estoque sem unidade de saúde vinculada.");
  assertHealthUnitAccess(context.user, warehouse.healthUnitId);
  const professional = await tx.healthProfessional.findFirst({ where: { employeeId: context.user.employeeId || "__SEM_PROFISSIONAL__", isActive: true, employee: { isActive: true }, OR: [{ unitId: warehouse.healthUnitId }, { assignments: { some: { unitId: warehouse.healthUnitId, isActive: true } } }] }, select: { id: true } });
  if (!professional) throw new HealthStockError("Profissional autenticado sem vínculo ativo com a unidade de dispensação.");
  return { warehouse, professional, unitId: warehouse.healthUnitId };
}

async function receiver(tx: Tx, patientId: string, receiverPersonId: string | null | undefined, relationship: string | null | undefined) {
  const patient = await tx.patient.findFirstOrThrow({ where: { id: patientId, status: "Ativo", person: { status: "Ativo", deathDate: null } }, select: { personId: true } });
  const personId = receiverPersonId || patient.personId;
  if (!await tx.person.count({ where: { id: personId, status: "Ativo" } })) throw new HealthStockError("Selecione a pessoa que retira os produtos.");
  if (personId !== patient.personId && !relationship) throw new HealthStockError("Informe o vínculo do retirante com o paciente.");
  return { receiverPersonId: personId, receiverRelationship: personId === patient.personId ? "Próprio paciente" : relationship! };
}

async function stockForDispensation(tx: Tx, warehouseId: string, materialId: string, quantity: number, batchNumber?: string | null) {
  const stock = batchNumber != null ? await tx.materialStock.findUnique({ where: { warehouseId_materialId_batchNumber: { warehouseId, materialId, batchNumber } } }) : await tx.materialStock.findFirst({ where: { warehouseId, materialId, quantity: { gte: quantity }, blockedAt: null, OR: [{ expirationDate: null }, { expirationDate: { gte: new Date() } }] }, orderBy: [{ expirationDate: "asc" }, { createdAt: "asc" }] });
  if (!stock || stock.blockedAt || stock.expirationDate && stock.expirationDate < new Date()) throw new HealthStockError("Não há lote válido e desbloqueado para a dispensação.");
  return stock;
}

export async function prescriptionDispensationTx(tx: Tx, context: AppContext, input: z.infer<typeof prescriptionSchema>) {
  const { professional, unitId } = await pharmacyDispensationAccess(tx, context, input.warehouseId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_DISPENSATION:${input.idempotencyKey}`}))`;
  const existing = await tx.medicineDispensation.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { pharmacyRequestFulfillment: { select: { requestItemId: true } } } });
  if (existing) {
    if (existing.warehouseId !== input.warehouseId || existing.prescriptionItemId !== input.prescriptionItemId || existing.quantity !== input.quantity || existing.judicialCaseItemId !== (input.judicialCaseItemId || null)) throw new HealthStockError("Dispensação já registrada com outros dados.");
    if (existing.status !== "ACTIVE") throw new HealthStockError("Esta dispensação foi cancelada; utilize uma nova operação.");
    if ((existing.pharmacyRequestFulfillment?.requestItemId || null) !== (input.pharmacyRequestItemId || null)) throw new HealthStockError("Dispensação já vinculada a outro pedido farmacêutico.");
    const person = await tx.patient.findUniqueOrThrow({ where: { id: existing.patientId }, select: { personId: true } });
    const receiverId = input.receiverPersonId || person.personId;
    if ((existing.receiverPersonId || person.personId) !== receiverId || receiverId !== person.personId && existing.receiverRelationship !== input.receiverRelationship) throw new HealthStockError("Dispensação já registrada para outro retirante ou vínculo.");
    return { id: existing.id };
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.prescriptionItemId}))`;
  const item = await tx.healthPrescriptionItem.findUniqueOrThrow({ where: { id: input.prescriptionItemId }, include: { medicine: true, prescription: true, dispensations: { where: { status: "ACTIVE" }, select: { quantity: true } } } });
  if (!item.medicine?.materialId) throw new HealthStockError("O item prescrito deve estar vinculado ao material único.");
  if (item.medicine.isControlled && !["SPECIAL", "CONTROLLED"].includes(item.prescription.prescriptionType)) throw new HealthStockError("Medicamento controlado exige o tipo correspondente de receituário.");
  assertHealthUnitAccess(context.user, item.prescription.unitId || "");
  if (item.prescription.validUntil && item.prescription.validUntil < new Date()) throw new HealthStockError("O receituário está vencido.");
  if (item.quantity !== null && item.dispensations.reduce((sum, dispensation) => sum + dispensation.quantity, 0) + input.quantity > item.quantity) throw new HealthStockError("A quantidade supera o saldo da prescrição.");
  const collectedBy = await receiver(tx, item.prescription.patientId, input.receiverPersonId, input.receiverRelationship);
  if (input.judicialCaseItemId) await assertJudicialDispensation(tx, context, input.judicialCaseItemId, item.prescription.patientId, item.medicine.id, input.quantity, item.id);
  if (input.pharmacyRequestItemId) await assertPatientPharmacyRequest(tx, context, { itemId: input.pharmacyRequestItemId, patientId: item.prescription.patientId, warehouseId: input.warehouseId, materialId: item.medicine.materialId, quantity: input.quantity });
  const stock = await stockForDispensation(tx, input.warehouseId, item.medicine.materialId, input.quantity, input.batchNumber);
  const { movement } = await applyStockMovement(tx, { kind: "EXIT", warehouseId: input.warehouseId, materialId: item.medicine.materialId, batchNumber: stock.batchNumber, quantity: input.quantity, reason: `DISPENSACAO_RECEITA:${item.prescriptionId}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
  const data = { quantity: input.quantity, medicineId: item.medicine.id, patientId: item.prescription.patientId, unitId, prescriptionItemId: item.id, warehouseId: input.warehouseId, stockId: stock.id, movementId: movement.id, dispensedByProfessionalId: professional.id, prescriptionType: item.prescription.prescriptionType, prescriberProfessionalId: item.prescription.professionalId, ...collectedBy, dosageSnapshot: [item.dose, item.route, item.frequency, item.duration].filter(Boolean).join(" · "), observation: input.observation, nextWithdrawalAt: input.nextWithdrawalAt, idempotencyKey: input.idempotencyKey };
  const recorded = await tx.medicineDispensation.create({ data: { ...data, judicialCaseItemId: input.judicialCaseItemId, events: { create: { kind: "CREATED", reason: "Dispensação de receituário", snapshot: JSON.parse(JSON.stringify(data)), actorUsuarioId: context.user.id } } }, select: { id: true } });
  if (input.pharmacyRequestItemId) await recordPharmacyRequestFulfillment(tx, context, { itemId: input.pharmacyRequestItemId, quantity: input.quantity, movementId: movement.id, dispensationId: recorded.id, receiverPersonId: collectedBy.receiverPersonId, reason: "Atendimento da demanda reprimida pela receita" });
  return recorded;
}

export async function dispenseElectronicPrescription(context: AppContext, raw: unknown) {
  const input = prescriptionSchema.parse(raw);
  return context.prisma.$transaction(tx => prescriptionDispensationTx(tx, context, input));
}

export async function manualDispensationTx(tx: Tx, context: AppContext, input: z.infer<typeof manualSchema>) {
  const { professional, unitId } = await pharmacyDispensationAccess(tx, context, input.warehouseId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_DISPENSATION:${input.idempotencyKey}`}))`;
  const existing = await tx.medicineDispensation.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { pharmacyRequestFulfillment: { select: { requestItemId: true } } } });
  if (existing) {
    if (existing.warehouseId !== input.warehouseId || existing.patientId !== input.patientId || existing.medicineId !== input.medicineId || existing.quantity !== input.quantity || existing.prescriptionType !== input.prescriptionType || existing.judicialCaseItemId !== (input.judicialCaseItemId || null)) throw new HealthStockError("Dispensação já registrada com outros dados.");
    if (existing.status !== "ACTIVE") throw new HealthStockError("Esta dispensação foi cancelada; utilize uma nova operação.");
    if ((existing.pharmacyRequestFulfillment?.requestItemId || null) !== (input.pharmacyRequestItemId || null)) throw new HealthStockError("Dispensação já vinculada a outro pedido farmacêutico.");
    const person = await tx.patient.findUniqueOrThrow({ where: { id: existing.patientId }, select: { personId: true } });
    const receiverId = input.receiverPersonId || person.personId;
    if ((existing.receiverPersonId || person.personId) !== receiverId || receiverId !== person.personId && existing.receiverRelationship !== input.receiverRelationship || existing.dosageSnapshot !== input.dosage || existing.prescriberProfessionalId !== input.prescriberProfessionalId) throw new HealthStockError("Dispensação já registrada com outro retirante, posologia ou prescritor.");
    return { id: existing.id };
  }
  const medicine = await tx.medicine.findFirstOrThrow({ where: { id: input.medicineId, isActive: true } });
  if (!medicine.materialId) throw new HealthStockError("Medicamento sem vínculo com o material único.");
  if (["SPECIAL", "CONTROLLED"].includes(input.prescriptionType) && !input.prescriberProfessionalId) throw new HealthStockError("Receita especial/controlada exige profissional prescritor cadastrado.");
  if (medicine.isControlled && !["SPECIAL", "CONTROLLED"].includes(input.prescriptionType)) throw new HealthStockError("Medicamento controlado exige o tipo correspondente de receituário.");
  if (input.prescriberProfessionalId && !await tx.healthProfessional.count({ where: { id: input.prescriberProfessionalId, isActive: true } })) throw new HealthStockError("Selecione prescritor ativo cadastrado.");
  const collectedBy = await receiver(tx, input.patientId, input.receiverPersonId, input.receiverRelationship);
  if (input.judicialCaseItemId) await assertJudicialDispensation(tx, context, input.judicialCaseItemId, input.patientId, input.medicineId, input.quantity);
  if (input.pharmacyRequestItemId) await assertPatientPharmacyRequest(tx, context, { itemId: input.pharmacyRequestItemId, patientId: input.patientId, warehouseId: input.warehouseId, materialId: medicine.materialId, quantity: input.quantity });
  const stock = await stockForDispensation(tx, input.warehouseId, medicine.materialId, input.quantity, input.batchNumber);
  const { movement } = await applyStockMovement(tx, { kind: "EXIT", warehouseId: input.warehouseId, materialId: medicine.materialId, batchNumber: stock.batchNumber, quantity: input.quantity, reason: `DISPENSACAO_MANUAL:${input.patientId}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
  const { batchNumber, dosage, pharmacyRequestItemId, ...inputData } = input; void batchNumber;
  const data = { ...inputData, ...collectedBy, dosageSnapshot: dosage, stockId: stock.id, movementId: movement.id, unitId, dispensedByProfessionalId: professional.id };
  const recorded = await tx.medicineDispensation.create({ data: { ...data, events: { create: { kind: "CREATED", reason: "Dispensação manual", snapshot: JSON.parse(JSON.stringify(data)), actorUsuarioId: context.user.id } } }, select: { id: true } });
  if (pharmacyRequestItemId) await recordPharmacyRequestFulfillment(tx, context, { itemId: pharmacyRequestItemId, quantity: input.quantity, movementId: movement.id, dispensationId: recorded.id, receiverPersonId: collectedBy.receiverPersonId, reason: "Atendimento da demanda reprimida por receita externa" });
  return recorded;
}

export async function dispenseManualMedicine(context: AppContext, raw: unknown) {
  const input = manualSchema.parse(raw);
  return context.prisma.$transaction(tx => manualDispensationTx(tx, context, input));
}

async function cancelDispensationTx(tx: Tx, context: AppContext, dispensationId: string, reason: string, kitReturn = false) {
  await tx.$queryRaw`SELECT id FROM "MedicineDispensation" WHERE id=${dispensationId} FOR UPDATE`;
  const dispensation = await tx.medicineDispensation.findUniqueOrThrow({ where: { id: dispensationId } });
  assertHealthUnitAccess(context.user, dispensation.unitId);
  if (dispensation.kitDeliveryItemId && !kitReturn) throw new HealthStockError("Utilize o retorno do kit para recompor os itens de sua entrega.");
  if (dispensation.status === "CANCELLED") return dispensation;
  if (!dispensation.movementId || !dispensation.warehouseId) throw new HealthStockError("A dispensação não possui movimento de estoque rastreável para recomposição.");
  await pharmacyDispensationAccess(tx, context, dispensation.warehouseId);
  if (dispensation.prescriptionItemId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dispensation.prescriptionItemId}))`;
  await lockDispensationPharmacyRequest(tx, context, dispensation.id);
  const reversal = await reverseStockMovementInTransaction(tx, { movementId: dispensation.movementId, reason: `CANCELAMENTO_DISPENSACAO:${dispensation.id}:${reason}`, idempotencyKey: `CANCEL_DISPENSATION:${dispensation.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
  await cancelDispensationPharmacyRequest(tx, context, dispensation.id, reason);
  return tx.medicineDispensation.update({ where: { id: dispensation.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByUsuarioId: context.user.id, cancellationReason: reason, reversalMovementId: reversal.id, events: { create: { kind: "CANCELLED", reason, snapshot: JSON.parse(JSON.stringify({ before: dispensation, reversalMovementId: reversal.id })), actorUsuarioId: context.user.id } } } });
}

export async function cancelMedicineDispensation(context: AppContext, raw: unknown) {
  const input = z.object({ dispensationId: z.string().min(1), reason: z.string().trim().min(1).max(1000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => { const result = await cancelDispensationTx(tx, context, input.dispensationId, input.reason); return { id: result.id }; });
}

export async function cancelKitDispensationInTransaction(tx: Tx, context: AppContext, dispensationId: string, reason: string) {
  return cancelDispensationTx(tx, context, dispensationId, reason, true);
}

export async function correctMedicineDispensation(context: AppContext, raw: unknown) {
  const input = z.object({ dispensationId: z.string().min(1), quantity: z.number().positive(), batchNumber: z.string().trim().min(1).max(80), reason: z.string().trim().min(1).max(1000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "MedicineDispensation" WHERE id=${input.dispensationId} FOR UPDATE`;
    const previous = await tx.medicineDispensation.findUniqueOrThrow({ where: { id: input.dispensationId }, include: { pharmacyRequestFulfillment: { select: { requestItemId: true } } } });
    assertHealthUnitAccess(context.user, previous.unitId);
    if (previous.kitDeliveryItemId) throw new HealthStockError("Retorne o kit e gere a composição correta para preservar a rastreabilidade da entrega.");
    const key = `CORRECT_DISPENSATION:${previous.id}`;
    const existing = await tx.medicineDispensation.findUnique({ where: { idempotencyKey: key }, include: { stock: true } });
    if (existing) { if (existing.quantity !== input.quantity || existing.stock?.batchNumber !== input.batchNumber) throw new HealthStockError("A correção já foi registrada com outros dados."); return { id: existing.id }; }
    if (previous.status !== "ACTIVE" || !previous.warehouseId) throw new HealthStockError("Somente dispensação ativa com estoque vinculado pode ser corrigida.");
    await cancelDispensationTx(tx, context, previous.id, `Correção: ${input.reason}`);
    const shared = { warehouseId: previous.warehouseId, quantity: input.quantity, batchNumber: input.batchNumber, observation: previous.observation, nextWithdrawalAt: previous.nextWithdrawalAt, receiverPersonId: previous.receiverPersonId, receiverRelationship: previous.receiverRelationship, judicialCaseItemId: previous.judicialCaseItemId, pharmacyRequestItemId: previous.pharmacyRequestFulfillment?.requestItemId || null, idempotencyKey: key };
    const result = previous.prescriptionItemId ? await prescriptionDispensationTx(tx, context, { ...shared, prescriptionItemId: previous.prescriptionItemId }) : await manualDispensationTx(tx, context, manualSchema.parse({ ...shared, patientId: previous.patientId, medicineId: previous.medicineId, prescriptionType: previous.prescriptionType, prescriberProfessionalId: previous.prescriberProfessionalId, dosage: previous.dosageSnapshot || "Posologia preservada do registro de origem" }));
    await tx.healthDispensationEvent.create({ data: { dispensationId: result.id, kind: "CORRECTED_FROM", reason: input.reason, snapshot: { originalDispensationId: previous.id }, actorUsuarioId: context.user.id } });
    return result;
  });
}
