import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { applyStockMovement, reverseStockMovementInTransaction } from "@/lib/patrimonio/stock-service";
import { cancelKitDispensationInTransaction, pharmacyDispensationAccess, prescriptionDispensationTx } from "./pharmacy-dispensation-service";
import { clinicalConditionQuestionnaireKeys } from "./clinical-questionnaire-policy";
type Tx = Prisma.TransactionClient;
export const kitCriteriaSchema = z.object({ programId: z.string().nullable().default(null), neighborhoodId: z.string().nullable(), careGroup: z.enum(["ANY", "PREGNANCY", "HYPERTENSION", "DIABETES", "CHRONIC"]), prescriptionValidThrough: z.coerce.date().nullable() }).strict();
const partSchema = z.object({ materialId: z.string().min(1), quantity: z.number().positive() }).strict();

export async function savePharmacyKit(context: AppContext, raw: unknown) {
  const input = z.object({ code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(200), items: z.array(partSchema).min(1).max(100) }).strict().parse(raw);
  if (new Set(input.items.map(item => item.materialId)).size !== input.items.length) throw new Error("Não repita o produto na composição do kit.");
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_KIT:${input.code}`}))`;
    if (await tx.material.count({ where: { id: { in: input.items.map(item => item.materialId) }, isActive: true, healthProfile: { isActive: true } } }) !== input.items.length) throw new Error("Selecione produtos assistenciais ativos do material único.");
    const existing = await tx.healthPharmacyKit.findUnique({ where: { code: input.code } });
    if (!existing) return tx.healthPharmacyKit.create({ data: { code: input.code, name: input.name, items: { create: input.items } } });
    await tx.healthPharmacyKitItem.deleteMany({ where: { kitId: existing.id } });
    return tx.healthPharmacyKit.update({ where: { id: existing.id }, data: { name: input.name, version: { increment: 1 }, isActive: true, items: { create: input.items } } });
  });
}

async function eligiblePatient(tx: Tx, context: AppContext, patientId: string, criteria: z.infer<typeof kitCriteriaSchema>) {
  const patient = await tx.patient.findFirstOrThrow({ where: { id: patientId, status: "Ativo", person: { status: "Ativo", deathDate: null } }, include: { person: { include: { addresses: { where: { addressType: "Residencial", canonicalAddressId: null }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 } } }, clinicalConditions: { where: { endedAt: null } }, pregnancies: { where: { status: "ACTIVE" }, select: { id: true } } } });
  if (patient.referenceUnitId) assertHealthUnitAccess(context.user, patient.referenceUnitId);
  else if (context.user.hasHealthAccessScope) throw new Error("Paciente sem unidade de referência autorizada.");
  const address = patient.person.addresses[0];
  if (criteria.neighborhoodId && address?.neighborhoodId !== criteria.neighborhoodId) throw new Error(`Endereço atual de ${patient.person.fullName} não corresponde ao bairro selecionado.`);
  const groups = clinicalConditionQuestionnaireKeys(patient.clinicalConditions, patient.pregnancies.length > 0);
  if (criteria.careGroup !== "ANY" && !groups.includes(criteria.careGroup)) throw new Error(`Paciente ${patient.person.fullName} não pertence à ação programática clínica selecionada.`);
  const enrollment = criteria.programId ? await tx.healthCareProgramEnrollment.findFirst({ where: { programId: criteria.programId, patientId, program: { isActive: true }, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }], ...(context.user.hasHealthAccessScope ? { unitId: { in: context.user.allowedHealthUnitIds || [] } } : {}) }, select: { id: true, programId: true, unitId: true, startsAt: true, endsAt: true } }) : null;
  if (criteria.programId && !enrollment) throw new Error("O paciente não possui vínculo vigente com a ação programática selecionada.");
  return { patient, snapshot: { addressId: address?.id || null, neighborhoodId: address?.neighborhoodId || null, conditionIds: patient.clinicalConditions.map(condition => condition.id), pregnancyIds: patient.pregnancies.map(pregnancy => pregnancy.id), careGroups: groups, programEnrollment: enrollment ? { ...enrollment, startsAt: enrollment.startsAt.toISOString(), endsAt: enrollment.endsAt?.toISOString() || null } : null } };
}

