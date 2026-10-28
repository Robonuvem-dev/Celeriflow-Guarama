import { and, asc, count, desc, eq, getTableColumns, inArray, lte, gte, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import type { JsonObject, JsonValue } from "@/db/json";
import type { TaxCatalogIntegrationRecord } from "@/lib/contracts/tax-catalog-rules";
import { catalogDocumentSequences, catalogIntegrationEvents, catalogParameters } from "@/db/schema/tax-catalog-rules";
import { taxAssessments, taxGuides, taxes, economicRegistrations } from "@/db/schema/taxation-core";
import { taxPayments } from "@/db/schema/tax-accounting";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { documents, taxpayers, companies, realEstates } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { accountingTransactions } from "@/db/schema/finance-accounting";
import { revenues, taxRevenueIntegrations } from "@/db/schema/finance-revenues";

export const catalogJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value));
export const catalogObject = (value: JsonValue | undefined): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export function catalogRequired<T>(value: T | null | undefined): T {
  if (!value) throw new Error("Registro tributário não encontrado.");
  return value;
}
export async function lockCatalogKey(tx: DatabaseTransaction, key: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))::text`);
}
export async function lockCatalogRow(tx: DatabaseTransaction, table: "TaxParameter" | "TaxAssessment" | "TaxGuide" | "TaxRegistryEntry" | "TaxIntegrationEvent" | "RealEstate" | "ItbiDeclaration" | "DteMessage" | "DteMailbox" | "DteAccessGrant" | "DtePowerOfAttorney", id: string, mode: "SHARE" | "UPDATE" = "UPDATE") {
  await tx.execute(sql`SELECT id FROM ${sql.identifier(table)} WHERE id=${id} ${mode === "SHARE" ? sql`FOR SHARE` : sql`FOR UPDATE`}`);
}
export async function nextCatalogNumber(tx: DatabaseTransaction, year: number, documentType: string) {
  const [row] = await tx.insert(catalogDocumentSequences).values({ year, documentType, currentValue: 1 }).onConflictDoUpdate({ target: [catalogDocumentSequences.year, catalogDocumentSequences.documentType], set: { currentValue: sql`${catalogDocumentSequences.currentValue}+1`, updatedAt: new Date() } }).returning({ currentValue: catalogDocumentSequences.currentValue });
  return catalogRequired(row).currentValue;
}
export async function writeCatalogAudit(tx: DatabaseTransaction, actor: { usuarioId: string; employeeId?: string | null }, action: string, entityType: string, entityId: string, payload: JsonValue) {
  await tx.insert(taxAuditLogs).values({ action, entityType, entityId, payload, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId });
}
export async function readFiscalCandidates(db: DatabaseExecutor, input: { taxId: string; parameterId?: string; effectiveAt: Date }) {
  const rows = await db.select({ ...getTableColumns(catalogParameters), tax: getTableColumns(taxes) }).from(catalogParameters).innerJoin(taxes, eq(taxes.id, catalogParameters.taxId)).where(input.parameterId ? eq(catalogParameters.id, input.parameterId) : and(eq(catalogParameters.taxId, input.taxId), eq(catalogParameters.isActive, true), lte(catalogParameters.effectiveFrom, input.effectiveAt), or(isNull(catalogParameters.effectiveUntil), gte(catalogParameters.effectiveUntil, input.effectiveAt)))).orderBy(desc(catalogParameters.effectiveFrom)).limit(input.parameterId ? 1 : 2);
  return rows;
}
export async function findCatalogIntegration(db: DatabaseExecutor, key: string): Promise<TaxCatalogIntegrationRecord | null> {
  return (await db.select().from(catalogIntegrationEvents).where(eq(catalogIntegrationEvents.idempotencyKey, key)).limit(1))[0] ?? null;
}
export async function readCatalogIntegration(db: DatabaseExecutor, id: string): Promise<TaxCatalogIntegrationRecord | null> {
  return (await db.select().from(catalogIntegrationEvents).where(eq(catalogIntegrationEvents.id, id)).limit(1))[0] ?? null;
}
export async function insertCatalogIntegration(tx: DatabaseTransaction, input: typeof catalogIntegrationEvents.$inferInsert): Promise<TaxCatalogIntegrationRecord> {
  return catalogRequired((await tx.insert(catalogIntegrationEvents).values(input).returning())[0]);
}
export async function upsertAccountingReference(tx: DatabaseTransaction, input: typeof catalogIntegrationEvents.$inferInsert): Promise<TaxCatalogIntegrationRecord> {
  return catalogRequired((await tx.insert(catalogIntegrationEvents).values(input).onConflictDoUpdate({ target: catalogIntegrationEvents.idempotencyKey, set: { status: input.status, payload: input.payload, result: input.result, processedAt: input.processedAt, updatedAt: new Date() } }).returning())[0]);
}
export async function readCatalogAssessment(db: DatabaseExecutor, id: string) {
  return (await db.select().from(taxAssessments).where(eq(taxAssessments.id, id)).limit(1))[0] ?? null;
}
export async function listCatalogAssessments(db: DatabaseExecutor, ids: string[]) {
  return db.select().from(taxAssessments).where(inArray(taxAssessments.id, ids)).orderBy(asc(taxAssessments.id));
}
export async function insertCatalogAssessment(tx: DatabaseTransaction, input: typeof taxAssessments.$inferInsert) {
  return catalogRequired((await tx.insert(taxAssessments).values(input).returning())[0]);
}
export async function updateCatalogAssessment(tx: DatabaseTransaction, id: string, input: Partial<typeof taxAssessments.$inferInsert>) {
  return catalogRequired((await tx.update(taxAssessments).set(input).where(eq(taxAssessments.id, id)).returning())[0]);
}
export async function readCatalogTaxpayer(db: DatabaseExecutor, id: string) {
  const row = (await db.select({ ...getTableColumns(taxpayers), company: getTableColumns(companies), person: getTableColumns(people) }).from(taxpayers).leftJoin(companies, eq(companies.id, taxpayers.companyId)).leftJoin(people, eq(people.id, taxpayers.personId)).where(eq(taxpayers.id, id)).limit(1))[0];
  return row ?? null;
}
export async function countActiveCatalogTaxpayers(db: DatabaseExecutor, ids: string[]) {
  return (await db.select({ value: count() }).from(taxpayers).where(and(inArray(taxpayers.id, ids), eq(taxpayers.status, "Ativo"))))[0].value;
}
export async function readCatalogProperty(db: DatabaseExecutor, id: string) {
  return (await db.select().from(realEstates).where(eq(realEstates.id, id)).limit(1))[0] ?? null;
}
export async function readCatalogRegistration(db: DatabaseExecutor, id: string) {
  return (await db.select().from(economicRegistrations).where(eq(economicRegistrations.id, id)).limit(1))[0] ?? null;
}
export async function readCatalogDocument(db: DatabaseExecutor, id: string) {
  return (await db.select().from(documents).where(eq(documents.id, id)).limit(1))[0] ?? null;
}
export async function insertCatalogDocument(tx: DatabaseTransaction, input: typeof documents.$inferInsert) {
  return catalogRequired((await tx.insert(documents).values(input).returning())[0]);
}
export async function readCatalogRegistry(db: DatabaseExecutor, id: string) {
  return (await db.select().from(taxRegistryEntries).where(eq(taxRegistryEntries.id, id)).limit(1))[0] ?? null;
}
export async function findCatalogRegistry(db: DatabaseExecutor, input: { entityType: string; entityId: string; category: string; status?: string; title?: string }, latest = false) {
  const query = db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, input.entityType), eq(taxRegistryEntries.entityId, input.entityId), eq(taxRegistryEntries.category, input.category), input.status ? eq(taxRegistryEntries.status, input.status) : undefined, input.title !== undefined ? eq(taxRegistryEntries.title, input.title) : undefined));
  return (await (latest ? query.orderBy(desc(taxRegistryEntries.version)) : query).limit(1))[0] ?? null;
}
export async function countCatalogCreditEvents(db: DatabaseExecutor, id: string) {
  return (await db.select({ value: count() }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.entityId, id), eq(taxRegistryEntries.category, "CREDIT_EVENT"))))[0].value;
}
export async function listCatalogCreditEvents(db: DatabaseExecutor, id: string) {
  return db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "TAX_ASSESSMENT"), eq(taxRegistryEntries.entityId, id), or(eq(taxRegistryEntries.category, "CREDIT_EVENT"), and(eq(taxRegistryEntries.category, "CREDIT_MOVEMENT"), eq(taxRegistryEntries.status, "EFETIVADO"))))).orderBy(asc(taxRegistryEntries.createdAt));
}
export async function insertCatalogRegistry(tx: DatabaseTransaction, input: typeof taxRegistryEntries.$inferInsert) {
  return catalogRequired((await tx.insert(taxRegistryEntries).values(input).returning())[0]);
}
export async function updateCatalogRegistry(tx: DatabaseTransaction, id: string, input: Partial<typeof taxRegistryEntries.$inferInsert>) {
  return catalogRequired((await tx.update(taxRegistryEntries).set(input).where(eq(taxRegistryEntries.id, id)).returning())[0]);
}
export async function insertCatalogGuide(tx: DatabaseTransaction, input: typeof taxGuides.$inferInsert) {
  return catalogRequired((await tx.insert(taxGuides).values(input).returning())[0]);
}
export async function readCatalogGuide(db: DatabaseExecutor, id: string) {
  const guide = await readCatalogGuideRecord(db, id);
  if (!guide) return null;
  return { ...guide, assessment: catalogRequired(await readCatalogAssessment(db, guide.assessmentId)), payments: await db.select().from(taxPayments).where(and(eq(taxPayments.guideId, id), eq(taxPayments.status, "Confirmado"))) };
}
export async function readCatalogGuideRecord(db: DatabaseExecutor, id: string) {
  return (await db.select().from(taxGuides).where(eq(taxGuides.id, id)).limit(1))[0] ?? null;
}
export async function matchCatalogGuide(db: DatabaseExecutor, reference: string) {
  return (await db.select({ id: taxGuides.id, assessmentId: taxGuides.assessmentId }).from(taxGuides).where(or(eq(taxGuides.guideNumber, reference), eq(taxGuides.id, reference))).limit(1))[0] ?? null;
}
export async function listCatalogAssessmentPayments(db: DatabaseExecutor, id: string) {
  return db.select(getTableColumns(taxPayments)).from(taxPayments).innerJoin(taxGuides, eq(taxGuides.id, taxPayments.guideId)).where(and(eq(taxGuides.assessmentId, id), eq(taxPayments.status, "Confirmado")));
}
export async function readCatalogPaymentByKey(db: DatabaseExecutor, key: string) {
  return (await db.select().from(taxPayments).where(eq(taxPayments.idempotencyKey, key)).limit(1))[0] ?? null;
}
export async function readCatalogAssessmentDetail(db: DatabaseExecutor, id: string, activeGuidesOnly = false) {
  const assessment = await readCatalogAssessment(db, id);
  if (!assessment) return null;
  const guides = await db.select().from(taxGuides).where(and(eq(taxGuides.assessmentId, id), activeGuidesOnly ? ne(taxGuides.status, "Cancelada") : undefined));
  const payments = await listCatalogAssessmentPayments(db, id);
  const tax = catalogRequired((await db.select().from(taxes).where(eq(taxes.id, assessment.taxId)).limit(1))[0]);
  return { ...assessment, tax, taxpayer: catalogRequired(await readCatalogTaxpayer(db, assessment.taxpayerId)), guides: guides.map(guide => ({ ...guide, payments: payments.filter(payment => payment.guideId === guide.id) })) };
}
export async function readCatalogRevenueLink(db: DatabaseExecutor, paymentId: string) {
  return (await db.select({ ...getTableColumns(taxRevenueIntegrations), revenue: getTableColumns(revenues) }).from(taxRevenueIntegrations).innerJoin(revenues, eq(revenues.id, taxRevenueIntegrations.revenueId)).where(eq(taxRevenueIntegrations.taxPaymentId, paymentId)).limit(1))[0] ?? null;
}
export async function readCatalogAccountingByKey(db: DatabaseExecutor, key: string) {
  return (await db.select().from(accountingTransactions).where(eq(accountingTransactions.idempotencyKey, key)).limit(1))[0] ?? null;
}
export async function listCatalogPropertyDebts(db: DatabaseExecutor, id: string) {
  const assessments = await db.select().from(taxAssessments).where(and(eq(taxAssessments.realEstateId, id), notInArray(taxAssessments.status, ["Cancelado", "Extinto", "Suspenso"])));
  const positions = [];
  for (const assessment of assessments) positions.push({ ...assessment, payments: await listCatalogAssessmentPayments(db, assessment.id) });
  const entries = await db.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "REAL_ESTATE"), eq(taxRegistryEntries.entityId, id), eq(taxRegistryEntries.category, "NON_TAX_PROPERTY_DEBT"), inArray(taxRegistryEntries.status, ["ATIVO", "PENDENTE"])));
  return { assessments: positions, entries };
}
