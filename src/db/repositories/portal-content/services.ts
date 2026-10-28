import { and, asc, desc, eq, inArray, isNull, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { accessProfiles, users } from "../../schema/identity";
import { citizenRegistryIdentities, citizenTaxpayerAccesses, processCitizenAccesses } from "../../schema/citizen-access";
import { people } from "../../schema/people";
import { companies, taxpayers, documents } from "../../schema/registry";
import { departments, employees } from "../../schema/administration";
import { processes, processDocuments } from "../../schema/processes";
import { documentVersions, documentClasses, documentSignatures } from "../../schema/document-workflow";
import { infrastructureServices, infrastructureTeams } from "../../schema/infrastructure";
import { assets } from "../../schema/assets";
import { portalServiceConfigurations, publicServices, portalServiceRequests, portalServiceRequestEvents, portalServiceUploads, portalServiceRatings, portalScheduleRequests, portalServiceSchedules } from "../../schema/portal-services";

export async function findActivePortalAccount(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.id, id), eq(users.ativo, true), eq(accessProfiles.ativo, true))).limit(1);
  return row ?? null;
}
export async function readPublishedPortalService(db: DatabaseExecutor, id: string, version?: number) {
  const [row] = await db.select({ service: portalServiceConfigurations, publicService: publicServices }).from(portalServiceConfigurations).innerJoin(publicServices, eq(publicServices.id, portalServiceConfigurations.publicServiceId)).where(and(eq(portalServiceConfigurations.id, id), eq(portalServiceConfigurations.published, true), eq(publicServices.isActive, true), version === undefined ? undefined : eq(portalServiceConfigurations.version, version))).limit(1);
  return row ? { ...row.service, publicService: row.publicService } : null;
}
export async function readPortalRegistryIdentity(db: DatabaseExecutor, actorId: string, activeSource = false) {
  const [row] = await db.select({ personId: citizenRegistryIdentities.personId, companyId: citizenRegistryIdentities.companyId }).from(citizenRegistryIdentities).leftJoin(people, eq(people.id, citizenRegistryIdentities.personId)).leftJoin(companies, eq(companies.id, citizenRegistryIdentities.companyId)).where(and(eq(citizenRegistryIdentities.usuarioId, actorId), isNull(citizenRegistryIdentities.revokedAt), activeSource ? or(eq(people.status, "Ativo"), eq(companies.status, "Ativo")) : undefined)).limit(1);
  return row ?? null;
}
export async function readPortalTaxpayer(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ taxpayer: taxpayers, person: people, company: companies }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(and(eq(taxpayers.id, id), eq(taxpayers.status, "Ativo"))).limit(1);
  return row ? { ...row.taxpayer, person: row.person, company: row.company } : null;
}
export async function readPortalTaxpayerGrant(db: DatabaseExecutor, actorId: string, taxpayerId?: string) {
  const [row] = await db.select().from(citizenTaxpayerAccesses).where(and(eq(citizenTaxpayerAccesses.usuarioId, actorId), taxpayerId === undefined ? undefined : eq(citizenTaxpayerAccesses.taxpayerId, taxpayerId), eq(citizenTaxpayerAccesses.accessType, "TITULAR"), eq(citizenTaxpayerAccesses.status, "ATIVO"), isNull(citizenTaxpayerAccesses.revokedAt), lte(citizenTaxpayerAccesses.grantedAt, new Date()))).limit(1);
  return row ?? null;
}
export async function readPortalRequestForOperation(db: DatabaseExecutor, requestId: string, condition?: SQL) {
  const [row] = await db.select({ request: portalServiceRequests, process: processes, worksService: infrastructureServices }).from(portalServiceRequests).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).leftJoin(infrastructureServices, eq(infrastructureServices.id, portalServiceRequests.worksServiceId)).where(and(eq(portalServiceRequests.id, requestId), condition)).limit(1);
  return row ? { ...row.request, process: row.process, worksService: row.worksService } : null;
}
export async function readOwnPortalRequestData(db: DatabaseExecutor, actorId: string, requestId: string) {
  const [row] = await db.select({ request: portalServiceRequests, process: { id: processes.id, protocolNumber: processes.protocolNumber, status: processes.status, expectedCompletionAt: processes.expectedCompletionAt }, currentDepartment: { name: departments.name }, worksService: { status: infrastructureServices.status, scheduledFor: infrastructureServices.scheduledFor, completedAt: infrastructureServices.completedAt } }).from(portalServiceRequests).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).leftJoin(departments, eq(departments.id, processes.currentDepartmentId)).leftJoin(infrastructureServices, eq(infrastructureServices.id, portalServiceRequests.worksServiceId)).where(and(eq(portalServiceRequests.id, requestId), eq(portalServiceRequests.actorId, actorId), sql`EXISTS(SELECT 1 FROM ${processCitizenAccesses} WHERE ${processCitizenAccesses.processId}=${processes.id} AND ${processCitizenAccesses.usuarioId}=${actorId} AND ${processCitizenAccesses.revokedAt} IS NULL AND (${processCitizenAccesses.expiresAt} IS NULL OR ${processCitizenAccesses.expiresAt}>${new Date()}))`)).limit(1);
  if (!row) return null;
  const [events, uploads, schedules, ratings] = await Promise.all([
    db.select({ id: portalServiceRequestEvents.id, kind: portalServiceRequestEvents.kind, text: portalServiceRequestEvents.text, documentVersionId: portalServiceRequestEvents.documentVersionId, createdAt: portalServiceRequestEvents.createdAt }).from(portalServiceRequestEvents).where(and(eq(portalServiceRequestEvents.requestId, requestId), eq(portalServiceRequestEvents.visible, true))).orderBy(asc(portalServiceRequestEvents.createdAt), asc(portalServiceRequestEvents.id)),
    db.select({ id: portalServiceUploads.id, code: portalServiceUploads.code, filename: portalServiceUploads.filename, documentVersionId: portalServiceUploads.documentVersionId }).from(portalServiceUploads).where(eq(portalServiceUploads.requestId, requestId)),
    db.select({ id: portalScheduleRequests.id, schedule: { id: portalServiceSchedules.id, type: portalServiceSchedules.type, status: portalServiceSchedules.status, startsAt: portalServiceSchedules.startsAt, endsAt: portalServiceSchedules.endsAt } }).from(portalScheduleRequests).innerJoin(portalServiceSchedules, eq(portalServiceSchedules.id, portalScheduleRequests.scheduleId)).where(eq(portalScheduleRequests.requestId, requestId)),
    db.select().from(portalServiceRatings).where(eq(portalServiceRatings.requestId, requestId)).limit(1),
  ]);
  return { ...row.request, process: { ...row.process, currentDepartment: row.currentDepartment }, events, uploads, worksService: row.worksService, schedules, rating: ratings[0] ?? null };
}

