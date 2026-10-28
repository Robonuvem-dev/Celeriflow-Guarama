import { z } from "zod";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction as Tx } from "@/db/transaction";
import { healthPrescriptionItems, healthPrescriptions } from "@/db/schema/health-prescriptions";
import { healthPharmacyKits, healthPharmacyKitItems, healthPharmacyKitDeliveries, healthPharmacyKitDeliveryItems, healthPharmacyKitEvents, medicineDispensations } from "@/db/schema/health-pharmacy";
import { countActivePharmacyMaterials, isActivePharmacyPerson, listPharmacyPrescriptionCandidates, pharmacyRecord, readPharmacyMaterial, readPharmacyPatientPerson, readPharmacyStock } from "@/db/repositories/health-pharmacy/records";
import { findPharmacyKitProgramEnrollment, readPharmacyKitDelivery, readPharmacyKitEligibility } from "@/db/repositories/health-pharmacy/kits";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import type { HealthPharmacyContext } from "@/lib/contracts/health-pharmacy";
import { applyStockMovement, reverseStockMovementInTransaction } from "@/lib/patrimonio/stock-service";
import { cancelKitDispensationInTransaction, pharmacyDispensationAccess, prescriptionDispensationTx } from "./pharmacy-dispensation-service";
import { clinicalConditionQuestionnaireKeys } from "./clinical-questionnaire-policy";
export const kitCriteriaSchema = z.object({ programId: z.string().nullable().default(null), neighborhoodId: z.string().nullable(), careGroup: z.enum(["ANY", "PREGNANCY", "HYPERTENSION", "DIABETES", "CHRONIC"]), prescriptionValidThrough: z.coerce.date().nullable() }).strict();
const partSchema = z.object({ materialId: z.string().min(1), quantity: z.number().positive() }).strict();

export async function savePharmacyKit(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(200), items: z.array(partSchema).min(1).max(100) }).strict().parse(raw);
  if (new Set(input.items.map(item => item.materialId)).size !== input.items.length) throw new Error("Não repita o produto na composição do kit.");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_KIT:${input.code}`}))`);
    if (await countActivePharmacyMaterials(tx, input.items.map(item => item.materialId)) !== input.items.length) throw new Error("Selecione produtos assistenciais ativos do material único.");
    const [existing] = await tx.select().from(healthPharmacyKits).where(eq(healthPharmacyKits.code, input.code)).limit(1);
    if (existing) await tx.delete(healthPharmacyKitItems).where(eq(healthPharmacyKitItems.kitId, existing.id));
    const kit = existing ? pharmacyRecord((await tx.update(healthPharmacyKits).set({ name: input.name, version: sql`${healthPharmacyKits.version}+1`, isActive: true }).where(eq(healthPharmacyKits.id, existing.id)).returning())[0]) : pharmacyRecord((await tx.insert(healthPharmacyKits).values({ code: input.code, name: input.name }).returning())[0]);
    await tx.insert(healthPharmacyKitItems).values(input.items.map(item => ({ ...item, kitId: kit.id })));
    return kit;
  }, { timeoutMs: 5_000 });
}

async function eligiblePatient(tx: Tx, context: HealthPharmacyContext, patientId: string, criteria: z.infer<typeof kitCriteriaSchema>) {
  const patient = await readPharmacyKitEligibility(tx, patientId);
  if (patient.referenceUnitId) assertHealthUnitAccess(context.user, patient.referenceUnitId);
  else if (context.user.hasHealthAccessScope) throw new Error("Paciente sem unidade de referência autorizada.");
  const address = patient.person.addresses[0];
  if (criteria.neighborhoodId && address?.neighborhoodId !== criteria.neighborhoodId) throw new Error(`Endereço atual de ${patient.person.fullName} não corresponde ao bairro selecionado.`);
  const groups = clinicalConditionQuestionnaireKeys(patient.clinicalConditions, patient.pregnancies.length > 0);
  if (criteria.careGroup !== "ANY" && !groups.includes(criteria.careGroup)) throw new Error(`Paciente ${patient.person.fullName} não pertence à ação programática clínica selecionada.`);
  const enrollment = criteria.programId ? await findPharmacyKitProgramEnrollment(tx, criteria.programId, patientId, context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined) : null;
  if (criteria.programId && !enrollment) throw new Error("O paciente não possui vínculo vigente com a ação programática selecionada.");
  return { patient, snapshot: { addressId: address?.id || null, neighborhoodId: address?.neighborhoodId || null, conditionIds: patient.clinicalConditions.map(condition => condition.id), pregnancyIds: patient.pregnancies.map(pregnancy => pregnancy.id), careGroups: groups, programEnrollment: enrollment ? { ...enrollment, startsAt: enrollment.startsAt.toISOString(), endsAt: enrollment.endsAt?.toISOString() || null } : null } };
}

