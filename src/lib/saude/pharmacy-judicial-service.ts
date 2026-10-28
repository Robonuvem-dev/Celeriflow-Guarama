import { z } from "zod";
import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { people } from "@/db/schema/people";
import { patients } from "@/db/schema/health-registration";
import { healthUnits } from "@/db/schema/health-workforce";
import { medicines, healthPrescriptionItems, healthPrescriptions } from "@/db/schema/health-prescriptions";
import { processes } from "@/db/schema/processes";
import { purchaseRequests } from "@/db/schema/procurement-requests";
import { healthPharmacyLawyers, healthPharmacyJudicialCases, healthPharmacyJudicialItems, healthPharmacyJudicialEvents, medicineDispensations } from "@/db/schema/health-pharmacy";
import { isActivePharmacyPerson, pharmacyRecord } from "@/db/repositories/health-pharmacy/records";
import { insertPharmacyJudicialCase } from "@/db/repositories/health-pharmacy/judicial";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import type { HealthPharmacyContext } from "@/lib/contracts/health-pharmacy";

export async function savePharmacyLawyer(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ personId: z.string().min(1), registration: z.string().trim().min(1).max(60), registrationState: z.string().regex(/^[A-Z]{2}$/) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    if (!await isActivePharmacyPerson(tx, input.personId)) throw new Error("Selecione o advogado no cadastro comum de pessoas.");
    return pharmacyRecord((await tx.insert(healthPharmacyLawyers).values(input).onConflictDoUpdate({ target: healthPharmacyLawyers.personId, set: { registration: input.registration, registrationState: input.registrationState, isActive: true } }).returning())[0]);
  }, { timeoutMs: 5_000 });
}

const itemSchema = z.object({ medicineId: z.string().min(1), quantity: z.number().positive(), dosage: z.string().trim().min(1).max(4000), prescriptionItemId: z.string().nullable() }).strict();
const caseSchema = z.object({ caseNumber: z.string().trim().min(1).max(100), patientId: z.string().min(1), unitId: z.string().min(1), lawyerId: z.string().min(1), openedAt: z.coerce.date(), validUntil: z.coerce.date(), reason: z.string().trim().min(1).max(4000), processId: z.string().nullable(), purchaseRequestId: z.string().nullable(), items: z.array(itemSchema).min(1).max(100) }).strict();

async function validateCase(tx: DatabaseTransaction, context: HealthPharmacyContext, input: z.infer<typeof caseSchema>) {
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.validUntil < input.openedAt || input.openedAt > new Date()) throw new Error("Confira as datas de abertura e validade do processo.");
  const [patient] = await tx.select({ personId: patients.personId }).from(patients).where(and(eq(patients.id, input.patientId), eq(patients.status, "Ativo"))).limit(1);
  if (!patient || !(await tx.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, input.unitId), eq(healthUnits.isActive, true))).limit(1))[0] || !(await tx.select({ id: healthPharmacyLawyers.id }).from(healthPharmacyLawyers).innerJoin(people, eq(people.id, healthPharmacyLawyers.personId)).where(and(eq(healthPharmacyLawyers.id, input.lawyerId), eq(healthPharmacyLawyers.isActive, true), eq(people.status, "Ativo"))).limit(1))[0]) throw new Error("Selecione paciente, unidade e advogado ativos.");
  if (input.processId && !(await tx.select({ id: processes.id }).from(processes).where(and(eq(processes.id, input.processId), eq(processes.personId, patient.personId))).limit(1))[0]) throw new Error("O protocolo deve pertencer ao paciente.");
  if (input.purchaseRequestId && !(await tx.select({ id: purchaseRequests.id }).from(purchaseRequests).where(eq(purchaseRequests.id, input.purchaseRequestId)).limit(1))[0]) throw new Error("Pedido de compra não encontrado.");
  if (new Set(input.items.map(item => item.medicineId)).size !== input.items.length) throw new Error("Não repita o medicamento no processo.");
  for (const item of input.items) {
    if (!(await tx.select({ id: medicines.id }).from(medicines).where(and(eq(medicines.id, item.medicineId), eq(medicines.isActive, true), isNotNull(medicines.materialId))).limit(1))[0]) throw new Error("Selecione medicamento ativo vinculado ao material único.");
    if (item.prescriptionItemId && !(await tx.select({ id: healthPrescriptionItems.id }).from(healthPrescriptionItems).innerJoin(healthPrescriptions, eq(healthPrescriptions.id, healthPrescriptionItems.prescriptionId)).where(and(eq(healthPrescriptionItems.id, item.prescriptionItemId), eq(healthPrescriptionItems.medicineId, item.medicineId), eq(healthPrescriptions.patientId, input.patientId))).limit(1))[0]) throw new Error("A receita deve corresponder ao paciente e medicamento do processo.");
  }
}