export async function readPortalResultDocument(db: DatabaseExecutor, processId: string, versionId: string) {
  const [row] = await db.select({ version: documentVersions, documentClass: { signaturePolicy: documentClasses.signaturePolicy } }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).leftJoin(documentClasses, eq(documentClasses.id, documents.documentClassId)).innerJoin(processDocuments, and(eq(processDocuments.documentId, documents.id), eq(processDocuments.processId, processId))).where(and(eq(documentVersions.id, versionId), sql`${documentVersions.status} IN ('FINAL','SIGNED')`, sql`${documents.status} IN ('Válido','Assinado')`)).limit(1);
  if (!row) return null;
  const signatures = await db.select().from(documentSignatures).where(eq(documentSignatures.documentVersionId, row.version.id));
  return { ...row.version, document: { documentClass: row.documentClass }, signatures };
}

export async function readPortalScheduleResources(db: DatabaseExecutor, departmentId?: string | null) {
  return Promise.all([
    db.select({ id: employees.id, name: employees.name }).from(employees).where(and(eq(employees.isActive, true), departmentId === undefined ? undefined : departmentId === null ? isNull(employees.departmentId) : eq(employees.departmentId, departmentId))).orderBy(asc(employees.name)),
    db.select({ id: infrastructureTeams.id, name: infrastructureTeams.name }).from(infrastructureTeams).where(and(eq(infrastructureTeams.isActive, true), departmentId === undefined ? undefined : departmentId === null ? isNull(infrastructureTeams.departmentId) : eq(infrastructureTeams.departmentId, departmentId))),
    db.select({ id: assets.id, description: assets.description }).from(assets).where(notInArray(assets.status, ["Baixado", "Inativo"])).limit(500),
  ]);
}

export async function readInternalPortalRequest(db: DatabaseExecutor, id: string, scope: SQL) {
  const request = await readPortalRequestForOperation(db, id, scope);
  if (!request) return null;
  const [uploads, events, scheduleRows, versions] = await Promise.all([
    db.select().from(portalServiceUploads).where(eq(portalServiceUploads.requestId, id)),
    db.select().from(portalServiceRequestEvents).where(eq(portalServiceRequestEvents.requestId, id)).orderBy(asc(portalServiceRequestEvents.createdAt)),
    db.select({ id: portalScheduleRequests.id, schedule: portalServiceSchedules }).from(portalScheduleRequests).innerJoin(portalServiceSchedules, eq(portalServiceSchedules.id, portalScheduleRequests.scheduleId)).where(eq(portalScheduleRequests.requestId, id)),
    db.select({ id: documentVersions.id, title: documents.title, versionNumber: documentVersions.versionNumber }).from(processDocuments).innerJoin(documents, eq(documents.id, processDocuments.documentId)).innerJoin(documentVersions, eq(documentVersions.documentId, documents.id)).where(and(eq(processDocuments.processId, request.processId), inArray(documentVersions.status, ["FINAL", "SIGNED"]))).orderBy(desc(documentVersions.versionNumber)),
  ]);
  const links = scheduleRows.length ? await db.select({ scheduleId: portalScheduleRequests.scheduleId, requestId: portalScheduleRequests.requestId, request: { id: portalServiceRequests.id }, process: { protocolNumber: processes.protocolNumber } }).from(portalScheduleRequests).innerJoin(portalServiceRequests, eq(portalServiceRequests.id, portalScheduleRequests.requestId)).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).where(inArray(portalScheduleRequests.scheduleId, scheduleRows.map(row => row.schedule.id))) : [];
  const schedules = scheduleRows.map(row => ({ id: row.id, schedule: { ...row.schedule, links: links.filter(link => link.scheduleId === row.schedule.id).map(link => ({ requestId: link.requestId, request: { ...link.request, process: link.process } })) } }));
  return { ...request, uploads, events, schedules, resultDocuments: versions.map(version => ({ id: version.id, label: `${version.title} — versão ${version.versionNumber}` })) };
}
