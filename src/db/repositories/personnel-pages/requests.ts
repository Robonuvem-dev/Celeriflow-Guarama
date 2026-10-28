import { and, asc, count, desc, eq, inArray, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../transaction';
import { databaseTimestamp } from '../../temporal';
import { hrIntegrationEvents, hrPortalRequests } from '../../schema/personnel-workforce';
import { hrPayrollRules, hrPayrollRuleSets } from '../../schema/personnel-configuration';
import { employees } from '../../schema/administration';
import { processTypes, processSubjects, processes } from '../../schema/processes';
import { AccessError, canPerformModuleOperation, isSystemAdministrator } from '@/lib/platform/tenant-context';
import type { PermissionUser } from '@/lib/contracts/identity';
import type { HrPortalRequest, IntegrationEvent, RecruitmentApplication } from '@/lib/contracts/personnel-pages';
import { readPersonnelBudgetUnits } from './catalog';

export function personnelPageNumber(raw: string | undefined, total: number, size = 20): number {
  return Math.min(Math.max(1, Number.parseInt(raw || '1') || 1), Math.max(1, Math.ceil(total / size)));
}
async function requestPage(db: DatabaseExecutor, condition: SQL | undefined, requestedPage?: string, oldestFirst = false): Promise<{ rows: HrPortalRequest[]; page: number; total: number }> {
  const [{ total }] = await db.select({ total: count() }).from(hrPortalRequests).where(condition);
  const page = personnelPageNumber(requestedPage, total);
  const rows = await db.select().from(hrPortalRequests).where(condition).orderBy(oldestFirst ? asc(hrPortalRequests.createdAt) : desc(hrPortalRequests.createdAt), asc(hrPortalRequests.id)).limit(20).offset((page - 1) * 20);
  return { rows, page, total };
}
async function eventPage(db: DatabaseExecutor, condition: SQL | undefined, requestedPage?: string): Promise<{ events: IntegrationEvent[]; page: number; total: number }> {
  const [{ total }] = await db.select({ total: count() }).from(hrIntegrationEvents).where(condition);
  const page = personnelPageNumber(requestedPage, total);
  const events = await db.select().from(hrIntegrationEvents).where(condition).orderBy(desc(hrIntegrationEvents.createdAt), asc(hrIntegrationEvents.id)).limit(20).offset((page - 1) * 20);
  return { events, page, total };
}
export function readRequestEmployees(db: DatabaseExecutor, ids: string[]): Promise<Array<{ id: string; name: string; registration: string | null }>> {
  return db.select({ id: employees.id, name: employees.name, registration: employees.registration }).from(employees).where(inArray(employees.id, ids));
}
export async function readAdvancesPage(db: DatabaseExecutor, user: PermissionUser, requestedPage?: string) {
  const scope = isSystemAdministrator(user) ? undefined : sql`${hrPortalRequests.payload} #> '{input,budgetUnitId}' = ANY(${sql.param(user.allowedBudgetUnitIds.map(id => JSON.stringify(id)))}::jsonb[])`;
  const data = await requestPage(db, and(eq(hrPortalRequests.kind, 'ADIANTAMENTO'), scope), requestedPage);
  const units = await readPersonnelBudgetUnits(db, user, 'code');
  const events = await db.select({ sourceKey: hrIntegrationEvents.sourceKey, payload: hrIntegrationEvents.payload }).from(hrIntegrationEvents).where(inArray(hrIntegrationEvents.sourceKey, data.rows.map(row => `DIARIA:PROCESSO:${row.id}`)));
  return { ...data, units, events };
}
export async function readTravelAllowancesPage(db: DatabaseExecutor, user: PermissionUser, requestedPage?: string) {
  const scope = isSystemAdministrator(user) ? undefined : sql`${hrPortalRequests.payload} #> '{input,budgetUnitId}' = ANY(${sql.param(user.allowedBudgetUnitIds.map(id => JSON.stringify(id)))}::jsonb[])`;
  const data = await requestPage(db, and(eq(hrPortalRequests.kind, 'DIARIA'), scope), requestedPage);
  const employeeRows = await readRequestEmployees(db, [...new Set(data.rows.map(row => row.employeeId))]);
  const rules = await db.select({ id: hrPayrollRules.id, name: hrPayrollRules.name }).from(hrPayrollRules).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRules.ruleSetId)).where(and(eq(hrPayrollRules.code, 'DIARIAS_MUNICIPAIS'), eq(hrPayrollRules.isActive, true), eq(hrPayrollRuleSets.isDemo, false), eq(hrPayrollRuleSets.scope, 'PRODUCAO'), eq(hrPayrollRuleSets.status, 'ATIVA'))).orderBy(asc(hrPayrollRules.id));
  const units = await readPersonnelBudgetUnits(db, user, 'code');
  const expenses = (await db.execute<{ id: string; sourceId: string | null; status: string }>(sql`SELECT id,"sourceId",status FROM "Expense" WHERE "sourceModule"='RH' AND "sourceType"='TRAVEL_ALLOWANCE' AND "sourceId"=ANY(${sql.param(data.rows.map(row => row.id))}::text[])`)).rows;
  const processEvents = await db.select({ sourceKey: hrIntegrationEvents.sourceKey, payload: hrIntegrationEvents.payload }).from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.eventType, 'DIARIA_PROCESSO_ABERTO'), inArray(hrIntegrationEvents.sourceKey, data.rows.map(row => `DIARIA:PROCESSO:${row.id}`))));
  // "some published definition whose every stage belongs to the units" includes
  // the vacuous case of a published definition with no stages, as before.
  const types = await db.select({ id: processTypes.id, name: processTypes.name }).from(processTypes).where(and(eq(processTypes.isActive, true), eq(processTypes.genericWorkflowEnabled, true), sql`EXISTS (SELECT 1 FROM "GenericProcessWorkflowDefinition" w WHERE w."processTypeId"=${processTypes.id} AND w.status='PUBLISHED' AND NOT EXISTS (SELECT 1 FROM "GenericProcessWorkflowStage" s JOIN "Department" d ON d.id=s."departmentId" WHERE s."definitionId"=w.id AND NOT (d."secretariatId"=ANY(${sql.param(units.map(unit => unit.secretariatId))}::text[]))))`)).orderBy(asc(processTypes.name));
  const subjects = types.length ? await db.select({ id: processSubjects.id, name: processSubjects.name, processTypeId: processSubjects.processTypeId }).from(processSubjects).where(and(inArray(processSubjects.processTypeId, types.map(type => type.id)), eq(processSubjects.isActive, true))).orderBy(asc(processSubjects.name)) : [];
  const reports = new Set((await db.select({ sourceKey: hrIntegrationEvents.sourceKey }).from(hrIntegrationEvents).where(inArray(hrIntegrationEvents.sourceKey, data.rows.map(row => `DIARIA:PRESTACAO:${row.id}`)))).map(row => row.sourceKey));
  return { ...data, employees: employeeRows, rules, units, expenses, processEvents, processTypes: types.map(type => ({ ...type, subjects: subjects.filter(subject => subject.processTypeId === type.id) })), reports };
}
export function readFunctionalPublicationsPage(db: DatabaseExecutor, user: PermissionUser, requestedPage?: string) {
  return eventPage(db, and(eq(hrIntegrationEvents.domain, 'PORTAL'), eq(hrIntegrationEvents.eventType, 'DOCUMENTO_FUNCIONAL_DISPONIBILIZADO'), isSystemAdministrator(user) ? undefined : sql`${hrIntegrationEvents.payload} #> '{budgetUnitId}' = ANY(${sql.param(user.allowedBudgetUnitIds.map(id => JSON.stringify(id)))}::jsonb[])`), requestedPage);
}
export function readEsocialEventsPage(db: DatabaseExecutor, requestedPage?: string) {
  return eventPage(db, or(eq(hrIntegrationEvents.domain, 'ESOCIAL'), and(eq(hrIntegrationEvents.domain, 'AUDITORIA'), eq(hrIntegrationEvents.eventType, 'OBRIGACAO_ARQUIVO_GERADO'))), requestedPage);
}
export async function readOccurrencesPage(db: DatabaseExecutor, input: { page?: string; contractId?: string; type?: string }) {
  const data = await eventPage(db, and(eq(hrIntegrationEvents.eventType, 'OCORRENCIA_FUNCIONAL_REGISTRADA'), input.contractId ? sql`${hrIntegrationEvents.payload} #> '{input,contractId}' = ${JSON.stringify(input.contractId)}::jsonb` : undefined, input.type ? sql`${hrIntegrationEvents.payload} #> '{input,type}' = ${JSON.stringify(input.type)}::jsonb` : undefined), input.page);
  const cancellations = await db.select({ sourceKey: hrIntegrationEvents.sourceKey, payload: hrIntegrationEvents.payload }).from(hrIntegrationEvents).where(inArray(hrIntegrationEvents.sourceKey, data.events.map(row => `OCORRENCIA:CANCELAMENTO:${row.id}`)));
  return { rows: data.events, page: data.page, total: data.total, cancellations };
}
export function readGeneratedFunctionalDocuments(db: DatabaseExecutor): Promise<IntegrationEvent[]> {
  return db.select().from(hrIntegrationEvents).where(eq(hrIntegrationEvents.eventType, 'DOCUMENTO_FUNCIONAL_GERADO')).orderBy(desc(hrIntegrationEvents.createdAt), asc(hrIntegrationEvents.id));
}
export async function readGeneralRequestsPage(db: DatabaseExecutor, user: PermissionUser, status: string, requestedPage?: string) {
  const units = isSystemAdministrator(user) ? [] : await readPersonnelBudgetUnits(db, user);
  const scopedEmployees = isSystemAdministrator(user) ? [] : await db.select({ id: employees.id }).from(employees).where(inArray(employees.secretariatId, units.map(unit => unit.secretariatId)));
  const where = and(eq(hrPortalRequests.status, status), notInArray(hrPortalRequests.kind, ['ACESSO_PORTAL', 'FUNCIONAL_SOLICITACAO_RH', 'FUNCIONAL_FERIAS', 'FUNCIONAL_AJUSTE_PONTO', 'AVALIACAO_FUNCIONAL', 'CAPACITACAO_INSCRICAO']), isSystemAdministrator(user) ? undefined : inArray(hrPortalRequests.employeeId, scopedEmployees.map(employee => employee.id)));
  const data = await requestPage(db, where, requestedPage, true);
  const employeeRows = await readRequestEmployees(db, data.rows.map(row => row.employeeId));
  return { ...data, employees: employeeRows };
}
export function readFunctionalRequestsPage(db: DatabaseExecutor, user: PermissionUser, status: string, requestedPage?: string) {
  return requestPage(db, and(eq(hrPortalRequests.status, status), sql`${hrPortalRequests.payload} #> '{origin}' = '"REQUERIMENTO_FUNCIONAL"'::jsonb`, isSystemAdministrator(user) ? undefined : sql`${hrPortalRequests.payload} #> '{configuration,budgetUnitId}' = ANY(${sql.param(user.allowedBudgetUnitIds.map(id => JSON.stringify(id)))}::jsonb[])`), requestedPage, true);
}
export function readRequestProcesses(db: DatabaseExecutor, ids: string[]): Promise<Array<{ id: string; protocolNumber: string; currentDepartmentId: string | null; status: string }>> {
  return db.select({ id: processes.id, protocolNumber: processes.protocolNumber, currentDepartmentId: processes.currentDepartmentId, status: processes.status }).from(processes).where(inArray(processes.id, ids));
}
export async function readPublicServiceDescriptions(db: DatabaseExecutor, ids: string[]): Promise<Array<{ id: string; name: string; description: string; requirements: string | null; steps: string | null; deadline: string | null; isActive: boolean }>> {
  return (await db.execute<{ id: string; name: string; description: string; requirements: string | null; steps: string | null; deadline: string | null; isActive: boolean }>(sql`SELECT id,name,description,requirements,steps,deadline,"isActive" FROM "PublicService" WHERE id=ANY(${sql.param(ids)}::text[])`)).rows;
}
export async function readRecruitmentApplicationReview(db: DatabaseExecutor, user: PermissionUser, requestedPage = 1): Promise<{ rows: RecruitmentApplication[]; page: number; total: number }> {
  if (!canPerformModuleOperation(user, 'RH', 'update')) throw new AccessError('Sem autorização para analisar inscrições.', 403);
  // This source originally used #>> (text), including its JSON text extraction
  // semantics. Other queues above deliberately retain their jsonb equality.
  const scope = isSystemAdministrator(user) ? sql`true` : sql`snapshot #>> '{policy,budgetUnitId}' = ANY(${sql.param(user.allowedBudgetUnitIds)}::text[])`;
  const [{ total }] = (await db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "HrRecruitmentApplication" WHERE ${scope}`)).rows;
  const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(total / 20)));
  type RawApplication = Omit<RecruitmentApplication, 'createdAt' | 'decidedAt'> & { createdAt: string | Date; decidedAt: string | Date | null };
  const rows = (await db.execute<RawApplication>(sql`SELECT id,"noticeRuleId","applicantUserId",cpf,"roleCode",number,status,snapshot,"requestHash",decision,"decidedById","createdAt","decidedAt" FROM "HrRecruitmentApplication" WHERE ${scope} ORDER BY "createdAt" ASC,id ASC LIMIT 20 OFFSET ${(page - 1) * 20}`)).rows;
  return { rows: rows.map(row => ({ ...row, createdAt: databaseTimestamp(row.createdAt), decidedAt: row.decidedAt === null ? null : databaseTimestamp(row.decidedAt) })), page, total };
}
