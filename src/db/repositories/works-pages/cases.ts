import { and, asc, count, desc, eq, exists, getTableColumns, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { WorksCaseDetail, WorksCaseListRecord, WorksCaseSearch, WorksPageAccess } from "@/lib/contracts/works-pages";
import { constructionCases as cases, constructionCaseProperties as properties, constructionConfigVersions as configs, constructionParticipants as participants, constructionPortalIdentities as identities, constructionProfessionals as professionals, constructionReviews as reviews, constructionViabilityResults as viability } from "@/db/schema/construction-core";
import { constructionMessages as messages, constructionStaffRoles as staff, constructionTerms as terms } from "@/db/schema/construction-portal";
import { processes, processDocuments } from "@/db/schema/processes";
import { documents, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { departments, employees } from "@/db/schema/administration";
import { documentVersions } from "@/db/schema/document-workflow";
import { pageConsultations as consultations, pageConsultationResponses as responses, pageExtractions as extractions, pageReplacements as replacements } from "@/db/schema/works-pages";
import { contains, departmentScope, newest, worksPage } from "./shared";

export function pageCaseScope(access: WorksPageAccess) { return departmentScope(access, processes.currentDepartmentId); }
export function pageCaseFilter(access: WorksPageAccess, input: WorksCaseSearch = {}) {
  return and(pageCaseScope(access), input.id ? eq(cases.id, input.id) : undefined, input.category ? eq(cases.category, input.category) : undefined,
    input.q ? or(contains(processes.protocolNumber, input.q), sql`EXISTS (SELECT 1 FROM ${people} WHERE ${people.id}=${processes.personId} AND ${contains(people.fullName, input.q)})`, sql`EXISTS (SELECT 1 FROM ${companies} WHERE ${companies.id}=${processes.companyId} AND ${contains(companies.corporateName, input.q)})`) : undefined);
}

export async function loadPageCaseList(database: DatabaseExecutor, access: WorksPageAccess, input: WorksCaseSearch & { page?: string }): Promise<{ total: number; page: number; cases: WorksCaseListRecord[] }> {
  const where = pageCaseFilter(access, input);
  const total = (await database.select({ value: count() }).from(cases).innerJoin(processes, eq(processes.id, cases.processId)).where(where))[0].value;
  const page = worksPage(input.page, total);
  const rows = await database.select({ id: cases.id, category: cases.category, locationType: cases.locationType, regularization: cases.regularization, totalArea: cases.totalArea,
    protocolNumber: processes.protocolNumber, status: processes.status, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName }, currentDepartment: { name: departments.name } })
    .from(cases).innerJoin(processes, eq(processes.id, cases.processId)).leftJoin(people, eq(people.id, processes.personId)).leftJoin(companies, eq(companies.id, processes.companyId)).leftJoin(departments, eq(departments.id, processes.currentDepartmentId)).where(where).orderBy(...newest(cases.createdAt, cases.id)).offset((page - 1) * 20).limit(20);
  return { total, page, cases: rows.map(({ protocolNumber, status, person, company, currentDepartment, ...record }) => ({ ...record, process: { protocolNumber, status, person, company, currentDepartment } })) };
}
export function listPageCaseOptions(database: DatabaseExecutor, access: WorksPageAccess, options: { category?: string; limit?: number; stable?: boolean } = {}) {
  return database.select({ id: cases.id, process: { protocolNumber: processes.protocolNumber } }).from(cases).innerJoin(processes, eq(processes.id, cases.processId)).where(and(pageCaseScope(access), options.category ? eq(cases.category, options.category) : undefined)).orderBy(...(options.stable ? newest(cases.createdAt, cases.id) : [desc(cases.createdAt)])).limit(options.limit ?? 2_147_483_647);
}
export async function findPageCaseDetail(database: DatabaseExecutor, access: WorksPageAccess, id: string): Promise<WorksCaseDetail | null> {
  const [row] = await database.select({ record: cases, configuration: configs, processId: processes.id, protocolNumber: processes.protocolNumber, status: processes.status, description: processes.description, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName }, currentDepartment: { name: departments.name } }).from(cases)
    .innerJoin(processes, eq(processes.id, cases.processId)).innerJoin(configs, eq(configs.id, cases.configurationId)).leftJoin(people, eq(people.id, processes.personId)).leftJoin(companies, eq(companies.id, processes.companyId)).leftJoin(departments, eq(departments.id, processes.currentDepartmentId)).where(and(eq(cases.id, id), pageCaseScope(access))).limit(1);
  if (!row) return null;
  const propertyRows = await database.select({ id: properties.id, realEstateId: properties.realEstateId, cadastralSnapshot: properties.cadastralSnapshot }).from(properties).where(eq(properties.caseId, id));
  return { ...row.record, configuration: row.configuration, process: { id: row.processId, protocolNumber: row.protocolNumber, status: row.status, description: row.description, person: row.person, company: row.company, currentDepartment: row.currentDepartment }, properties: propertyRows };
}
export async function pageCaseProtocol(database: DatabaseExecutor, access: WorksPageAccess, id: string) {
  return (await database.select({ process: { protocolNumber: processes.protocolNumber } }).from(cases).innerJoin(processes, eq(processes.id, cases.processId)).where(and(eq(cases.id, id), pageCaseScope(access))).limit(1))[0] ?? null;
}
export async function loadPageEvaluations(database: DatabaseExecutor, caseId: string, requestedPage?: string) {
  const total = (await database.select({ value: count() }).from(viability).where(eq(viability.caseId, caseId)))[0].value;
  const page = worksPage(requestedPage, total);
  const evaluations = await database.select({ id: viability.id, outcome: viability.outcome, calculationSnapshot: viability.calculationSnapshot, createdAt: viability.createdAt }).from(viability).where(eq(viability.caseId, caseId)).orderBy(...newest(viability.createdAt, viability.id)).offset((page - 1) * 20).limit(20);
  return { total, page, evaluations };
}
export async function loadPageReviews(database: DatabaseExecutor, caseId: string, requestedPage?: string) {
  const reviewTotal = (await database.select({ value: count() }).from(reviews).where(eq(reviews.caseId, caseId)))[0].value;
  const reviewPage = worksPage(requestedPage, reviewTotal);
  const rows = await database.select().from(reviews).where(eq(reviews.caseId, caseId)).orderBy(...newest(reviews.createdAt, reviews.id)).offset((reviewPage - 1) * 20).limit(20);
  return { reviewTotal, reviewPage, reviews: rows };
}
export function listPageProcessDocuments(database: DatabaseExecutor, processId: string, finalVersion = false, ordered = false) {
  const query = database.select({ id: documents.id, title: documents.title }).from(documents).where(and(inArray(documents.status, ["Válido", "Assinado"]), exists(database.select({ id: processDocuments.id }).from(processDocuments).where(and(eq(processDocuments.documentId, documents.id), eq(processDocuments.processId, processId)))), finalVersion ? exists(database.select({ id: documentVersions.id }).from(documentVersions).where(and(eq(documentVersions.documentId, documents.id), inArray(documentVersions.status, ["FINAL", "SIGNED"])))) : undefined));
  return ordered ? query.orderBy(asc(documents.title)) : query;
}
export async function pageProcessScope(database: DatabaseExecutor, processId: string) {
  const [row] = await database.select({ currentDepartmentId: processes.currentDepartmentId }).from(processes).where(eq(processes.id, processId)).limit(1);
  if (!row) throw new Error("Processo vinculado indisponível.");
  return row;
}
export async function loadPageReplacements(database: DatabaseExecutor, caseId: string, requestedPage?: string) {
  const assignmentTotal = (await database.select({ value: count() }).from(replacements).where(eq(replacements.caseId, caseId)))[0].value;
  const assignmentPage = worksPage(requestedPage, assignmentTotal);
  const rows = await database.select().from(replacements).where(eq(replacements.caseId, caseId)).orderBy(...newest(replacements.createdAt, replacements.id)).offset((assignmentPage - 1) * 20).limit(20);
  return { assignmentTotal, assignmentPage, replacements: rows };
}
export function listPageAnalysts(database: DatabaseExecutor, departmentId: string, today: Date) {
  return database.select({ id: employees.id, name: employees.name }).from(employees).innerJoin(departments, eq(departments.id, employees.departmentId)).where(and(eq(employees.isActive, true), eq(employees.departmentId, departmentId), eq(departments.isActive, true), exists(database.select({ id: staff.id }).from(staff).where(and(eq(staff.employeeId, employees.id), eq(staff.departmentId, departmentId), inArray(staff.role, ["ANALYST", "MANAGER"]), eq(staff.isActive, true), lte(staff.startsAt, today), or(isNull(staff.endsAt), gte(staff.endsAt, today))))))).orderBy(asc(employees.name));
}
export async function loadPageMessages(database: DatabaseExecutor, caseId: string, requestedPage?: string) {
  const messageTotal = (await database.select({ value: count() }).from(messages).where(eq(messages.caseId, caseId)))[0].value;
  const messagePage = worksPage(requestedPage, messageTotal);
  const conversation = await database.select({ id: messages.id, content: messages.content, createdAt: messages.createdAt, identityId: messages.identityId, documentId: messages.documentId }).from(messages).where(eq(messages.caseId, caseId)).orderBy(...newest(messages.createdAt, messages.id)).offset((messagePage - 1) * 20).limit(20);
  return { messageTotal, messagePage, conversation };
}
export async function loadPageParticipations(database: DatabaseExecutor, access: WorksPageAccess, q: string, requestedPage?: string) {
  const where = and(pageCaseScope(access), q ? contains(processes.protocolNumber, q) : undefined);
  const total = (await database.select({ value: count() }).from(participants).innerJoin(cases, eq(cases.id, participants.caseId)).innerJoin(processes, eq(processes.id, cases.processId)).where(where))[0].value;
  const page = worksPage(requestedPage, total);
  const rows = await database.select({ ...getTableColumns(participants), protocolNumber: processes.protocolNumber, fullName: people.fullName }).from(participants).innerJoin(cases, eq(cases.id, participants.caseId)).innerJoin(processes, eq(processes.id, cases.processId)).innerJoin(identities, eq(identities.id, participants.identityId)).innerJoin(professionals, eq(professionals.id, identities.professionalId)).innerJoin(people, eq(people.id, professionals.personId)).where(where).orderBy(desc(participants.startsAt), asc(participants.id)).offset((page - 1) * 20).limit(20);
  return { total, page, participants: rows.map(({ fullName, protocolNumber, ...record }) => ({ ...record, identity: { professional: { person: { fullName } } }, case: { process: { protocolNumber } } })) };
}
export async function latestPageTerm(database: DatabaseExecutor) {
  return (await database.select({ version: terms.version, text: terms.text }).from(terms).orderBy(desc(terms.version)).limit(1))[0] ?? null;
}
export async function loadPageConsultations(database: DatabaseExecutor, access: WorksPageAccess, input: { q: string; status: string; page?: string }) {
  const where = and(pageCaseScope(access), input.q ? contains(processes.protocolNumber, input.q) : undefined, input.status === "answered" ? sql`${responses.id} IS NOT NULL` : input.status === "pending" ? isNull(responses.id) : undefined);
  const total = (await database.select({ value: count() }).from(consultations).innerJoin(cases, eq(cases.id, consultations.caseId)).innerJoin(processes, eq(processes.id, cases.processId)).leftJoin(responses, eq(responses.consultationId, consultations.id)).where(where))[0].value;
  const page = worksPage(input.page, total);
  const rows = await database.select({ ...getTableColumns(consultations), response: getTableColumns(responses), protocolNumber: processes.protocolNumber }).from(consultations).innerJoin(cases, eq(cases.id, consultations.caseId)).innerJoin(processes, eq(processes.id, cases.processId)).leftJoin(responses, eq(responses.consultationId, consultations.id)).where(where).orderBy(...newest(consultations.createdAt, consultations.id)).offset((page - 1) * 20).limit(20);
  return { total, page, items: rows.map(({ protocolNumber, ...row }) => ({ ...row, case: { process: { protocolNumber } } })) };
}
export async function loadPageExtractions(database: DatabaseExecutor, caseId: string, input: { q: string; engine: string; status: string; page?: string }) {
  const where = and(eq(extractions.caseId, caseId), input.engine === "all" ? undefined : eq(extractions.engine, input.engine), input.status === "all" ? undefined : eq(extractions.status, input.status), input.q ? or(contains(extractions.filename, input.q), contains(extractions.sourceHash, input.q), contains(extractions.model, input.q)) : undefined);
  const total = (await database.select({ value: count() }).from(extractions).where(where))[0].value;
  const page = worksPage(input.page, total);
  const rows = await database.select().from(extractions).where(where).orderBy(...newest(extractions.createdAt, extractions.id)).offset((page - 1) * 20).limit(20);
  return { total, page, rows };
}