export async function createPharmacyJudicialCase(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = caseSchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await validateCase(tx, context, input);
    const { items, ...data } = input;
    return insertPharmacyJudicialCase(tx, { ...data, createdByUsuarioId: context.user.id }, items, input.reason);
  }, { timeoutMs: 5_000 });
}

export async function transitionPharmacyJudicialCase(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ caseId: z.string().min(1), status: z.enum(["ANALYSIS", "APPROVED", "DENIED", "CANCELLED", "ARCHIVED"]), reason: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const identity = pharmacyRecord((await tx.select({ caseNumber: healthPharmacyJudicialCases.caseNumber }).from(healthPharmacyJudicialCases).where(eq(healthPharmacyJudicialCases.id, input.caseId)).limit(1))[0]);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_CASE:${identity.caseNumber}`}))`);
    await tx.execute(sql`SELECT id FROM "HealthPharmacyJudicialCase" WHERE id=${input.caseId} FOR UPDATE`);
    const current = pharmacyRecord((await tx.select().from(healthPharmacyJudicialCases).where(eq(healthPharmacyJudicialCases.id, input.caseId)).limit(1))[0]);
    assertHealthUnitAccess(context.user, current.unitId);
    if (current.status === input.status) return current;
    const transitions: Record<string, string[]> = { OPEN: ["ANALYSIS", "CANCELLED"], ANALYSIS: ["APPROVED", "DENIED", "CANCELLED"], APPROVED: ["CANCELLED", "ARCHIVED"], DENIED: ["ANALYSIS", "ARCHIVED"], CANCELLED: ["ARCHIVED"] };
    if (!transitions[current.status]?.includes(input.status)) throw new Error("Transição não permitida para esta fase do processo.");
    if (input.status === "APPROVED" && current.validUntil < new Date()) throw new Error("Processo vencido exige renovação antes da aprovação.");
    if (input.status === "APPROVED") {
      const latest = pharmacyRecord((await tx.select().from(healthPharmacyJudicialCases).where(eq(healthPharmacyJudicialCases.caseNumber, current.caseNumber)).orderBy(desc(healthPharmacyJudicialCases.version)).limit(1))[0]);
      if (latest.id !== current.id) throw new Error("A aprovação deve utilizar a última versão do processo.");
      const predecessors = await tx.select({ id: healthPharmacyJudicialCases.id }).from(healthPharmacyJudicialCases).where(and(eq(healthPharmacyJudicialCases.caseNumber, current.caseNumber), ne(healthPharmacyJudicialCases.id, current.id), eq(healthPharmacyJudicialCases.status, "APPROVED")));
      for (const previous of predecessors) {
        await tx.update(healthPharmacyJudicialCases).set({ status: "ARCHIVED" }).where(eq(healthPharmacyJudicialCases.id, previous.id));
        await tx.insert(healthPharmacyJudicialEvents).values({ caseId: previous.id, fromStatus: "APPROVED", toStatus: "ARCHIVED", reason: `Substituído pela versão ${current.version}`, actorUsuarioId: context.user.id });
      }
    }
    const updated = pharmacyRecord((await tx.update(healthPharmacyJudicialCases).set({ status: input.status }).where(eq(healthPharmacyJudicialCases.id, current.id)).returning())[0]);
    await tx.insert(healthPharmacyJudicialEvents).values({ caseId: current.id, fromStatus: current.status, toStatus: input.status, reason: input.reason, actorUsuarioId: context.user.id });
    return updated;
  }, { timeoutMs: 5_000 });
}