async function prescriptionForMaterial(tx: Tx, context: HealthPharmacyContext, patientId: string, part: z.infer<typeof partSchema>, through: Date | null) {
  const material = await readPharmacyMaterial(tx, part.materialId);
  if (!material.medicine) {
    if (["MEDICINE", "CONTROLLED", "MANIPULATED"].includes(material.healthProfile!.productKind)) throw new Error(`Vincule ${material.name} ao medicamento antes de gerar o kit.`);
    return null;
  }
  if (!material.medicine.isActive) throw new Error(`Medicamento inativo: ${material.name}.`);
  const candidates = await listPharmacyPrescriptionCandidates(tx, material.medicine.id, patientId, context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined, through);
  const candidate = candidates.find(item => item.quantity === null || item.quantity - item.dispensations.reduce((sum, dispensation) => sum + dispensation.quantity, 0) >= part.quantity);
  if (!candidate) throw new Error(`Não há receita válida com saldo para ${material.name}.`);
  return candidate.id;
}

export async function generatePharmacyKits(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ kitId: z.string().min(1), warehouseId: z.string().min(1), patientIds: z.array(z.string().min(1)).min(1).max(100), criteria: kitCriteriaSchema, idempotencyKey: z.string().trim().min(8).max(100) }).strict().parse(raw);
  if (new Set(input.patientIds).size !== input.patientIds.length) throw new Error("Selecione pacientes sem duplicação.");
  return withDatabaseTransaction(connection, async tx => {
    await pharmacyDispensationAccess(tx, context, input.warehouseId);
    await tx.execute(sql`SELECT id FROM "HealthPharmacyKit" WHERE id=${input.kitId} FOR UPDATE`);
    const header = pharmacyRecord((await tx.select().from(healthPharmacyKits).where(and(eq(healthPharmacyKits.id, input.kitId), eq(healthPharmacyKits.isActive, true))).limit(1))[0]);
    const kit = { ...header, items: await tx.select().from(healthPharmacyKitItems).where(eq(healthPharmacyKitItems.kitId, header.id)).orderBy(asc(healthPharmacyKitItems.materialId)) };
    if (!kit.items.length) throw new Error("Cadastre a composição do kit antes de gerar as entregas.");
    const criteria: unknown = JSON.parse(JSON.stringify(input.criteria));
    const result: string[] = [];
    for (const patientId of [...input.patientIds].sort()) {
      const key = `${input.idempotencyKey}:${patientId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_KIT_GENERATION:${key}`}))`);
      const [previous] = await tx.select().from(healthPharmacyKitDeliveries).where(eq(healthPharmacyKitDeliveries.idempotencyKey, key)).limit(1);
      if (previous) {
        if (previous.kitId !== kit.id || previous.patientId !== patientId || previous.warehouseId !== input.warehouseId || JSON.stringify(kitCriteriaSchema.parse(previous.criteria)) !== JSON.stringify(input.criteria)) throw new Error("Geração já registrada com outros critérios.");
        result.push(previous.id); continue;
      }
      const eligible = await eligiblePatient(tx, context, patientId, input.criteria);
      const parts: { materialId: string; quantity: number; prescriptionItemId: string | null }[] = [];
      for (const part of kit.items) parts.push({ materialId: part.materialId, quantity: part.quantity, prescriptionItemId: await prescriptionForMaterial(tx, context, patientId, part, input.criteria.prescriptionValidThrough) });
      const delivery = pharmacyRecord((await tx.insert(healthPharmacyKitDeliveries).values({ kitId: kit.id, kitVersion: kit.version, patientId, warehouseId: input.warehouseId, criteria, sourceSnapshot: eligible.snapshot, idempotencyKey: key, generatedByUsuarioId: context.user.id }).returning())[0]);
      await tx.insert(healthPharmacyKitDeliveryItems).values(parts.map(part => ({ ...part, deliveryId: delivery.id })));
      await tx.insert(healthPharmacyKitEvents).values({ deliveryId: delivery.id, status: "GENERATED", reason: "Kit gerado sem baixa ou entrada de estoque", actorUsuarioId: context.user.id });
      result.push(delivery.id);
    }
    return { deliveryIds: result };
  }, { timeoutMs: 60_000 });
}

export async function deliverPharmacyKit(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ deliveryId: z.string().min(1), receiverPersonId: z.string().nullable(), receiverRelationship: z.string().trim().max(200).nullable(), stocks: z.array(z.object({ itemId: z.string().min(1), stockId: z.string().min(1) }).strict()).min(1) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthPharmacyKitDelivery" WHERE id=${input.deliveryId} FOR UPDATE`);
    const delivery = await readPharmacyKitDelivery(tx, input.deliveryId);
    await pharmacyDispensationAccess(tx, context, delivery.warehouseId);
    if (delivery.status === "DELIVERED") {
      const patient = await readPharmacyPatientPerson(tx, delivery.patientId);
      if (delivery.receiverPersonId !== (input.receiverPersonId || patient.personId) || input.stocks.length !== delivery.items.length || delivery.items.some(item => !input.stocks.some(selection => selection.itemId === item.id && selection.stockId === item.stockId))) throw new Error("Kit já entregue com outros lotes ou retirante.");
      return { id: delivery.id };
    }
    if (delivery.status !== "GENERATED") throw new Error("Somente kits gerados e ainda não retirados podem ser entregues.");
    const criteria = kitCriteriaSchema.parse(delivery.criteria), eligible = await eligiblePatient(tx, context, delivery.patientId, criteria);
    const receiverPersonId = input.receiverPersonId || eligible.patient.personId;
    if (!await isActivePharmacyPerson(tx, receiverPersonId) || receiverPersonId !== eligible.patient.personId && !input.receiverRelationship) throw new Error("Selecione o retirante e informe seu vínculo com o paciente.");
    if (input.stocks.length !== delivery.items.length || new Set(input.stocks.map(stock => stock.itemId)).size !== input.stocks.length) throw new Error("Selecione exatamente um lote para cada item do kit.");
    for (const item of delivery.items) {
      const selection = input.stocks.find(selection => selection.itemId === item.id);
      if (!selection) throw new Error("Lote não informado para um item do kit.");
      const stock = await readPharmacyStock(tx, selection.stockId);
      if (stock.warehouseId !== delivery.warehouseId || stock.materialId !== item.materialId || stock.blockedAt || stock.expirationDate && stock.expirationDate < new Date()) throw new Error("Lote incompatível, bloqueado ou vencido para o kit.");
      if (!stock.material.isActive || !stock.material.healthProfile?.isActive) throw new Error("Produto do kit está inativo.");
      if (item.prescriptionItemId) {
        if (criteria.prescriptionValidThrough && !(await tx.select({ id: healthPrescriptionItems.id }).from(healthPrescriptionItems).innerJoin(healthPrescriptions, eq(healthPrescriptions.id, healthPrescriptionItems.prescriptionId)).where(and(eq(healthPrescriptionItems.id, item.prescriptionItemId), gte(healthPrescriptions.validUntil, new Date(Math.max(Date.now(), criteria.prescriptionValidThrough.valueOf()))))).limit(1))[0]) throw new Error("A receita não atende à validade exigida para o kit.");
        const dispensation = await prescriptionDispensationTx(tx, context, { prescriptionItemId: item.prescriptionItemId, warehouseId: delivery.warehouseId, quantity: item.quantity, batchNumber: stock.batchNumber, receiverPersonId, receiverRelationship: input.receiverRelationship, idempotencyKey: `PHARMACY_KIT_ITEM:${item.id}` });
        const recorded = pharmacyRecord((await tx.update(medicineDispensations).set({ kitDeliveryItemId: item.id }).where(eq(medicineDispensations.id, dispensation.id)).returning())[0]);
        await tx.update(healthPharmacyKitDeliveryItems).set({ stockId: recorded.stockId, movementId: recorded.movementId }).where(eq(healthPharmacyKitDeliveryItems.id, item.id));
      } else {
        if (stock.material.medicine) throw new Error("Medicamento do kit exige item de receita vinculado.");
        const { movement } = await applyStockMovement(tx, { kind: "EXIT", warehouseId: delivery.warehouseId, materialId: item.materialId, batchNumber: stock.batchNumber, quantity: item.quantity, idempotencyKey: `PHARMACY_KIT_ITEM:${item.id}`, reason: `ENTREGA_KIT:${delivery.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
        await tx.update(healthPharmacyKitDeliveryItems).set({ stockId: stock.id, movementId: movement.id }).where(eq(healthPharmacyKitDeliveryItems.id, item.id));
      }
    }
    await tx.update(healthPharmacyKitDeliveries).set({ status: "DELIVERED", receiverPersonId, receiverRelationship: receiverPersonId === eligible.patient.personId ? "Próprio paciente" : input.receiverRelationship, deliveredAt: new Date(), deliveredByUsuarioId: context.user.id }).where(eq(healthPharmacyKitDeliveries.id, delivery.id));
    await tx.insert(healthPharmacyKitEvents).values({ deliveryId: delivery.id, status: "DELIVERED", reason: "Retirada do kit com movimentos vinculados a cada item", actorUsuarioId: context.user.id });
    return { id: delivery.id };
  }, { timeoutMs: 60_000 });
}

export async function recordUncollectedPharmacyKit(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ deliveryId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthPharmacyKitDelivery" WHERE id=${input.deliveryId} FOR UPDATE`);
    const delivery = pharmacyRecord((await tx.select().from(healthPharmacyKitDeliveries).where(eq(healthPharmacyKitDeliveries.id, input.deliveryId)).limit(1))[0]);
    await pharmacyDispensationAccess(tx, context, delivery.warehouseId);
    if (delivery.status === "NOT_COLLECTED") return { id: delivery.id };
    if (delivery.status !== "GENERATED") throw new Error("Somente kit ainda não entregue pode ser marcado como não retirado.");
    await tx.update(healthPharmacyKitDeliveries).set({ status: "NOT_COLLECTED" }).where(eq(healthPharmacyKitDeliveries.id, delivery.id));
    await tx.insert(healthPharmacyKitEvents).values({ deliveryId: delivery.id, status: "NOT_COLLECTED", reason: input.reason, actorUsuarioId: context.user.id });
    return { id: delivery.id };
  }, { timeoutMs: 5_000 });
}