async function prescriptionForMaterial(tx: Tx, context: AppContext, patientId: string, part: z.infer<typeof partSchema>, through: Date | null) {
  const material = await tx.material.findFirstOrThrow({ where: { id: part.materialId, isActive: true, healthProfile: { isActive: true } }, include: { medicine: true, healthProfile: true } });
  if (!material.medicine) {
    if (["MEDICINE", "CONTROLLED", "MANIPULATED"].includes(material.healthProfile!.productKind)) throw new Error(`Vincule ${material.name} ao medicamento antes de gerar o kit.`);
    return null;
  }
  if (!material.medicine.isActive) throw new Error(`Medicamento inativo: ${material.name}.`);
  const reference = new Date(Math.max(Date.now(), through?.valueOf() || 0));
  const candidates = await tx.healthPrescriptionItem.findMany({ where: { medicineId: material.medicine.id, prescription: { patientId, ...(context.user.hasHealthAccessScope ? { unitId: { in: context.user.allowedHealthUnitIds || [] } } : {}), ...(through ? { validUntil: { gte: reference } } : { OR: [{ validUntil: null }, { validUntil: { gte: reference } }] }) } }, include: { dispensations: { where: { status: "ACTIVE" }, select: { quantity: true } } }, orderBy: { prescription: { date: "desc" } } });
  const candidate = candidates.find(item => item.quantity === null || item.quantity - item.dispensations.reduce((sum, dispensation) => sum + dispensation.quantity, 0) >= part.quantity);
  if (!candidate) throw new Error(`Não há receita válida com saldo para ${material.name}.`);
  return candidate.id;
}

