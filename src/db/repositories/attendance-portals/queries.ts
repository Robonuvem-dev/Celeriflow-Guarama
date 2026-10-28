import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import { departments, employees } from "../../schema/administration";
import { people } from "../../schema/people";
import { companies, documents } from "../../schema/registry";
import { users } from "../../schema/identity";
import { processes, processTypes, processSubjects } from "../../schema/processes";
import { tickets, ombudsmans, supportChannels, serviceSubjects, ticketInteractions, ticketMovements, ticketDocuments, ticketAuditLogs, ombudsmanInteractions, ombudsmanMovements, ombudsmanDocuments, ombudsmanIdentities, ombudsmanAccessGrants, ombudsmanAuditLogs } from "../../schema/attendance-portals";

export async function listAttendanceTickets(db: DatabaseExecutor, where: SQL | undefined, options: { limit: number; offset?: number; order: "recent" | "deadline-created" | "deadline-updated" }) {
  const rows = await db.select({ ticket: tickets, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName, tradeName: companies.tradeName }, channel: { name: supportChannels.name }, department: { name: departments.name }, assignee: { name: employees.name } }).from(tickets)
    .leftJoin(people, eq(people.id, tickets.personId)).leftJoin(companies, eq(companies.id, tickets.companyId)).innerJoin(supportChannels, eq(supportChannels.id, tickets.channelId)).leftJoin(departments, eq(departments.id, tickets.departmentId)).leftJoin(employees, eq(employees.id, tickets.assigneeId))
    .where(where).orderBy(...(options.order === "recent" ? [desc(tickets.createdAt)] : [asc(tickets.dueAt), options.order === "deadline-created" ? asc(tickets.createdAt) : desc(tickets.updatedAt)])).limit(options.limit).offset(options.offset ?? 0);
  return rows.map(row => ({ ...row.ticket, person: row.person, company: row.company, channel: row.channel, department: row.department, assignee: row.assignee }));
}

export async function listOmbudsmanSummaries(db: DatabaseExecutor, where: SQL | undefined, userId: string, options: { limit?: number; offset?: number; stableOrder?: boolean } = {}) {
  // Only the legacy direct identity relation belongs to this listing's DTO.
  const query = db.select({ id: ombudsmans.id, protocolNumber: ombudsmans.protocolNumber, type: ombudsmans.type, subject: ombudsmans.subject, isAnonymous: ombudsmans.isAnonymous, isConfidential: ombudsmans.isConfidential, status: ombudsmans.status, createdAt: ombudsmans.createdAt, person: { fullName: people.fullName }, grant: { canViewIdentity: ombudsmanAccessGrants.canViewIdentity } }).from(ombudsmans)
    .leftJoin(people, eq(people.id, ombudsmans.personId)).leftJoin(ombudsmanAccessGrants, and(eq(ombudsmanAccessGrants.ombudsmanId, ombudsmans.id), eq(ombudsmanAccessGrants.userId, userId)))
    .where(where).orderBy(desc(ombudsmans.createdAt), ...(options.stableOrder ? [desc(ombudsmans.id)] : [])).$dynamic();
  const rows = await (options.limit === undefined ? query : query.limit(options.limit).offset(options.offset ?? 0));
  return rows.map(({ grant, ...row }) => ({ ...row, accessGrants: grant ? [grant] : [] }));
}

export async function readActiveProcessTypes(db: DatabaseExecutor) {
  const [types, subjects] = await Promise.all([
    db.select().from(processTypes).where(eq(processTypes.isActive, true)).orderBy(asc(processTypes.name)),
    db.select().from(processSubjects).where(eq(processSubjects.isActive, true)),
  ]);
  return types.map(type => ({ ...type, subjects: subjects.filter(subject => subject.processTypeId === type.id) }));
}

