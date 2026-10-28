import { and, asc, count, desc, eq, exists, getTableColumns, gte, inArray, isNull, lte, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "@/db/transaction";
import type { WorksEnforcementHistory, WorksEnforcementSearch, WorksPageAccess } from "@/lib/contracts/works-pages";
import { pageEnforcementCases as cases, pageEnforcementActs as acts, pageEnforcementVisits as visits, pageEnforcementAssignments as assignments, pageEnforcementAcknowledgements as science, pageEnforcementEvidence as evidence } from "@/db/schema/works-pages";
import { constructionStaffRoles as staff } from "@/db/schema/construction-portal";
import { processes, processDocuments } from "@/db/schema/processes";
import { documents, realEstates } from "@/db/schema/registry";
import { departments, employees } from "@/db/schema/administration";
import { enforcementActLabels, enforcementServiceLabels } from "@/lib/obras/construction-enforcement-policy";
import { contains, departmentScope, newest, worksPage } from "./shared";

const relatedActs = alias(acts, "relatedAct");
function scope(access: WorksPageAccess) { return departmentScope(access, processes.currentDepartmentId, true); }

export async function loadPageEnforcementList(database: DatabaseExecutor, access: WorksPageAccess, input: WorksEnforcementSearch & { page?: string }) {
  const where = and(scope(access), input.status ? eq(cases.status, input.status) : undefined, input.locationType ? eq(cases.locationType, input.locationType) : undefined, input.permitStatus ? eq(cases.permitStatus, input.permitStatus) : undefined,
    input.q ? or(contains(processes.protocolNumber, input.q), contains(realEstates.municipalInsc, input.q), contains(realEstates.streetName, input.q)) : undefined);
  const total = (await database.select({ value: count() }).from(cases).innerJoin(processes, eq(processes.id, cases.processId)).innerJoin(realEstates, eq(realEstates.id, cases.realEstateId)).where(where))[0].value;
  const page = worksPage(input.page, total);
  const rows = await database.select({ ...getTableColumns(cases), protocolNumber: processes.protocolNumber, processStatus: processes.status, currentDepartment: { name: departments.name }, realEstate: { municipalInsc: realEstates.municipalInsc, streetName: realEstates.streetName, number: realEstates.number } }).from(cases).innerJoin(processes, eq(processes.id, cases.processId)).innerJoin(realEstates, eq(realEstates.id, cases.realEstateId)).leftJoin(departments, eq(departments.id, processes.currentDepartmentId)).where(where).orderBy(...newest(cases.createdAt, cases.id)).offset((page - 1) * 20).limit(20);
  return { total, page, cases: rows.map(({ protocolNumber, processStatus, currentDepartment, ...row }) => ({ ...row, process: { protocolNumber, status: processStatus, currentDepartment } })) };
}
export function listPageEnforcementProperties(database: DatabaseExecutor, q: string) {
  return database.select({ id: realEstates.id, municipalInsc: realEstates.municipalInsc, streetName: realEstates.streetName, number: realEstates.number }).from(realEstates).where(q ? or(contains(realEstates.municipalInsc, q), contains(realEstates.streetName, q), contains(realEstates.registration, q)) : undefined).orderBy(asc(realEstates.municipalInsc)).limit(100);
}
export async function findPageEnforcement(database: DatabaseExecutor, access: WorksPageAccess, id: string) {
  const [row] = await database.select({ record: cases, realEstate: getTableColumns(realEstates), process: getTableColumns(processes), currentDepartment: { name: departments.name } }).from(cases).innerJoin(processes, eq(processes.id, cases.processId)).innerJoin(realEstates, eq(realEstates.id, cases.realEstateId)).leftJoin(departments, eq(departments.id, processes.currentDepartmentId)).where(and(eq(cases.id, id), scope(access))).limit(1);
  if (!row) return null;
  const documentRows = await database.select({ document: { id: documents.id, title: documents.title } }).from(processDocuments).innerJoin(documents, eq(documents.id, processDocuments.documentId)).where(eq(processDocuments.processId, row.process.id));
  return { ...row.record, realEstate: row.realEstate, process: { ...row.process, currentDepartment: row.currentDepartment, documents: documentRows } };
}
function listEvidence(database: DatabaseExecutor, input: { actIds?: string[]; visitIds?: string[]; scienceIds?: string[] }) {
  return database.select({ ...getTableColumns(evidence), document: { title: documents.title } }).from(evidence).innerJoin(documents, eq(documents.id, evidence.documentId)).where(or(input.actIds ? inArray(evidence.actId, input.actIds) : undefined, input.visitIds ? inArray(evidence.visitId, input.visitIds) : undefined, input.scienceIds ? inArray(evidence.acknowledgementId, input.scienceIds) : undefined));
}
export async function loadPageEnforcementHistory(database: DatabaseExecutor, id: string, values: WorksEnforcementHistory) {
  const ackForAct = database.select({ id: science.id }).from(science).where(eq(science.actId, acts.id));
  const evidenceForVisit = database.select({ id: evidence.id }).from(evidence).where(eq(evidence.visitId, visits.id));
  const actWhere = and(eq(acts.caseId, id), values.actQ ? or(contains(acts.number, values.actQ), contains(acts.reason, values.actQ), contains(acts.legalBasis, values.actQ), contains(acts.createdBy, values.actQ)) : undefined, values.actKind in enforcementActLabels ? eq(acts.kind, values.actKind) : undefined, values.actScience === "PENDING" ? notExists(ackForAct) : values.actScience === "RECORDED" ? exists(ackForAct) : undefined);
  const visitWhere = and(eq(visits.caseId, id), values.visitQ ? or(contains(visits.findings, values.visitQ), contains(visits.createdBy, values.visitQ)) : undefined, values.visitEvidence === "PHOTO" ? exists(database.select({ id: evidence.id }).from(evidence).where(and(eq(evidence.visitId, visits.id), eq(evidence.kind, "PHOTO")))) : values.visitEvidence === "NONE" ? notExists(evidenceForVisit) : undefined);
  const assignmentWhere = and(eq(assignments.caseId, id), values.assignmentQ ? or(contains(assignments.reason, values.assignmentQ), contains(assignments.createdBy, values.assignmentQ)) : undefined, values.assignmentEmployee ? eq(assignments.employeeId, values.assignmentEmployee) : undefined);
  const scienceWhere = and(eq(acts.caseId, id), values.scienceQ ? or(contains(science.recipient, values.scienceQ), contains(science.notes, values.scienceQ), contains(acts.number, values.scienceQ)) : undefined, values.scienceMethod in enforcementServiceLabels ? eq(science.method, values.scienceMethod) : undefined);
  const [actTotal, visitTotal, assignmentTotal, scienceTotal] = await Promise.all([
    database.select({ value: count() }).from(acts).where(actWhere).then(rows => rows[0].value),
    database.select({ value: count() }).from(visits).where(visitWhere).then(rows => rows[0].value),
    database.select({ value: count() }).from(assignments).where(assignmentWhere).then(rows => rows[0].value),
    database.select({ value: count() }).from(science).innerJoin(acts, eq(acts.id, science.actId)).where(scienceWhere).then(rows => rows[0].value),
  ]);
  const pages = { act: worksPage(values.actPage, actTotal), visit: worksPage(values.visitPage, visitTotal), assignment: worksPage(values.assignmentPage, assignmentTotal), science: worksPage(values.sciencePage, scienceTotal) };
  const [actRows, visitRows, assignmentRows, scienceRows, actOptions, visitOptions, assignmentOptions] = await Promise.all([
    database.select({ ...getTableColumns(acts), relatedAct: { number: relatedActs.number }, acknowledgements: sql<number>`(SELECT count(*) FROM ${science} WHERE ${science.actId}=${acts.id})`.mapWith(Number) }).from(acts).leftJoin(relatedActs, eq(relatedActs.id, acts.relatedActId)).where(actWhere).orderBy(desc(acts.issuedAt), desc(acts.createdAt), asc(acts.id)).offset((pages.act - 1) * 20).limit(20),
    database.select().from(visits).where(visitWhere).orderBy(...newest(visits.visitedAt, visits.id)).offset((pages.visit - 1) * 20).limit(20),
    database.select().from(assignments).where(assignmentWhere).orderBy(...newest(assignments.createdAt, assignments.id)).offset((pages.assignment - 1) * 20).limit(20),
    database.select({ ...getTableColumns(science), act: { number: acts.number } }).from(science).innerJoin(acts, eq(acts.id, science.actId)).where(scienceWhere).orderBy(...newest(science.acknowledgedAt, science.id)).offset((pages.science - 1) * 20).limit(20),
    database.select({ id: acts.id, kind: acts.kind, number: acts.number }).from(acts).where(eq(acts.caseId, id)).orderBy(...newest(acts.issuedAt, acts.id)),
    database.select({ id: visits.id, visitedAt: visits.visitedAt, findings: visits.findings }).from(visits).where(eq(visits.caseId, id)).orderBy(...newest(visits.visitedAt, visits.id)),
    database.select({ employeeId: assignments.employeeId }).from(assignments).where(eq(assignments.caseId, id)).groupBy(assignments.employeeId),
  ]);
  const evidenceRows = await listEvidence(database, { actIds: actRows.map(row => row.id), visitIds: visitRows.map(row => row.id), scienceIds: scienceRows.map(row => row.id) });
  return { actTotal, visitTotal, assignmentTotal, scienceTotal, pages, actOptions, visitOptions, assignmentOptions, assignments: assignmentRows,
    acts: actRows.map(({ acknowledgements, ...row }) => ({ ...row, _count: { acknowledgements }, evidence: evidenceRows.filter(entry => entry.actId === row.id) })),
    visits: visitRows.map(row => ({ ...row, evidence: evidenceRows.filter(entry => entry.visitId === row.id) })),
    science: scienceRows.map(row => ({ ...row, evidence: evidenceRows.filter(entry => entry.acknowledgementId === row.id) })),
  };
}
export function listPageInspectors(database: DatabaseExecutor, departmentId: string, day: Date) {
  return database.select({ employeeId: staff.employeeId, employee: { name: employees.name } }).from(staff).innerJoin(employees, eq(employees.id, staff.employeeId)).innerJoin(departments, eq(departments.id, staff.departmentId)).where(and(eq(staff.departmentId, departmentId), eq(staff.role, "INSPECTOR"), eq(staff.isActive, true), lte(staff.startsAt, day), or(isNull(staff.endsAt), gte(staff.endsAt, day)), eq(employees.isActive, true), eq(employees.departmentId, departmentId), eq(departments.isActive, true)));
}
export async function findPageEnforcementPrint(database: DatabaseExecutor, access: WorksPageAccess, id: string, actId: string) {
  const [row] = await database.select({ record: cases, process: { protocolNumber: processes.protocolNumber } }).from(cases).innerJoin(processes, eq(processes.id, cases.processId)).where(and(eq(cases.id, id), scope(access))).limit(1);
  if (!row) return null;
  const actRows = await database.select({ ...getTableColumns(acts), relatedAct: { number: relatedActs.number } }).from(acts).leftJoin(relatedActs, eq(relatedActs.id, acts.relatedActId)).where(and(eq(acts.caseId, id), eq(acts.id, actId)));
  const ackRows = await database.select().from(science).where(inArray(science.actId, actRows.map(act => act.id))).orderBy(asc(science.acknowledgedAt));
  const evidenceRows = await database.select().from(evidence).where(or(inArray(evidence.actId, actRows.map(act => act.id)), inArray(evidence.acknowledgementId, ackRows.map(ack => ack.id))));
  return { ...row.record, process: row.process, acts: actRows.map(act => ({ ...act, evidence: evidenceRows.filter(entry => entry.actId === act.id), acknowledgements: ackRows.filter(ack => ack.actId === act.id).map(ack => ({ ...ack, evidence: evidenceRows.filter(entry => entry.acknowledgementId === ack.id) })) })) };
}