export async function generatePharmacyKits(context: AppContext, raw: unknown) {
  const input = z.object({ kitId: z.string().min(1), warehouseId: z.string().min(1), patientIds: z.array(z.string().min(1)).min(1).max(100), criteria: kitCriteriaSchema, idempotencyKey: z.string().trim().min(8).max(100) }).strict().parse(raw);
  if (new Set(input.patientIds).size !== input.patientIds.length) throw new Error("Selecione pacientes sem duplicação.");
  return context.prisma.$transaction(async tx => {
    await pharmacyDispensationAccess(tx, context, input.warehouseId);
    await tx.$queryRaw`SELECT id FROM "HealthPharmacyKit" WHERE id=${input.kitId} FOR UPDATE`;
    const kit = await tx.healthPharmacyKit.findFirstOrThrow({ where: { id: input.kitId, isActive: true }, include: { items: { orderBy: { materialId: "asc" } } } });
    if (!kit.items.length) throw new Error("Cadastre a composição do kit antes de gerar as entregas.");
    const criteria = JSON.parse(JSON.stringify(input.criteria)) as Prisma.InputJsonObject;
    const result: string[] = [];
    for (const patientId of [...input.patientIds].sort()) {
      const key = `${input.idempotencyKey}:${patientId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_KIT_GENERATION:${key}`}))`;
      const previous = await tx.healthPharmacyKitDelivery.findUnique({ where: { idempotencyKey: key } });
      if (previous) {
        if (previous.kitId !== kit.id || previous.patientId !== patientId || previous.warehouseId !== input.warehouseId || JSON.stringify(kitCriteriaSchema.parse(previous.criteria)) !== JSON.stringify(input.criteria)) throw new Error("Geração já registrada com outros critérios.");
        result.push(previous.id); continue;
      }
      const eligible = await eligiblePatient(tx, context, patientId, input.criteria);
      const parts: { materialId: string; quantity: number; prescriptionItemId: string | null }[] = [];
      for (const part of kit.items) parts.push({ materialId: part.materialId, quantity: part.quantity, prescriptionItemId: await prescriptionForMaterial(tx, context, patientId, part, input.criteria.prescriptionValidThrough) });
      const delivery = await tx.healthPharmacyKitDelivery.create({ data: { kitId: kit.id, kitVersion: kit.version, patientId, warehouseId: input.warehouseId, criteria, sourceSnapshot: eligible.snapshot, idempotencyKey: key, generatedByUsuarioId: context.user.id, items: { create: parts }, events: { create: { status: "GENERATED", reason: "Kit gerado sem baixa ou entrada de estoque", actorUsuarioId: context.user.id } } } });
      result.push(delivery.id);
    }
    return { deliveryIds: result };
  }, { timeout: 60000 });
}

export async function deliverPharmacyKit(context: AppContext, raw: unknown) {
  const input = z.object({ deliveryId: z.string().min(1), receiverPersonId: z.string().nullable(), receiverRelationship: z.string().trim().max(200).nullable(), stocks: z.array(z.object({ itemId: z.string().min(1), stockId: z.string().min(1) }).strict()).min(1) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthPharmacyKitDelivery" WHERE id=${input.deliveryId} FOR UPDATE`;
    const delivery = await tx.healthPharmacyKitDelivery.findUniqueOrThrow({ where: { id: input.deliveryId }, include: { items: { orderBy: { materialId: "asc" } } } });
    await pharmacyDispensationAccess(tx, context, delivery.warehouseId);
    if (delivery.status === "DELIVERED") {
      const patient = await tx.patient.findUniqueOrThrow({ where: { id: delivery.patientId }, select: { personId: true } });
      if (delivery.receiverPersonId !== (input.receiverPersonId || patient.personId) || input.stocks.length !== delivery.items.length || delivery.items.some(item => !input.stocks.some(selection => selection.itemId === item.id && selection.stockId === item.stockId))) throw new Error("Kit já entregue com outros lotes ou retirante.");
      return { id: delivery.id };
    }
    if (delivery.status !== "GENERATED") throw new Error("Somente kits gerados e ainda não retirados podem ser entregues.");
    const criteria = kitCriteriaSchema.parse(delivery.criteria), eligible = await eligiblePatient(tx, context, delivery.patientId, criteria);
    const receiverPersonId = input.receiverPersonId || eligible.patient.personId;
    if (!await tx.person.count({ where: { id: receiverPersonId, status: "Ativo" } }) || receiverPersonId !== eligible.patient.personId && !input.receiverRelationship) throw new Error("Selecione o retirante e informe seu vínculo com o paciente.");
    if (input.stocks.length !== delivery.items.length || new Set(input.stocks.map(stock => stock.itemId)).size !== input.stocks.length) throw new Error("Selecione exatamente um lote para cada item do kit.");
    for (const item of delivery.items) {
      const selection = input.stocks.find(selection => selection.itemId === item.id);
      if (!selection) throw new Error("Lote não informado para um item do kit.");
      const stock = await tx.materialStock.findUniqueOrThrow({ where: { id: selection.stockId }, include: { material: { include: { medicine: true, healthProfile: true } } } });
      if (stock.warehouseId !== delivery.warehouseId || stock.materialId !== item.materialId || stock.blockedAt || stock.expirationDate && stock.expirationDate < new Date()) throw new Error("Lote incompatível, bloqueado ou vencido para o kit.");
      if (!stock.material.isActive || !stock.material.healthProfile?.isActive) throw new Error("Produto do kit está inativo.");
      if (item.prescriptionItemId) {
        if (criteria.prescriptionValidThrough && !await tx.healthPrescriptionItem.count({ where: { id: item.prescriptionItemId, prescription: { validUntil: { gte: new Date(Math.max(Date.now(), criteria.prescriptionValidThrough.valueOf())) } } } })) throw new Error("A receita não atende à validade exigida para o kit.");
        const dispensation = await prescriptionDispensationTx(tx, context, { prescriptionItemId: item.prescriptionItemId, warehouseId: delivery.warehouseId, quantity: item.quantity, batchNumber: stock.batchNumber, receiverPersonId, receiverRelationship: input.receiverRelationship, idempotencyKey: `PHARMACY_KIT_ITEM:${item.id}` });
        const recorded = await tx.medicineDispensation.update({ where: { id: dispensation.id }, data: { kitDeliveryItemId: item.id } });
        await tx.healthPharmacyKitDeliveryItem.update({ where: { id: item.id }, data: { stockId: recorded.stockId, movementId: recorded.movementId } });
      } else {
        if (stock.material.medicine) throw new Error("Medicamento do kit exige item de receita vinculado.");
        const { movement } = await applyStockMovement(tx, { kind: "EXIT", warehouseId: delivery.warehouseId, materialId: item.materialId, batchNumber: stock.batchNumber, quantity: item.quantity, idempotencyKey: `PHARMACY_KIT_ITEM:${item.id}`, reason: `ENTREGA_KIT:${delivery.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
        await tx.healthPharmacyKitDeliveryItem.update({ where: { id: item.id }, data: { stockId: stock.id, movementId: movement.id } });
      }
    }
    await tx.healthPharmacyKitDelivery.update({ where: { id: delivery.id }, data: { status: "DELIVERED", receiverPersonId, receiverRelationship: receiverPersonId === eligible.patient.personId ? "Próprio paciente" : input.receiverRelationship, deliveredAt: new Date(), deliveredByUsuarioId: context.user.id, events: { create: { status: "DELIVERED", reason: "Retirada do kit com movimentos vinculados a cada item", actorUsuarioId: context.user.id } } } });
    return { id: delivery.id };
  }, { timeout: 60000 });
}

export async function recordUncollectedPharmacyKit(context: AppContext, raw: unknown) {
  const input = z.object({ deliveryId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthPharmacyKitDelivery" WHERE id=${input.deliveryId} FOR UPDATE`;
    const delivery = await tx.healthPharmacyKitDelivery.findUniqueOrThrow({ where: { id: input.deliveryId } });
    await pharmacyDispensationAccess(tx, context, delivery.warehouseId);
    if (delivery.status === "NOT_COLLECTED") return { id: delivery.id };
    if (delivery.status !== "GENERATED") throw new Error("Somente kit ainda não entregue pode ser marcado como não retirado.");
    await tx.healthPharmacyKitDelivery.update({ where: { id: delivery.id }, data: { status: "NOT_COLLECTED", events: { create: { status: "NOT_COLLECTED", reason: input.reason, actorUsuarioId: context.user.id } } } });
    return { id: delivery.id };
  });
}

export async function returnPharmacyKit(context: AppContext, raw: unknown) {
  const input = z.object({ deliveryId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthPharmacyKitDelivery" WHERE id=${input.deliveryId} FOR UPDATE`;
    const delivery = await tx.healthPharmacyKitDelivery.findUniqueOrThrow({ where: { id: input.deliveryId }, include: { items: { include: { dispensation: true }, orderBy: { materialId: "asc" } } } });
    await pharmacyDispensationAccess(tx, context, delivery.warehouseId);
    if (delivery.status === "RETURNED") return { id: delivery.id };
    if (!["DELIVERED", "NOT_COLLECTED"].includes(delivery.status)) throw new Error("Registre a não retirada ou selecione uma entrega efetivada antes do retorno.");
    for (const item of delivery.items) if (item.movementId) {
      const reversed = item.dispensation ? await cancelKitDispensationInTransaction(tx, context, item.dispensation.id, `Retorno do kit: ${input.reason}`) : await reverseStockMovementInTransaction(tx, { movementId: item.movementId, reason: `RETORNO_KIT:${delivery.id}:${input.reason}`, idempotencyKey: `RETURN_PHARMACY_KIT_ITEM:${item.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
      await tx.healthPharmacyKitDeliveryItem.update({ where: { id: item.id }, data: { reversalMovementId: "reversalMovementId" in reversed ? reversed.reversalMovementId : reversed.id } });
    }
    await tx.healthPharmacyKitDelivery.update({ where: { id: delivery.id }, data: { status: "RETURNED", returnedAt: new Date(), returnedByUsuarioId: context.user.id, events: { create: { status: "RETURNED", reason: input.reason, actorUsuarioId: context.user.id } } } });
    return { id: delivery.id };
  }, { timeout: 60000 });
}