export async function readTicketDetail(db: DatabaseExecutor, id: string, scope: SQL) {
  const [row] = await db.select({ ticket: tickets, person: people, company: companies, channel: supportChannels, department: departments, assignee: employees, serviceSubject: serviceSubjects, process: processes }).from(tickets)
    .leftJoin(people, eq(people.id, tickets.personId)).leftJoin(companies, eq(companies.id, tickets.companyId)).innerJoin(supportChannels, eq(supportChannels.id, tickets.channelId)).leftJoin(departments, eq(departments.id, tickets.departmentId)).leftJoin(employees, eq(employees.id, tickets.assigneeId)).leftJoin(serviceSubjects, eq(serviceSubjects.id, tickets.serviceSubjectId)).leftJoin(processes, eq(processes.id, tickets.processId)).where(and(eq(tickets.id, id), scope)).limit(1);
  if (!row) return null;
  const fromDepartment = alias(departments, "ticket_from_department"), toDepartment = alias(departments, "ticket_to_department");
  const [interactions, movements, links, audits] = await Promise.all([
    db.select({ interaction: ticketInteractions, employee: { name: employees.name } }).from(ticketInteractions).leftJoin(employees, eq(employees.id, ticketInteractions.employeeId)).where(eq(ticketInteractions.ticketId, id)).orderBy(asc(ticketInteractions.createdAt)),
    db.select({ movement: ticketMovements, fromDepartment: { name: fromDepartment.name }, toDepartment: { name: toDepartment.name }, employee: { name: employees.name } }).from(ticketMovements).leftJoin(fromDepartment, eq(fromDepartment.id, ticketMovements.fromDepartmentId)).innerJoin(toDepartment, eq(toDepartment.id, ticketMovements.toDepartmentId)).innerJoin(employees, eq(employees.id, ticketMovements.employeeId)).where(eq(ticketMovements.ticketId, id)).orderBy(asc(ticketMovements.createdAt)),
    db.select({ link: ticketDocuments, document: documents }).from(ticketDocuments).innerJoin(documents, eq(documents.id, ticketDocuments.documentId)).where(eq(ticketDocuments.ticketId, id)).orderBy(desc(ticketDocuments.createdAt)),
    db.select({ audit: ticketAuditLogs, user: { nome: users.nome } }).from(ticketAuditLogs).innerJoin(users, eq(users.id, ticketAuditLogs.userId)).where(eq(ticketAuditLogs.ticketId, id)).orderBy(desc(ticketAuditLogs.createdAt)).limit(50),
  ]);
  return { ...row.ticket, person: row.person, company: row.company, channel: row.channel, department: row.department, assignee: row.assignee, serviceSubject: row.serviceSubject, process: row.process,
    interactions: interactions.map(item => ({ ...item.interaction, employee: item.employee })), movements: movements.map(item => ({ ...item.movement, fromDepartment: item.fromDepartment, toDepartment: item.toDepartment, employee: item.employee })), documents: links.map(item => ({ ...item.link, document: item.document })), auditLogs: audits.map(item => ({ ...item.audit, user: item.user })) };
}

export async function readOmbudsmanDetail(db: DatabaseExecutor, id: string, scope: SQL, userId: string) {
  const [row] = await db.select({ ombudsman: ombudsmans, channel: supportChannels, department: departments, assignee: employees, process: processes, identity: { personId: ombudsmanIdentities.personId } }).from(ombudsmans)
    .innerJoin(supportChannels, eq(supportChannels.id, ombudsmans.channelId)).leftJoin(departments, eq(departments.id, ombudsmans.departmentId)).leftJoin(employees, eq(employees.id, ombudsmans.assigneeId)).leftJoin(processes, eq(processes.id, ombudsmans.processId)).leftJoin(ombudsmanIdentities, eq(ombudsmanIdentities.ombudsmanId, ombudsmans.id)).where(and(eq(ombudsmans.id, id), scope)).limit(1);
  if (!row) return null;
  const fromDepartment = alias(departments, "ombudsman_from_department"), toDepartment = alias(departments, "ombudsman_to_department");
  const [accessGrants, interactions, movements, links, audits] = await Promise.all([
    db.select({ canViewIdentity: ombudsmanAccessGrants.canViewIdentity }).from(ombudsmanAccessGrants).where(and(eq(ombudsmanAccessGrants.ombudsmanId, id), eq(ombudsmanAccessGrants.userId, userId))),
    db.select({ interaction: ombudsmanInteractions, employee: { name: employees.name } }).from(ombudsmanInteractions).leftJoin(employees, eq(employees.id, ombudsmanInteractions.employeeId)).where(eq(ombudsmanInteractions.ombudsmanId, id)).orderBy(asc(ombudsmanInteractions.createdAt)),
    db.select({ movement: ombudsmanMovements, fromDepartment: { name: fromDepartment.name }, toDepartment: { name: toDepartment.name }, employee: { name: employees.name } }).from(ombudsmanMovements).leftJoin(fromDepartment, eq(fromDepartment.id, ombudsmanMovements.fromDepartmentId)).innerJoin(toDepartment, eq(toDepartment.id, ombudsmanMovements.toDepartmentId)).innerJoin(employees, eq(employees.id, ombudsmanMovements.employeeId)).where(eq(ombudsmanMovements.ombudsmanId, id)).orderBy(asc(ombudsmanMovements.createdAt)),
    db.select({ link: ombudsmanDocuments, document: documents }).from(ombudsmanDocuments).innerJoin(documents, eq(documents.id, ombudsmanDocuments.documentId)).where(eq(ombudsmanDocuments.ombudsmanId, id)).orderBy(desc(ombudsmanDocuments.createdAt)),
    db.select({ audit: ombudsmanAuditLogs, user: { nome: users.nome } }).from(ombudsmanAuditLogs).innerJoin(users, eq(users.id, ombudsmanAuditLogs.userId)).where(eq(ombudsmanAuditLogs.ombudsmanId, id)).orderBy(desc(ombudsmanAuditLogs.createdAt)).limit(50),
  ]);
  return { ...row.ombudsman, channel: row.channel, department: row.department, assignee: row.assignee, process: row.process, identity: row.identity, accessGrants,
    interactions: interactions.map(item => ({ ...item.interaction, employee: item.employee })), movements: movements.map(item => ({ ...item.movement, fromDepartment: item.fromDepartment, toDepartment: item.toDepartment, employee: item.employee })), documents: links.map(item => ({ ...item.link, document: item.document })), auditLogs: audits.map(item => ({ ...item.audit, user: item.user })) };
}
