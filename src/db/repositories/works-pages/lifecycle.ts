import { and, count, desc, eq, getTableColumns, inArray, or } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { WorksInspectionSearch, WorksPageAccess } from "@/lib/contracts/works-pages";
import { constructionCases as cases, constructionCaseProperties as properties, constructionConfigVersions as configs, constructionReviews as reviews } from "@/db/schema/construction-core";
import { constructionPropertyUpdates as updates } from "@/db/schema/construction-lifecycle";
import { pageCompletions as completions, pageInspections as inspections, pageInspectionPlans as plans, pageLifecycleStarts as starts, pageServiceRequests as requests } from "@/db/schema/works-pages";
import { realEstates } from "@/db/schema/registry";
import { processes } from "@/db/schema/processes";
import { pageCaseScope } from "./cases";
import { contains, newest, worksPage } from "./shared";

export async function findPageLifecycle(database: DatabaseExecutor, access: WorksPageAccess, id: string) {
  const [record] = await database.select({ ...getTableColumns(cases), configuration: getTableColumns(configs), process: getTableColumns(processes), inspectionPlan: getTableColumns(plans), lifecycleStart: getTableColumns(starts) }).from(cases).innerJoin(configs, eq(configs.id, cases.configurationId)).innerJoin(processes, eq(processes.id, cases.processId)).leftJoin(plans, eq(plans.caseId, cases.id)).leftJoin(starts, eq(starts.caseId, cases.id)).where(and(eq(cases.id, id), pageCaseScope(access))).limit(1);
  if (!record) return null;
  const [reviewRows, propertyRows] = await Promise.all([
    database.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.caseId, id), eq(reviews.decision, "APPROVED"), eq(reviews.reviewType, "PROJECT"))).orderBy(desc(reviews.createdAt)).limit(1),
    database.select({ ...getTableColumns(properties), realEstate: getTableColumns(realEstates) }).from(properties).innerJoin(realEstates, eq(realEstates.id, properties.realEstateId)).where(eq(properties.caseId, id)),
  ]);
  return { ...record, reviews: reviewRows, properties: propertyRows };
}
export async function loadPageLifecycleHistory(database: DatabaseExecutor, id: string, input: { inspection: WorksInspectionSearch; completion: { q: string; kind?: string }; inspectionPage?: string; completionPage?: string }) {
  const inspectionWhere = and(eq(inspections.caseId, id), input.inspection.status ? eq(inspections.status, input.inspection.status) : undefined, input.inspection.inspectionTypeId ? eq(inspections.inspectionTypeId, input.inspection.inspectionTypeId) : undefined, input.inspection.q ? or(contains(inspections.requestNotes, input.inspection.q), contains(inspections.resultNotes, input.inspection.q)) : undefined);
  const completionWhere = and(eq(completions.caseId, id), input.completion.kind ? eq(completions.kind, input.completion.kind) : undefined, input.completion.q ? or(contains(completions.number, input.completion.q), contains(completions.notes, input.completion.q)) : undefined);
  const [inspectionTotal, completionTotal, totalCompletion] = await Promise.all([
    database.select({ value: count() }).from(inspections).where(inspectionWhere).then(rows => rows[0].value),
    database.select({ value: count() }).from(completions).where(completionWhere).then(rows => rows[0].value),
    database.select({ id: completions.id }).from(completions).where(and(eq(completions.caseId, id), eq(completions.kind, "TOTAL"))).limit(1).then(rows => rows[0] ?? null),
  ]);
  const inspectionPage = worksPage(input.inspectionPage, inspectionTotal), completionPage = worksPage(input.completionPage, completionTotal);
  const [inspectionRows, completionRows] = await Promise.all([
    database.select().from(inspections).where(inspectionWhere).orderBy(desc(inspections.sequence)).offset((inspectionPage - 1) * 20).limit(20),
    database.select({ ...getTableColumns(completions), propertyUpdate: getTableColumns(updates) }).from(completions).leftJoin(updates, eq(updates.completionId, completions.id)).where(completionWhere).orderBy(...newest(completions.createdAt, completions.id)).offset((completionPage - 1) * 20).limit(20),
  ]);
  return { inspectionTotal, completionTotal, totalCompletion, inspectionPage, completionPage, inspections: inspectionRows, completions: completionRows };
}
export function listPageLifecycleRequests(database: DatabaseExecutor, id: string) {
  return database.select({ id: requests.id, kind: requests.kind, notes: requests.notes }).from(requests).where(and(eq(requests.caseId, id), eq(requests.status, "PENDING"), inArray(requests.kind, ["START", "INSPECTION", "COMPLETION"]))).orderBy(requests.createdAt);
}
export async function loadPageInspectionQueue(database: DatabaseExecutor, access: WorksPageAccess, input: WorksInspectionSearch & { page?: string }) {
  const where = and(pageCaseScope(access), input.status ? eq(inspections.status, input.status) : undefined, input.q ? or(contains(inspections.requestNotes, input.q), contains(processes.protocolNumber, input.q)) : undefined);
  const inspectionTotal = (await database.select({ value: count() }).from(inspections).innerJoin(cases, eq(cases.id, inspections.caseId)).innerJoin(processes, eq(processes.id, cases.processId)).where(where))[0].value;
  const inspectionPage = worksPage(input.page, inspectionTotal);
  const rows = await database.select({ ...getTableColumns(inspections), caseIdValue: cases.id, protocolNumber: processes.protocolNumber }).from(inspections).innerJoin(cases, eq(cases.id, inspections.caseId)).innerJoin(processes, eq(processes.id, cases.processId)).where(where).orderBy(...newest(inspections.requestedAt, inspections.id)).offset((inspectionPage - 1) * 20).limit(20);
  return { inspectionTotal, inspectionPage, inspections: rows.map(({ caseIdValue, protocolNumber, ...row }) => ({ ...row, case: { id: caseIdValue, process: { protocolNumber } } })) };
}