export async function renewPharmacyJudicialCase(context: HealthPharmacyContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ caseId: z.string().min(1), validUntil: z.coerce.date(), reason: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const original = pharmacyRecord((await tx.select().from(healthPharmacyJudicialCases).where(eq(healthPharmacyJudicialCases.id, input.caseId)).limit(1))[0]);
    const items = await tx.select().from(healthPharmacyJudicialItems).where(eq(healthPharmacyJudicialItems.caseId, original.id));
    assertHealthUnitAccess(context.user, original.unitId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PHARMACY_CASE:${original.caseNumber}`}))`);
    if (input.validUntil <= original.validUntil || input.validUntil <= new Date()) throw new Error("A renovação exige nova validade posterior à anterior e à data atual.");
    const latest = pharmacyRecord((await tx.select().from(healthPharmacyJudicialCases).where(eq(healthPharmacyJudicialCases.caseNumber, original.caseNumber)).orderBy(desc(healthPharmacyJudicialCases.version)).limit(1))[0]);
    if (latest.id !== original.id) throw new Error("Renove a última versão do processo.");
    return insertPharmacyJudicialCase(tx, { caseNumber: original.caseNumber, version: original.version + 1, patientId: original.patientId, unitId: original.unitId, lawyerId: original.lawyerId, openedAt: new Date(), validUntil: input.validUntil, reason: input.reason, processId: original.processId, purchaseRequestId: original.purchaseRequestId, renewalOfId: original.id, createdByUsuarioId: context.user.id }, items.map(item => ({ medicineId: item.medicineId, quantity: item.quantity, dosage: item.dosage, prescriptionItemId: item.prescriptionItemId })), `Renovação: ${input.reason}`);
  }, { timeoutMs: 5_000 });
}

export async function assertJudicialDispensation(tx: DatabaseTransaction, context: HealthPharmacyContext, itemId: string, patientId: string, medicineId: string, quantity: number, prescriptionItemId?: string) {
  const item = pharmacyRecord((await tx.select().from(healthPharmacyJudicialItems).where(eq(healthPharmacyJudicialItems.id, itemId)).limit(1))[0]);
  await tx.execute(sql`SELECT id FROM "HealthPharmacyJudicialCase" WHERE id=${item.caseId} FOR UPDATE`);
  const current = pharmacyRecord((await tx.select().from(healthPharmacyJudicialCases).where(eq(healthPharmacyJudicialCases.id, item.caseId)).limit(1))[0]);
  assertHealthUnitAccess(context.user, current.unitId);
  if (current.status !== "APPROVED" || current.openedAt > new Date() || current.validUntil < new Date()) throw new Error("A dispensação judicial exige processo aprovado e vigente.");
  if (current.patientId !== patientId || item.medicineId !== medicineId || item.prescriptionItemId && item.prescriptionItemId !== prescriptionItemId) throw new Error("Paciente, medicamento ou receita incompatível com o processo judicial.");
  const [delivered] = await tx.select({ quantity: sql<number>`coalesce(sum(${medicineDispensations.quantity}), 0)::double precision`.mapWith(Number) }).from(medicineDispensations).where(and(eq(medicineDispensations.judicialCaseItemId, item.id), eq(medicineDispensations.status, "ACTIVE")));
  if (delivered.quantity + quantity > item.quantity) throw new Error("A entrega ultrapassa o saldo aprovado no processo judicial.");
}
