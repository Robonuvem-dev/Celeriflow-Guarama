import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import { processes, processDispatches, processDocuments, processEvents, processMovements, genericWorkflowInstances, genericWorkflowDefinitions, genericWorkflowStages } from "../../schema/processes";
import { departments, employees } from "../../schema/administration";
import { documents } from "../../schema/registry";
import { accessProfiles, modules, userModulePermissions, users } from "../../schema/identity";
import { processCitizenAccesses } from "../../schema/citizen-access";
import { listOperationalProcesses } from "./listing";

export function citizenTrackingEligibleCondition() {
  return sql`NOT EXISTS(SELECT 1 FROM "Ombudsman" protected WHERE protected."processId"=${processes.id}) AND NOT EXISTS(SELECT 1 FROM "HrPortalRequestBinding" protected WHERE protected."processId"=${processes.id}) AND NOT EXISTS(SELECT 1 FROM "SstMedicalCertificate" protected WHERE protected."processId"=${processes.id})`;
}

export async function listProcessCitizenAccesses(db: DatabaseExecutor, processId: string) {
  const rows = await db.select({ access: processCitizenAccesses, usuario: { nome: users.nome, email: users.email } }).from(processCitizenAccesses).innerJoin(users, eq(users.id, processCitizenAccesses.usuarioId)).where(eq(processCitizenAccesses.processId, processId)).orderBy(desc(processCitizenAccesses.grantedAt));
  return rows.map(row => ({ ...row.access, usuario: row.usuario }));
}

export async function listProtocolSigners(db: DatabaseExecutor) {
  const rows = await db.select({ user: { id: users.id, nome: users.nome, email: users.email, employeeId: users.employeeId }, perfil: { nome: accessProfiles.nome, codigo: accessProfiles.codigo, permissoes: accessProfiles.permissoes } }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.ativo, true), eq(accessProfiles.ativo, true))).orderBy(asc(users.nome));
  const permissions = rows.length ? await db.select({ usuarioId: userModulePermissions.usuarioId, canView: userModulePermissions.canView, canEdit: userModulePermissions.canEdit, modulo: { codigo: modules.codigo } }).from(userModulePermissions).innerJoin(modules, eq(modules.id, userModulePermissions.moduloId)).where(inArray(userModulePermissions.usuarioId, rows.map(row => row.user.id))) : [];
  return rows.map(row => ({ ...row.user, perfil: row.perfil, permissoesModulo: permissions.filter(item => item.usuarioId === row.user.id) }));
}

export async function readOperationalProcess(db: DatabaseExecutor, id: string, scope: SQL) {
  const [process] = await listOperationalProcesses(db, and(eq(processes.id, id), scope), { limit: 1 });
  if (!process) return null;
  const from = alias(departments, "details_from_department"), to = alias(departments, "details_to_department"), receiver = alias(employees, "details_receiver");
  const [dispatchRows, movementRows, documentRows, eventRows, instanceRows] = await Promise.all([
    db.select({ dispatch: processDispatches, employee: { name: employees.name } }).from(processDispatches).innerJoin(employees, eq(employees.id, processDispatches.employeeId)).where(eq(processDispatches.processId, id)).orderBy(desc(processDispatches.createdAt)),
    db.select({ movement: processMovements, fromDepartment: { name: from.name }, toDepartment: { name: to.name }, employee: { name: employees.name }, receivedByEmployee: { name: receiver.name } }).from(processMovements).leftJoin(from, eq(from.id, processMovements.fromDepartmentId)).innerJoin(to, eq(to.id, processMovements.toDepartmentId)).leftJoin(employees, eq(employees.id, processMovements.employeeId)).leftJoin(receiver, eq(receiver.id, processMovements.receivedByEmployeeId)).where(eq(processMovements.processId, id)).orderBy(desc(processMovements.movedAt)),
    db.select({ link: processDocuments, document: { id: documents.id, title: documents.title, fileUrl: documents.fileUrl, status: documents.status, documentClassId: documents.documentClassId } }).from(processDocuments).leftJoin(documents, eq(documents.id, processDocuments.documentId)).where(eq(processDocuments.processId, id)).orderBy(desc(processDocuments.createdAt)),
    db.select({ event: processEvents, employee: { name: employees.name }, department: { name: departments.name } }).from(processEvents).leftJoin(employees, eq(employees.id, processEvents.employeeId)).leftJoin(departments, eq(departments.id, processEvents.departmentId)).where(eq(processEvents.processId, id)).orderBy(desc(processEvents.createdAt)),
    db.select({ instance: genericWorkflowInstances, definition: genericWorkflowDefinitions }).from(genericWorkflowInstances).innerJoin(genericWorkflowDefinitions, eq(genericWorkflowDefinitions.id, genericWorkflowInstances.definitionId)).where(eq(genericWorkflowInstances.processId, id)).limit(1),
  ]);
  const instance = instanceRows[0];
  const stages = instance ? await db.select().from(genericWorkflowStages).where(eq(genericWorkflowStages.definitionId, instance.definition.id)).orderBy(asc(genericWorkflowStages.position)) : [];
  // The detailed page also displays the person's and company's public identifiers.
  const [identity] = await db.select({ cpf: sql<string | null>`(SELECT p.cpf FROM "Person" p WHERE p.id=${processes.personId})`, cnpj: sql<string | null>`(SELECT c.cnpj FROM "Company" c WHERE c.id=${processes.companyId})` }).from(processes).where(eq(processes.id, id));
  return { ...process, person: process.person ? { ...process.person, cpf: identity.cpf } : null, company: process.company ? { ...process.company, cnpj: identity.cnpj } : null,
    dispatches: dispatchRows.map(row => ({ ...row.dispatch, employee: row.employee })), movements: movementRows.map(row => ({ ...row.movement, fromDepartment: row.fromDepartment, toDepartment: row.toDepartment, employee: row.employee, receivedByEmployee: row.receivedByEmployee })),
    documents: documentRows.map(row => ({ ...row.link, document: row.document })), events: eventRows.map(row => ({ ...row.event, employee: row.employee, department: row.department })),
    genericWorkflowInstance: instance ? { ...instance.instance, definition: { ...instance.definition, stages } } : null };
}
