import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { JsonNull, type JsonValue } from "@/db/json";
import { itbiDeclarations, itbiEvents, itbiParties, itbiDocumentSequences } from "@/db/schema/tax-itbi";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { planningEntityUnits, planningBudgetUnitLabels } from "@/db/schema/planning-catalog";
import { governmentEntities } from "@/db/schema/master-data";
import { users, accessProfiles } from "@/db/schema/identity";
import { processCitizenAccesses } from "@/db/schema/citizen-access";
import { processDocuments } from "@/db/schema/processes";
import { companies, documents, realEstates, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { taxPayments } from "@/db/schema/tax-accounting";

export function requireItbiRecord<T>(row: T | null | undefined, entity = "Registro"): T {
  if (row === null || row === undefined) throw new Error(`${entity} não encontrado.`);
  return row;
}

// JSON object members that were undefined were omitted by the previous driver.
// Preserve explicit null (including nested null), without an unchecked JSON cast.
type JsonInput = string | number | boolean | null | undefined | readonly JsonInput[] | { readonly [key: string]: JsonInput };
export function itbiJson(value: JsonInput): JsonValue {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(itbiJson);
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, itbiJson(item)]));
}

export async function readItbiDeclaration(db: DatabaseExecutor, id: string) {
  return requireItbiRecord((await db.select().from(itbiDeclarations).where(eq(itbiDeclarations.id, id)).limit(1))[0], "Declaração ITBI");
}
export async function readItbiParties(db: DatabaseExecutor, declarationId: string, ordered = false) {
  return db.select().from(itbiParties).where(eq(itbiParties.declarationId, declarationId)).orderBy(...(ordered ? [asc(itbiParties.sortOrder), asc(itbiParties.id)] : []));
}
export async function readItbiRegistryEntries(db: DatabaseExecutor, condition: SQL, order: SQL[] = []) {
  return db.select().from(taxRegistryEntries).where(condition).orderBy(...order);
}
export async function firstItbiRegistryEntry(db: DatabaseExecutor, condition: SQL, order: SQL[] = []) {
  return (await db.select().from(taxRegistryEntries).where(condition).orderBy(...order).limit(1))[0] ?? null;
}
export function itbiRegistryPosition(entityType: string, entityId: string, category: string) {
  return and(eq(taxRegistryEntries.entityType, entityType), eq(taxRegistryEntries.entityId, entityId), eq(taxRegistryEntries.category, category))!;
}
export async function latestItbiRegistryEntry(db: DatabaseExecutor, entityType: string, entityId: string, category: string) {
  return firstItbiRegistryEntry(db, itbiRegistryPosition(entityType, entityId, category), [desc(taxRegistryEntries.version)]);
}
export async function insertItbiRegistryEntry(tx: DatabaseTransaction, data: Omit<typeof taxRegistryEntries.$inferInsert, "data"> & { data: JsonInput }) {
  const json = itbiJson(data.data);
  return requireItbiRecord((await tx.insert(taxRegistryEntries).values({ ...data, data: json === null ? JsonNull : json }).returning())[0]);
}
export async function auditItbi(tx: DatabaseTransaction, data: Omit<typeof taxAuditLogs.$inferInsert, "payload"> & { payload?: JsonInput }) {
  const payload = data.payload === undefined ? undefined : itbiJson(data.payload);
  await tx.insert(taxAuditLogs).values({ ...data, payload: payload === null ? JsonNull : payload });
}
type ItbiEventInput = Omit<typeof itbiEvents.$inferInsert, "declarationId" | "payload"> & { payload?: JsonInput };
export async function appendItbiEvent(tx: DatabaseTransaction, declarationId: string, event: ItbiEventInput) {
  const payload = event.payload === undefined ? undefined : itbiJson(event.payload);
  return requireItbiRecord((await tx.insert(itbiEvents).values({ ...event, declarationId, payload: payload === null ? JsonNull : payload }).returning())[0]);
}
export async function updateItbiDeclaration(tx: DatabaseTransaction, id: string, data: Partial<typeof itbiDeclarations.$inferInsert>, event?: ItbiEventInput) {
  const row = requireItbiRecord((await tx.update(itbiDeclarations).set({ ...data, calculationSnapshot: data.calculationSnapshot === null ? JsonNull : data.calculationSnapshot, updatedAt: data.updatedAt ?? new Date() }).where(eq(itbiDeclarations.id, id)).returning())[0], "Declaração ITBI");
  if (event) await appendItbiEvent(tx, id, event);
  return row;
}
export async function lockItbiRecord(tx: DatabaseTransaction, table: "ItbiDeclaration" | "TaxAssessment" | "RealEstate" | "Process", id: string) {
  await tx.execute(sql`SELECT id FROM ${sql.identifier(table)} WHERE id=${id} FOR UPDATE`);
}
export async function lockItbiKey(tx: DatabaseTransaction, key: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`);
}
export async function readItbiMunicipalUnit(db: DatabaseExecutor, scope: { governmentEntityId: string; budgetUnitId: string }) {
  return (await db.select({ governmentEntity: governmentEntities, budgetUnit: planningBudgetUnitLabels, governmentEntityId: planningEntityUnits.governmentEntityId, budgetUnitId: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).innerJoin(governmentEntities, eq(governmentEntities.id, planningEntityUnits.governmentEntityId)).innerJoin(planningBudgetUnitLabels, eq(planningBudgetUnitLabels.id, planningEntityUnits.budgetUnitId)).where(and(eq(planningEntityUnits.governmentEntityId, scope.governmentEntityId), eq(planningEntityUnits.budgetUnitId, scope.budgetUnitId))).limit(1))[0] ?? null;
}
export async function readActiveItbiUser(db: DatabaseExecutor, id: string) {
  return (await db.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.id, id), eq(users.ativo, true), eq(accessProfiles.ativo, true))).limit(1))[0] ?? null;
}
export async function readItbiUsers(db: DatabaseExecutor, ids: string[]) {
  return db.select({ id: users.id, nome: users.nome }).from(users).where(inArray(users.id, ids));
}
export async function readItbiProcessGrant(db: DatabaseExecutor, processId: string, usuarioId: string, now: Date) {
  return (await db.select().from(processCitizenAccesses).where(and(eq(processCitizenAccesses.processId, processId), eq(processCitizenAccesses.usuarioId, usuarioId), isNull(processCitizenAccesses.revokedAt), lte(processCitizenAccesses.grantedAt, now), or(isNull(processCitizenAccesses.expiresAt), gt(processCitizenAccesses.expiresAt, now)))).limit(1))[0] ?? null;
}
export async function readItbiProcessDocuments(db: DatabaseExecutor, processId: string, documentIds?: string[]) {
  return db.select({ documentId: processDocuments.documentId }).from(processDocuments).where(and(eq(processDocuments.processId, processId), documentIds ? inArray(processDocuments.documentId, documentIds) : undefined));
}
export async function insertItbiProcessDocument(tx: DatabaseTransaction, data: typeof processDocuments.$inferInsert) {
  return requireItbiRecord((await tx.insert(processDocuments).values(data).returning())[0]);
}
export async function readValidItbiDocuments(db: DatabaseExecutor, ids: string[]) {
  return db.select({ id: documents.id, title: documents.title }).from(documents).where(and(inArray(documents.id, ids), eq(documents.status, "Válido"))).orderBy(asc(documents.title));
}
export async function readItbiProperty(db: DatabaseExecutor, id: string) {
  return requireItbiRecord((await db.select().from(realEstates).where(eq(realEstates.id, id)).limit(1))[0], "Imóvel");
}
export async function readItbiTaxpayers(db: DatabaseExecutor, ids: string[]) {
  const rows = await db.select({ taxpayer: taxpayers, person: people, company: companies }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(inArray(taxpayers.id, ids));
  return rows.map(row => ({ ...row.taxpayer, person: row.person, company: row.company }));
}
export async function readItbiAssessment(db: DatabaseExecutor, id: string) {
  return requireItbiRecord((await db.select().from(taxAssessments).where(eq(taxAssessments.id, id)).limit(1))[0], "Lançamento");
}
export async function readConfirmedItbiPayments(db: DatabaseExecutor, assessmentId: string, order: "none" | "id" | "asc" | "desc" = "none") {
  const rows = await db.select({ payment: taxPayments }).from(taxPayments).innerJoin(taxGuides, eq(taxGuides.id, taxPayments.guideId)).where(and(eq(taxGuides.assessmentId, assessmentId), eq(taxPayments.status, "Confirmado"))).orderBy(...(order === "id" ? [asc(taxPayments.id)] : order === "asc" ? [asc(taxPayments.paymentDate), asc(taxPayments.id)] : order === "desc" ? [desc(taxPayments.paymentDate), desc(taxPayments.id)] : []));
  return rows.map(row => row.payment);
}
export async function nextItbiDocumentSequence(tx: DatabaseTransaction, year: number, documentType: string) {
  return requireItbiRecord((await tx.insert(itbiDocumentSequences).values({ year, documentType, currentValue: 1 }).onConflictDoUpdate({ target: [itbiDocumentSequences.year, itbiDocumentSequences.documentType], set: { currentValue: sql`${itbiDocumentSequences.currentValue}+1`, updatedAt: new Date() } }).returning())[0]);
}