export async function returnPharmacyKit(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ deliveryId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthPharmacyKitDelivery" WHERE id=${input.deliveryId} FOR UPDATE`);
    const delivery = await readPharmacyKitDelivery(tx, input.deliveryId);
    await pharmacyDispensationAccess(tx, context, delivery.warehouseId);
    if (delivery.status === "RETURNED") return { id: delivery.id };
    if (!["DELIVERED", "NOT_COLLECTED"].includes(delivery.status)) throw new Error("Registre a não retirada ou selecione uma entrega efetivada antes do retorno.");
    for (const item of delivery.items) if (item.movementId) {
      const reversed = item.dispensation ? await cancelKitDispensationInTransaction(tx, context, item.dispensation.id, `Retorno do kit: ${input.reason}`) : await reverseStockMovementInTransaction(tx, { movementId: item.movementId, reason: `RETORNO_KIT:${delivery.id}:${input.reason}`, idempotencyKey: `RETURN_PHARMACY_KIT_ITEM:${item.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
      await tx.update(healthPharmacyKitDeliveryItems).set({ reversalMovementId: "reversalMovementId" in reversed ? reversed.reversalMovementId : reversed.id }).where(eq(healthPharmacyKitDeliveryItems.id, item.id));
    }
    await tx.update(healthPharmacyKitDeliveries).set({ status: "RETURNED", returnedAt: new Date(), returnedByUsuarioId: context.user.id }).where(eq(healthPharmacyKitDeliveries.id, delivery.id));
    await tx.insert(healthPharmacyKitEvents).values({ deliveryId: delivery.id, status: "RETURNED", reason: input.reason, actorUsuarioId: context.user.id });
    return { id: delivery.id };
  }, { timeoutMs: 60_000 });
}
