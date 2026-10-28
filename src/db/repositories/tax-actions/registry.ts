import { and, asc, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { JsonNull } from "@/db/json";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { realEstates, taxpayers, documents } from "@/db/schema/registry";
import { economicRegistrations } from "@/db/schema/taxation-core";
import { processes } from "@/db/schema/processes";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { itbiEvents } from "@/db/schema/tax-itbi";

export async function latestActionRegistryEntry(database: DatabaseExecutor, entityType: string, entityId: string, category: string, title?: string) {
  return (await database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, entityType), eq(taxRegistryEntries.entityId, entityId), eq(taxRegistryEntries.category, category), title === undefined ? undefined : eq(taxRegistryEntries.title, title))).orderBy(desc(taxRegistryEntries.version)).limit(1))[0] ?? null;
}
export async function actionRegistryEntry(database: DatabaseExecutor, id: string) {
  return (await database.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, id)).limit(1))[0] ?? null;
}
export async function firstActionRegistryEntry(database: DatabaseExecutor, entityType: string, entityId: string, category: string) {
  return (await database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, entityType), eq(taxRegistryEntries.entityId, entityId), eq(taxRegistryEntries.category, category))).limit(1))[0] ?? null;
}
export async function actionActiveRegistryEntry(database: DatabaseExecutor, entityType: string, entityId: string, category: string, title?: string) {
  return (await database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, entityType), eq(taxRegistryEntries.entityId, entityId), eq(taxRegistryEntries.category, category), eq(taxRegistryEntries.status, "ATIVO"), title === undefined ? undefined : eq(taxRegistryEntries.title, title))).orderBy(desc(taxRegistryEntries.version)).limit(1))[0] ?? null;
}
export async function actionRegistryDefinitions(database: DatabaseExecutor, entityType: string, category: string, entityIds?: string[]) {
  return database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, entityType), eq(taxRegistryEntries.category, category), entityIds === undefined ? undefined : inArray(taxRegistryEntries.entityId, entityIds))).orderBy(desc(taxRegistryEntries.version));
}
export async function insertActionRegistryEntries(tx: DatabaseExecutor, inputs: (typeof taxRegistryEntries.$inferInsert)[]) {
  if (!inputs.length) return [];
  return tx.insert(taxRegistryEntries).values(inputs.map(input => ({ ...input, data: input.data === null ? JsonNull : input.data }))).returning();
}
export async function reviewActionRegistryEntry(tx: DatabaseTransaction, id: string, input: { status: string; reviewedByUsuarioId: string; reviewedAt: Date }) {
  const [row] = await tx.update(taxRegistryEntries).set(input).where(eq(taxRegistryEntries.id, id)).returning();
  if (!row) throw new Error("Registro fiscal não encontrado.");
  return row;
}
export async function insertActionAudit(tx: DatabaseTransaction, input: typeof taxAuditLogs.$inferInsert) {
  await tx.insert(taxAuditLogs).values({ ...input, payload: input.payload === null ? JsonNull : input.payload });
}
export async function actionFiscalEntityExists(database: DatabaseExecutor, entityType: string, id: string) {
  if (entityType === "TAXPAYER") return (await database.select({ id: taxpayers.id }).from(taxpayers).where(eq(taxpayers.id, id)).limit(1)).length > 0;
  if (entityType === "REAL_ESTATE") return (await database.select({ id: realEstates.id }).from(realEstates).where(eq(realEstates.id, id)).limit(1)).length > 0;
  return (await database.select({ id: economicRegistrations.id }).from(economicRegistrations).where(eq(economicRegistrations.id, id)).limit(1)).length > 0;
}
export async function actionProcessExists(database: DatabaseExecutor, id: string) {
  return (await database.select({ id: processes.id }).from(processes).where(eq(processes.id, id)).limit(1)).length > 0;
}
export async function actionDocumentExists(database: DatabaseExecutor, id: string) {
  return (await database.select({ id: documents.id }).from(documents).where(eq(documents.id, id)).limit(1)).length > 0;
}
export async function actionOriginExists(database: DatabaseExecutor, governmentEntityId: string, budgetUnitId: string) {
  return (await database.select({ id: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(and(eq(planningEntityUnits.governmentEntityId, governmentEntityId), eq(planningEntityUnits.budgetUnitId, budgetUnitId))).limit(1)).length > 0;
}
export async function actionWorkerUnits(database: DatabaseExecutor, ids: string[]) {
  return database.select({ governmentEntityId: planningEntityUnits.governmentEntityId, budgetUnitId: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(inArray(planningEntityUnits.budgetUnitId, ids));
}
export async function actionItbiWarnings(database: DatabaseExecutor, declarationId: string) {
  return database.select({ description: itbiEvents.description }).from(itbiEvents).where(and(eq(itbiEvents.declarationId, declarationId), eq(itbiEvents.eventType, "AVISO_INCLUSAO"))).orderBy(asc(itbiEvents.createdAt));
}
export async function actionWorkspaceData(database: DatabaseExecutor, entityType: string, entityId: string, allowedBudgetUnitIds?: string[]) {
  const categories = ["TYPED_FISCAL_RECORD", "ECONOMIC_PROFILE", "CADASTRAL_OPERATION", "PROVISIONAL_EXPIRY", "CONFIGURED_VALUATION_IPTU", "CONFIGURED_VALUATION_ITBI", "PROPERTY_PROFILE", "PROPERTY_REGISTRATION_POLICY", "ECONOMIC_BULK_CHANGE"];
  const scope = allowedBudgetUnitIds === undefined ? undefined : or(notInArray(taxRegistryEntries.category, categories), ...allowedBudgetUnitIds.map(id => sql`${taxRegistryEntries.data}->'budgetUnitId' = ${JSON.stringify(id)}::jsonb`));
  const [entries, recentProcesses, recentDocuments] = await Promise.all([
    database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, entityType), eq(taxRegistryEntries.entityId, entityId), scope)).orderBy(desc(taxRegistryEntries.effectiveFrom), desc(taxRegistryEntries.createdAt)),
    database.select({ id: processes.id, protocolNumber: processes.protocolNumber, status: processes.status }).from(processes).orderBy(desc(processes.createdAt)).limit(100),
    database.select({ id: documents.id, title: documents.title, documentType: documents.documentType }).from(documents).where(eq(documents.status, "Válido")).orderBy(desc(documents.createdAt)).limit(100),
  ]);
  return { entries, processes: recentProcesses, documents: recentDocuments };
}
