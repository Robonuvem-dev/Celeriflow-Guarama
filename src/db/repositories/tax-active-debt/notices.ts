import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { JsonNull } from "@/db/json";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { economicRegistrations, taxAssessments, taxGuides, taxes } from "@/db/schema/taxation-core";
import { companies, realEstates, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { planningBudgetUnitLabels, planningEntityUnits } from "@/db/schema/planning-catalog";
import { governmentEntities } from "@/db/schema/master-data";
import { readDebtPayments } from "./records";
import { activeDebtSnapshot } from "./snapshot";

type NoticeFilter = { governmentEntityId: string; budgetUnitId: string; kind: "PROPERTY" | "ECONOMIC"; year: number | null; taxId: string | null; taxpayerId: string | null; propertyId: string | null; economicRegistrationId?: string | null; streetId: string | null; neighborhoodId: string | null; addressContains: string };
export async function listNoticeAssessments(database: DatabaseExecutor, filter: NoticeFilter) {
  const rows = await database.select({ assessment: taxAssessments, tax: { name: taxes.name }, taxpayer: taxpayers, person: people, company: companies, realEstate: realEstates, economicRegistration: economicRegistrations }).from(taxAssessments).innerJoin(taxes, eq(taxes.id, taxAssessments.taxId)).innerJoin(taxpayers, eq(taxpayers.id, taxAssessments.taxpayerId)).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).leftJoin(realEstates, eq(realEstates.id, taxAssessments.realEstateId)).leftJoin(economicRegistrations, eq(economicRegistrations.id, taxAssessments.economicRegistrationId)).where(and(
    notInArray(taxAssessments.status, ["Cancelado", "Extinto", "Suspenso"]), filter.year ? eq(taxAssessments.year, filter.year) : undefined, filter.taxId ? eq(taxAssessments.taxId, filter.taxId) : undefined, filter.taxpayerId ? eq(taxAssessments.taxpayerId, filter.taxpayerId) : undefined,
    filter.kind === "PROPERTY" ? and(isNotNull(taxAssessments.realEstateId), filter.propertyId ? eq(realEstates.id, filter.propertyId) : undefined, filter.streetId ? eq(realEstates.streetId, filter.streetId) : undefined, filter.neighborhoodId ? eq(realEstates.neighborhoodId, filter.neighborhoodId) : undefined, filter.addressContains ? ilike(realEstates.streetName, `%${filter.addressContains.replace(/[\\%_]/g, "\\$&")}%`) : undefined) : filter.economicRegistrationId ? eq(taxAssessments.economicRegistrationId, filter.economicRegistrationId) : isNotNull(taxAssessments.economicRegistrationId),
    sql`${taxAssessments.calculationSnapshot}->'governmentEntityId'=${JSON.stringify(filter.governmentEntityId)}::jsonb`, sql`${taxAssessments.calculationSnapshot}->'budgetUnitId'=${JSON.stringify(filter.budgetUnitId)}::jsonb`,
  )).orderBy(asc(taxAssessments.id));
  const guides = await database.select().from(taxGuides).where(inArray(taxGuides.assessmentId, rows.map(row => row.assessment.id))).orderBy(desc(taxGuides.dueDate), asc(taxGuides.id));
  return rows.map(row => ({ ...row.assessment, tax: row.tax, taxpayer: { ...row.taxpayer, person: row.person, company: row.company }, realEstate: row.realEstate, economicRegistration: row.economicRegistration, guides: guides.filter(guide => guide.assessmentId === row.assessment.id) }));
}
export async function listNoticeProfiles(database: DatabaseExecutor, ids: string[]) {
  return database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "ECONOMIC_REGISTRATION"), eq(taxRegistryEntries.category, "ECONOMIC_PROFILE"), inArray(taxRegistryEntries.entityId, ids))).orderBy(desc(taxRegistryEntries.version));
}
export async function listNoticePayments(database: DatabaseExecutor, ids: string[]) {
  return (await readDebtPayments(database, ids)).map(row => ({ ...row.payment, guide: { assessmentId: row.assessmentId } }));
}
export async function insertDebtRegistry(tx: DatabaseTransaction, input: Omit<typeof taxRegistryEntries.$inferInsert, "data"> & { data: unknown }) {
  const data = activeDebtSnapshot(input.data);
  return (await tx.insert(taxRegistryEntries).values({ ...input, data: data === null ? JsonNull : data }).returning())[0];
}
export async function insertDebtAudit(tx: DatabaseTransaction, input: Omit<typeof taxAuditLogs.$inferInsert, "payload"> & { payload: unknown }) {
  const payload = activeDebtSnapshot(input.payload);
  return (await tx.insert(taxAuditLogs).values({ ...input, payload: payload === null ? JsonNull : payload }).returning())[0];
}
export async function listIssuedDebtNotices(database: DatabaseExecutor, input: { noticeId?: string; batchId?: string }) {
  return database.select().from(taxRegistryEntries).where(and(eq(taxRegistryEntries.entityType, "DEBT_NOTICE"), eq(taxRegistryEntries.category, "DEBT_NOTICE_ISSUANCE"), input.noticeId ? eq(taxRegistryEntries.entityId, input.noticeId) : sql`${taxRegistryEntries.data}->'batchId'=${JSON.stringify(input.batchId)}::jsonb`)).orderBy(asc(taxRegistryEntries.createdAt), asc(taxRegistryEntries.id));
}
export async function readNoticeOrigin(database: DatabaseExecutor, governmentEntityId: string, budgetUnitId: string) {
  return (await database.select({ governmentEntity: { name: governmentEntities.name }, budgetUnit: { code: planningBudgetUnitLabels.code } }).from(planningEntityUnits).innerJoin(governmentEntities, eq(governmentEntities.id, planningEntityUnits.governmentEntityId)).innerJoin(planningBudgetUnitLabels, eq(planningBudgetUnitLabels.id, planningEntityUnits.budgetUnitId)).where(and(eq(planningEntityUnits.governmentEntityId, governmentEntityId), eq(planningEntityUnits.budgetUnitId, budgetUnitId))).limit(1))[0];
}
export async function readPayableNoticeGuide(database: DatabaseExecutor, id: string) {
  const [row] = await database.select({ guide: taxGuides, assessment: taxAssessments }).from(taxGuides).innerJoin(taxAssessments, eq(taxAssessments.id, taxGuides.assessmentId)).where(and(eq(taxGuides.id, id), notInArray(taxGuides.status, ["Cancelada", "Paga"]), gte(taxGuides.dueDate, new Date()))).limit(1);
  if (!row) return null;
  const payments = (await readDebtPayments(database, [row.assessment.id])).filter(payment => payment.payment.guideId === id);
  return { ...row.guide, assessment: row.assessment, payments };
}
