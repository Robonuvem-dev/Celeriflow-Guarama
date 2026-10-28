"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nextYearlyCodeDrizzle } from "@/db/repositories/platform/sequences";
import { getAttendanceContext, getAttendanceOperationalContextForOperation, getOmbudsmanOperationalContextForOperation } from "@/lib/attendance/access";
import { ticketScopeCondition, ombudsmanScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { createValidatedProcess } from "@/lib/protocols/service";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { requireValidCnpj, requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { assertRedactedOmbudsmanDisclosure } from "@/lib/attendance/ombudsman-disclosure-policy";
import { and, eq } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { tickets, ombudsmans, supportChannels, serviceSubjects, ticketInteractions, ticketMovements, ticketAuditLogs, ombudsmanInteractions, ombudsmanMovements, ombudsmanIdentities, ombudsmanAuditLogs, ombudsmanAccessGrants } from "@/db/schema/attendance-portals";
import { departments, employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import { users } from "@/db/schema/identity";

const TICKET_STATUSES = new Set(["Aberto", "Encaminhado", "Aguardando Recebimento", "Em Atendimento", "Aguardando Informação", "Resolvido", "Concluído", "Cancelado", "Reaberto"]);
const OMBUDSMAN_STATUSES = new Set(["Recebida", "Em Triagem", "Encaminhada", "Em Apuração", "Aguardando Resposta", "Concluída"]);

function stringValue(formData: FormData, name: string) {
  return String(formData.get(name) || "").trim();
}

function revalidateAttendance() {
  for (const path of ["/atendimento", "/atendimento/central", "/atendimento/fila", "/atendimento/configuracoes", "/atendimento/ouvidoria", "/atendimento/relatorios", "/protocolos/ouvidoria"]) {
    revalidatePath(path);
  }
}

function revalidateOmbudsman(id: string) {
  revalidateAttendance();
  revalidatePath(`/atendimento/ouvidoria/${id}`);
  revalidatePath(`/protocolos/ouvidoria/${id}`);
}

async function scopedTicket(id: string, operation: "create" | "update" = "update") {
  const context = await getAttendanceOperationalContextForOperation(operation);
  const [row] = await db.select({ ticket: tickets, department: departments }).from(tickets).leftJoin(departments, eq(departments.id, tickets.departmentId)).where(and(eq(tickets.id, id), ticketScopeCondition(context))).limit(1);
  const ticket = row ? { ...row.ticket, department: row.department } : null;
  if (!ticket) throw new Error("Chamado nao encontrado ou sem acesso ao seu setor.");
  return { context, ticket };
}

async function scopedOmbudsman(id: string, operation: "create" | "update" | "delete" = "update") {
  const context = await getOmbudsmanOperationalContextForOperation(operation);
  const [row] = await db.select({ ombudsman: ombudsmans, identity: ombudsmanIdentities }).from(ombudsmans).leftJoin(ombudsmanIdentities, eq(ombudsmanIdentities.ombudsmanId, ombudsmans.id)).where(and(eq(ombudsmans.id, id), ombudsmanScopeCondition(context))).limit(1);
  const ombudsman = row ? { ...row.ombudsman, identity: row.identity } : null;
  if (!ombudsman) throw new Error("Manifestacao nao encontrada ou sem acesso.");
  return { context, ombudsman };
}

async function auditTicket(tx: DatabaseTransaction, ticketId: string, context: Awaited<ReturnType<typeof getAttendanceOperationalContextForOperation>>, action: string, details?: Record<string, unknown>) {
  await tx.insert(ticketAuditLogs).values({ ticketId, userId: context.user.id, employeeId: context.employee.id, action, details });
}

export async function createTicket(formData: FormData): Promise<void> {
  const context = await getAttendanceOperationalContextForOperation("create");
  const requesterType = stringValue(formData, "requesterType") || "anonymous";
  const channelId = stringValue(formData, "channelId");
  const serviceSubjectId = stringValue(formData, "serviceSubjectId") || null;
  const selectedDepartmentId = stringValue(formData, "departmentId") || null;
  const subject = stringValue(formData, "subject");
  const description = stringValue(formData, "description");
  const requestedPriority = stringValue(formData, "priority") || "Normal";

  if (!channelId || !subject || !description) throw new Error("Canal, assunto e descricao sao obrigatorios.");
  if (!["person", "company", "anonymous"].includes(requesterType)) throw new Error("Tipo de solicitante invalido.");

  const created = await withDatabaseTransaction(databaseConnection, async (tx) => {
    const [channel] = await tx.select().from(supportChannels).where(and(eq(supportChannels.id, channelId), eq(supportChannels.isActive, true))).limit(1);
    if (!channel) throw new Error("Selecione um canal de atendimento ativo.");

    const serviceSubject = serviceSubjectId
      ? await tx.select().from(serviceSubjects).where(and(eq(serviceSubjects.id, serviceSubjectId), eq(serviceSubjects.isActive, true))).limit(1).then(rows => rows[0])
      : null;
    if (serviceSubjectId && !serviceSubject) throw new Error("Assunto de atendimento invalido ou inativo.");

    const departmentId = serviceSubject?.defaultDepartmentId || selectedDepartmentId;
    if (departmentId) {
      const [department] = await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, departmentId), eq(departments.isActive, true))).limit(1);
      if (!department) throw new Error("Setor responsavel invalido ou inativo.");
    }

    let personId: string | null = null;
    let companyId: string | null = null;
    if (requesterType === "person") {
      const cpf = requireValidCpf(stringValue(formData, "cpf"));
      const fullName = stringValue(formData, "fullName");
      const phone = stringValue(formData, "phone");
      if (!cpf || !fullName) throw new Error("Informe CPF e nome da pessoa solicitante.");
      const [person] = await tx.insert(people).values({ cpf, fullName, phonePrimary: phone || null, status: "Ativo" }).onConflictDoUpdate({ target: people.cpf, set: { fullName, ...(phone ? { phonePrimary: phone } : {}), updatedAt: new Date() } }).returning({ id: people.id });
      personId = person.id;
    }
    if (requesterType === "company") {
      const cnpj = requireValidCnpj(stringValue(formData, "cnpj"));
      const corporateName = stringValue(formData, "corporateName");
      const phone = stringValue(formData, "companyPhone");
      if (!cnpj || !corporateName) throw new Error("Informe CNPJ e razao social da empresa solicitante.");
      const [company] = await tx.insert(companies).values({ cnpj, corporateName, phone: phone || null, status: "Ativo" }).onConflictDoUpdate({ target: companies.cnpj, set: { corporateName, ...(phone ? { phone } : {}), updatedAt: new Date() } }).returning({ id: companies.id });
      companyId = company.id;
    }

    const ticketNumber = await nextYearlyCodeDrizzle({
      db: tx,
      key: "ATD",
      prefix: "ATD",
      padding: 6,
      existingCodes: await tx.select({ code: tickets.ticketNumber }).from(tickets),
    });
    const dueAt = serviceSubject?.defaultDueDays ? new Date(Date.now() + serviceSubject.defaultDueDays * 86400000) : null;
    const priority = serviceSubject?.defaultPriority || requestedPriority;
    const [ticket] = await tx.insert(tickets).values({
        ticketNumber,
        subject,
        description,
        priority,
        isAnonymous: requesterType === "anonymous",
        channelId,
        personId,
        companyId,
        departmentId,
        serviceSubjectId: serviceSubject?.id || null,
        dueAt,
    }).returning({ id: tickets.id });
    await tx.insert(ticketInteractions).values({ ticketId: ticket.id, type: "Registro", message: "Atendimento registrado.", isInternal: true, employeeId: context.employee.id });
    if (departmentId) {
      await tx.insert(ticketMovements).values({ ticketId: ticket.id, toDepartmentId: departmentId, employeeId: context.employee.id, reason: "Distribuicao inicial" });
    }
    await auditTicket(tx, ticket.id, context, "CREATED", { departmentId, requesterType, serviceSubjectId, dueAt: dueAt?.toISOString() ?? null });
    return ticket;
  }, { timeoutMs: 5_000 });

  revalidateAttendance();
  redirect(`/atendimento/chamados/${created.id}`);
}

export async function createOmbudsman(formData: FormData): Promise<void> {
  const context = await getOmbudsmanOperationalContextForOperation("create");
  const openedFromProtocols = formData.get("originModule") === "PROCESSOS" && context.attendanceAccess.authorizationModule === "PROCESSOS";
  if (!context.attendanceAccess.isOmbudsman) throw new Error("Somente a Ouvidoria pode registrar manifestacoes.");
  const type = stringValue(formData, "type");
  const subject = stringValue(formData, "subject");
  const description = stringValue(formData, "description");
  const channelId = stringValue(formData, "channelId");
  const departmentId = stringValue(formData, "departmentId") || null;
  const isAnonymous = formData.get("isAnonymous") === "on";
  const isConfidential = formData.get("isConfidential") === "on";
  if (!new Set(["Denúncia", "Reclamação", "Sugestão", "Elogio"]).has(type) || !subject || !description || !channelId) {
    throw new Error("Informe tipo, canal, assunto e descricao da manifestacao.");
  }

  const created = await withDatabaseTransaction(databaseConnection, async (tx) => {
    const [channel] = await tx.select({ id: supportChannels.id }).from(supportChannels).where(and(eq(supportChannels.id, channelId), eq(supportChannels.isActive, true))).limit(1);
    if (!channel) throw new Error("Selecione um canal de atendimento ativo.");
    if (departmentId) {
      const [department] = await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, departmentId), eq(departments.isActive, true))).limit(1);
      if (!department) throw new Error("Setor inicial invalido ou inativo.");
    }
    let personId: string | null = null;
    if (!isAnonymous) {
      const cpf = requireValidCpf(stringValue(formData, "cpf"));
      const fullName = stringValue(formData, "fullName");
      if (!cpf || !fullName) throw new Error("Informe CPF e nome ou marque a manifestacao como anonima.");
      personId = (await tx.insert(people).values({ cpf, fullName, status: "Ativo" }).onConflictDoUpdate({ target: people.cpf, set: { fullName, updatedAt: new Date() } }).returning({ id: people.id }))[0].id;
    }
    const protocolNumber = await nextYearlyCodeDrizzle({
      db: tx,
      key: "OUV",
      prefix: "OUV",
      padding: 6,
      existingCodes: await tx.select({ code: ombudsmans.protocolNumber }).from(ombudsmans),
    });
    const [ombudsman] = await tx.insert(ombudsmans).values({
        protocolNumber, type, subject, description, channelId, departmentId,
        // New identities are stored separately so a department cannot obtain them from the body record.
        personId: null, isAnonymous, isConfidential,
    }).returning({ id: ombudsmans.id });
    if (personId) await tx.insert(ombudsmanIdentities).values({ ombudsmanId: ombudsman.id, personId });
    await tx.insert(ombudsmanInteractions).values({ ombudsmanId: ombudsman.id, type: "Registro", message: "Manifestacao registrada.", employeeId: context.employee.id });
    if (departmentId) {
      await tx.insert(ombudsmanMovements).values({ ombudsmanId: ombudsman.id, toDepartmentId: departmentId, employeeId: context.employee.id, reason: "Distribuicao inicial" });
    }
    await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: ombudsman.id, userId: context.user.id, employeeId: context.employee.id, action: "CREATED", details: { type, departmentId, isAnonymous, isConfidential } });
    return ombudsman;
  }, { timeoutMs: 5_000 });
  revalidateAttendance();
  redirect(openedFromProtocols ? `/protocolos/ouvidoria/${created.id}` : `/atendimento/ouvidoria/${created.id}`);
}

export async function assumeTicket(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ticketId");
  const { context, ticket } = await scopedTicket(id);
  if (["Resolvido", "Concluído", "Cancelado"].includes(ticket.status)) throw new Error("Este chamado nao pode mais ser assumido.");
  if (ticket.assigneeId && ticket.assigneeId !== context.employee.id && !context.attendanceAccess.isManager) throw new Error("O chamado ja possui outro responsavel.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.update(tickets).set({ assigneeId: context.employee.id, status: "Em Atendimento" }).where(eq(tickets.id, id));
    await tx.insert(ticketInteractions).values({ ticketId: id, type: "Assunção", message: "Chamado assumido pelo servidor responsavel.", isInternal: true, employeeId: context.employee.id });
    await auditTicket(tx, id, context, "ASSUMED", { previousAssigneeId: ticket.assigneeId });
  }, { timeoutMs: 5_000 });
  revalidateAttendance();
  revalidatePath(`/atendimento/chamados/${id}`);
}

export async function assignTicket(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ticketId");
  const assigneeId = stringValue(formData, "assigneeId");
  const { context, ticket } = await scopedTicket(id);
  if (!context.attendanceAccess.isManager) throw new Error("Somente gestores podem atribuir chamados a outro servidor.");
  if (!assigneeId) throw new Error("Selecione o responsavel.");
  const [assignee] = await db.select().from(employees).where(and(eq(employees.id, assigneeId), eq(employees.isActive, true), ticket.departmentId ? eq(employees.departmentId, ticket.departmentId) : undefined)).limit(1);
  if (!assignee) throw new Error("O responsavel deve estar ativo e vinculado ao setor atual.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.update(tickets).set({ assigneeId, status: "Em Atendimento" }).where(eq(tickets.id, id));
    await tx.insert(ticketInteractions).values({ ticketId: id, type: "Assunção", message: `Chamado atribuido a ${assignee.name}.`, isInternal: true, employeeId: context.employee.id });
    await auditTicket(tx, id, context, "ASSIGNED", { fromAssigneeId: ticket.assigneeId, toAssigneeId: assigneeId });
  }, { timeoutMs: 5_000 });
  revalidateAttendance();
  revalidatePath(`/atendimento/chamados/${id}`);
}

export async function forwardTicket(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ticketId");
  const toDepartmentId = stringValue(formData, "toDepartmentId");
  const reason = stringValue(formData, "reason");
  const { context, ticket } = await scopedTicket(id);
  if (!toDepartmentId || !reason) throw new Error("Informe o setor de destino e o motivo do encaminhamento.");
  if (ticket.departmentId === toDepartmentId) throw new Error("Selecione um setor diferente do atual.");
  const [destination] = await db.select({ id: departments.id, name: departments.name }).from(departments).where(and(eq(departments.id, toDepartmentId), eq(departments.isActive, true))).limit(1);
  if (!destination) throw new Error("Setor de destino invalido ou inativo.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.update(tickets).set({ departmentId: destination.id, assigneeId: null, status: "Aguardando Recebimento" }).where(eq(tickets.id, id));
    await tx.insert(ticketMovements).values({ ticketId: id, fromDepartmentId: ticket.departmentId, toDepartmentId: destination.id, fromAssigneeId: ticket.assigneeId, employeeId: context.employee.id, reason });
    await tx.insert(ticketInteractions).values({ ticketId: id, type: "Encaminhamento", message: `Encaminhado para ${destination.name}: ${reason}`, isInternal: true, employeeId: context.employee.id });
    await auditTicket(tx, id, context, "FORWARDED", { fromDepartmentId: ticket.departmentId, toDepartmentId, reason });
  }, { timeoutMs: 5_000 });
  revalidateAttendance();
  revalidatePath(`/atendimento/chamados/${id}`);
}

export async function addTicketInteraction(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ticketId");
  const message = stringValue(formData, "message");
  const type = stringValue(formData, "type") || "Comentário";
  const { context } = await scopedTicket(id, "create");
  if (!message) throw new Error("Informe a interacao.");
  if (!new Set(["Registro", "Comentário", "Resposta", "Solicitação de Informação"]).has(type)) throw new Error("Tipo de interacao invalido.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.insert(ticketInteractions).values({ ticketId: id, type, message, isInternal: true, employeeId: context.employee.id });
    await auditTicket(tx, id, context, "INTERACTION_ADDED", { type });
  }, { timeoutMs: 5_000 });
  revalidateAttendance();
  revalidatePath(`/atendimento/chamados/${id}`);
}

export async function resolveTicket(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ticketId");
  const solution = stringValue(formData, "solution");
  const { context } = await scopedTicket(id);
  if (!solution) throw new Error("Registre a solucao ou providencia adotada.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.update(tickets).set({ status: "Resolvido", solution, resolvedAt: new Date(), resolvedById: context.employee.id }).where(eq(tickets.id, id));
    await tx.insert(ticketInteractions).values({ ticketId: id, type: "Solução", message: solution, isInternal: true, employeeId: context.employee.id });
    await auditTicket(tx, id, context, "RESOLVED");
  }, { timeoutMs: 5_000 });
  revalidateAttendance();
  revalidatePath(`/atendimento/chamados/${id}`);
}

export async function concludeTicket(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ticketId");
  const { context, ticket } = await scopedTicket(id);
  if (ticket.status !== "Resolvido") throw new Error("O chamado precisa estar resolvido antes da conclusao.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.update(tickets).set({ status: "Concluído", concludedAt: new Date(), concludedById: context.employee.id }).where(eq(tickets.id, id));
    await tx.insert(ticketInteractions).values({ ticketId: id, type: "Conclusão", message: "Chamado concluido.", isInternal: true, employeeId: context.employee.id });
    await auditTicket(tx, id, context, "CONCLUDED");
  }, { timeoutMs: 5_000 });
  revalidateAttendance();
  revalidatePath(`/atendimento/chamados/${id}`);
}

export async function reopenTicket(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ticketId");
  const reason = stringValue(formData, "reason");
  const { context, ticket } = await scopedTicket(id);
  if (!["Resolvido", "Concluído", "Cancelado"].includes(ticket.status)) throw new Error("Somente chamados finalizados podem ser reabertos.");
  if (!reason) throw new Error("Informe o motivo da reabertura.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.update(tickets).set({ status: "Reaberto", concludedAt: null, concludedById: null }).where(eq(tickets.id, id));
    await tx.insert(ticketInteractions).values({ ticketId: id, type: "Reabertura", message: reason, isInternal: true, employeeId: context.employee.id });
    await auditTicket(tx, id, context, "REOPENED", { reason });
  }, { timeoutMs: 5_000 });
  revalidateAttendance();
  revalidatePath(`/atendimento/chamados/${id}`);
}

export async function updateTicketStatus(id: string, status: string) {
  try {
    if (!TICKET_STATUSES.has(status) || ["Resolvido", "Concluído"].includes(status)) throw new Error("Use a tela do chamado para registrar solucao e conclusao.");
    const { context, ticket } = await scopedTicket(id);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.update(tickets).set({ status }).where(eq(tickets.id, id));
      await tx.insert(ticketInteractions).values({ ticketId: id, type: "Registro", message: `Status alterado para ${status}.`, isInternal: true, employeeId: context.employee.id });
      await auditTicket(tx, id, context, "STATUS_CHANGED", { from: ticket.status, to: status });
    }, { timeoutMs: 5_000 });
    revalidateAttendance();
    return { success: true as const };
  } catch (error) {
    console.error("Failed to update ticket status:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Falha ao atualizar o status do chamado." };
  }
}

export async function updateOmbudsmanStatus(id: string, requestedStatus: string) {
  try {
    const context = await getOmbudsmanOperationalContextForOperation("update");
    if (!context.attendanceAccess.isOmbudsman) throw new Error("Somente a Ouvidoria pode alterar manifestacoes.");
    const status = requestedStatus === "Em Análise" ? "Em Triagem" : requestedStatus;
    if (!OMBUDSMAN_STATUSES.has(status)) throw new Error("Status de manifestacao invalido.");
    const [ombudsman] = await db.select({ id: ombudsmans.id, status: ombudsmans.status }).from(ombudsmans).where(and(eq(ombudsmans.id, id), ombudsmanScopeCondition(context))).limit(1);
    if (!ombudsman) throw new Error("Manifestacao nao encontrada ou sem acesso.");
    const transitions: Record<string, string[]> = {
      "Recebida": ["Em Triagem"],
      "Em Triagem": ["Encaminhada"],
      "Encaminhada": ["Em Apuração"],
      "Em Apuração": ["Aguardando Resposta"],
    };
    if (!transitions[ombudsman.status]?.includes(status)) throw new Error("Transicao de status nao permitida para esta manifestacao.");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.update(ombudsmans).set({ status }).where(eq(ombudsmans.id, id));
      await tx.insert(ombudsmanInteractions).values({ ombudsmanId: id, type: "Status", message: `Status alterado para ${status}.`, employeeId: context.employee.id });
      await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: id, userId: context.user.id, employeeId: context.employee.id, action: "STATUS_CHANGED", details: { from: ombudsman.status, to: status } });
    }, { timeoutMs: 5_000 });
    revalidateAttendance();
    return { success: true as const };
  } catch (error) {
    console.error("Failed to update ombudsman status:", error);
    return { success: false as const, error: error instanceof Error ? error.message : "Falha ao atualizar o status da manifestacao." };
  }
}

export async function createProcessFromTicket(formData: FormData): Promise<void> {
  await getTenantContextForModuleOperation("PROCESSOS", "create");
  const id = stringValue(formData, "ticketId");
  const { context, ticket } = await scopedTicket(id, "create");
  if (ticket.processId) throw new Error("Este chamado ja possui um processo relacionado.");
  const processTypeId = stringValue(formData, "processTypeId");
  const subjectId = stringValue(formData, "subjectId");
  const initialDepartmentId = stringValue(formData, "initialDepartmentId") || null;
  const priority = stringValue(formData, "priority") || null;
  const process = await withDatabaseTransaction(databaseConnection, async (tx) => {
    const created = await createValidatedProcess(tx, context.employee, context.user.id, {
      processTypeId, subjectId, initialDepartmentId, priority,
      personId: ticket.personId, companyId: ticket.companyId,
      description: `Atendimento ${ticket.ticketNumber}: ${ticket.subject}\n\n${ticket.description}`,
    });
    await tx.update(tickets).set({ processId: created.id, status: "Encaminhado" }).where(eq(tickets.id, id));
    await tx.insert(ticketInteractions).values({ ticketId: id, type: "Encaminhamento", message: `Protocolo ${created.protocolNumber} gerado a partir do atendimento.`, isInternal: true, employeeId: context.employee.id });
    await auditTicket(tx, id, context, "PROCESS_CREATED", { processId: created.id, protocolNumber: created.protocolNumber });
    return created;
  }, { timeoutMs: 5_000 });
  revalidateAttendance();
  revalidatePath(`/atendimento/chamados/${id}`);
  revalidatePath(`/protocolos/processos/${process.id}`);
}

export async function forwardOmbudsman(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ombudsmanId");
  const toDepartmentId = stringValue(formData, "toDepartmentId");
  const reason = stringValue(formData, "reason");
  const { context, ombudsman } = await scopedOmbudsman(id);
  if (!context.attendanceAccess.isOmbudsman || !toDepartmentId || !reason) throw new Error("Informe o setor de destino e o motivo do encaminhamento.");
  if (!["Em Triagem", "Em Apuração", "Aguardando Resposta"].includes(ombudsman.status)) throw new Error("A manifestação precisa estar em triagem ou apuração antes do encaminhamento.");
  if (ombudsman.departmentId === toDepartmentId) throw new Error("Selecione um setor diferente do atual.");
  const [destination] = await db.select({ id: departments.id, name: departments.name }).from(departments).where(and(eq(departments.id, toDepartmentId), eq(departments.isActive, true))).limit(1);
  if (!destination) throw new Error("Setor de destino invalido ou inativo.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.update(ombudsmans).set({ departmentId: destination.id, assigneeId: null, status: "Encaminhada" }).where(eq(ombudsmans.id, id));
    await tx.insert(ombudsmanMovements).values({ ombudsmanId: id, fromDepartmentId: ombudsman.departmentId, toDepartmentId: destination.id, employeeId: context.employee.id, reason });
    await tx.insert(ombudsmanInteractions).values({ ombudsmanId: id, type: "Encaminhamento", message: `Encaminhada para ${destination.name}: ${reason}`, employeeId: context.employee.id });
    await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: id, userId: context.user.id, employeeId: context.employee.id, action: "FORWARDED", details: { fromDepartmentId: ombudsman.departmentId, toDepartmentId, reason } });
  }, { timeoutMs: 5_000 });
  revalidateOmbudsman(id);
}

export async function startOmbudsmanTriage(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ombudsmanId");
  const { context, ombudsman } = await scopedOmbudsman(id);
  if (!context.attendanceAccess.isOmbudsman || ombudsman.status !== "Recebida") throw new Error("Somente manifestações recebidas podem iniciar triagem.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.update(ombudsmans).set({ status: "Em Triagem", assigneeId: context.employee.id }).where(eq(ombudsmans.id, id));
    await tx.insert(ombudsmanInteractions).values({ ombudsmanId: id, type: "Triagem", message: "Manifestação recebida para triagem pela Ouvidoria.", employeeId: context.employee.id });
    await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: id, userId: context.user.id, employeeId: context.employee.id, action: "TRIAGE_STARTED" });
  }, { timeoutMs: 5_000 });
  revalidateOmbudsman(id);
}

export async function startOmbudsmanInvestigation(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ombudsmanId");
  const { context, ombudsman } = await scopedOmbudsman(id);
  if (ombudsman.status !== "Encaminhada") throw new Error("A manifestação precisa estar encaminhada antes da apuração.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.update(ombudsmans).set({ status: "Em Apuração", assigneeId: context.employee.id }).where(eq(ombudsmans.id, id));
    await tx.insert(ombudsmanInteractions).values({ ombudsmanId: id, type: "Apuração", message: "Apuração iniciada pelo setor responsável.", employeeId: context.employee.id });
    await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: id, userId: context.user.id, employeeId: context.employee.id, action: "INVESTIGATION_STARTED" });
  }, { timeoutMs: 5_000 });
  revalidateOmbudsman(id);
}

export async function addOmbudsmanInteraction(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ombudsmanId");
  const message = stringValue(formData, "message");
  const { context } = await scopedOmbudsman(id, "update");
  if (!message) throw new Error("Informe o registro da apuracao.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.insert(ombudsmanInteractions).values({ ombudsmanId: id, type: "Apuração", message, employeeId: context.employee.id });
    await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: id, userId: context.user.id, employeeId: context.employee.id, action: "INTERACTION_ADDED" });
  }, { timeoutMs: 5_000 });
  revalidateOmbudsman(id);
}

export async function respondOmbudsman(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ombudsmanId");
  const response = stringValue(formData, "response");
  const { context, ombudsman } = await scopedOmbudsman(id);
  if (!context.attendanceAccess.isOmbudsman || !response) throw new Error("Somente a Ouvidoria pode registrar uma resposta.");
  if (!["Em Apuração", "Aguardando Resposta"].includes(ombudsman.status)) throw new Error("A manifestacao precisa estar em apuracao ou aguardando resposta.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.update(ombudsmans).set({ response, respondedAt: new Date(), respondedById: context.employee.id, status: "Aguardando Resposta" }).where(eq(ombudsmans.id, id));
    await tx.insert(ombudsmanInteractions).values({ ombudsmanId: id, type: "Resposta", message: response, employeeId: context.employee.id, isInternal: false });
    await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: id, userId: context.user.id, employeeId: context.employee.id, action: "RESPONDED" });
  }, { timeoutMs: 5_000 });
  revalidateOmbudsman(id);
}

export async function concludeOmbudsman(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ombudsmanId");
  const { context, ombudsman } = await scopedOmbudsman(id);
  if (!context.attendanceAccess.isOmbudsman) throw new Error("Somente a Ouvidoria pode concluir manifestacoes.");
  if (!ombudsman.response) throw new Error("Registre a resposta antes de concluir a manifestacao.");
  if (ombudsman.status !== "Aguardando Resposta") throw new Error("A manifestacao precisa aguardar resposta antes da conclusao.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.update(ombudsmans).set({ status: "Concluída", concludedAt: new Date(), concludedById: context.employee.id }).where(eq(ombudsmans.id, id));
    await tx.insert(ombudsmanInteractions).values({ ombudsmanId: id, type: "Conclusão", message: "Manifestacao concluida.", employeeId: context.employee.id });
    await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: id, userId: context.user.id, employeeId: context.employee.id, action: "CONCLUDED" });
  }, { timeoutMs: 5_000 });
  revalidateOmbudsman(id);
}

export async function createProcessFromOmbudsman(formData: FormData): Promise<void> {
  await getTenantContextForModuleOperation("PROCESSOS", "create");
  const id = stringValue(formData, "ombudsmanId");
  const disclosure = assertRedactedOmbudsmanDisclosure(stringValue(formData, "disclosure"));
  const { context, ombudsman } = await scopedOmbudsman(id, "update");
  if (!context.attendanceAccess.isOmbudsman) throw new Error("Somente a Ouvidoria pode formalizar manifestacoes.");
  if (ombudsman.processId) throw new Error("Esta manifestacao ja possui um processo relacionado.");
  if (ombudsman.isConfidential) throw new Error("A formalizacao de manifestacao confidencial exige classificação e aprovação específicas, ainda não configuradas.");
  const process = await withDatabaseTransaction(databaseConnection, async (tx) => {
    const created = await createValidatedProcess(tx, context.employee, context.user.id, {
      processTypeId: stringValue(formData, "processTypeId"), subjectId: stringValue(formData, "subjectId"),
      initialDepartmentId: stringValue(formData, "initialDepartmentId") || null,
      priority: stringValue(formData, "priority") || null,
      // Identity and original narrative are deliberately never copied to a formal process.
      description: `Manifestacao ${ombudsman.protocolNumber}. Resumo autorizado para apuracao formal:\n\n${disclosure}`,
    });
    await tx.update(ombudsmans).set({ processId: created.id }).where(eq(ombudsmans.id, id));
    await tx.insert(ombudsmanInteractions).values({ ombudsmanId: id, type: "Processo", message: `Processo ${created.protocolNumber} gerado com resumo autorizado.`, employeeId: context.employee.id });
    await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: id, userId: context.user.id, employeeId: context.employee.id, action: "PROCESS_CREATED", details: { processId: created.id, redactedSummaryLength: disclosure.length } });
    return created;
  }, { timeoutMs: 5_000 });
  revalidateOmbudsman(id);
  revalidatePath(`/protocolos/processos/${process.id}`);
}

export async function grantOmbudsmanAccess(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ombudsmanId");
  const userId = stringValue(formData, "userId");
  const canViewIdentity = formData.get("canViewIdentity") === "on";
  const { context, ombudsman } = await scopedOmbudsman(id, "update");
  if (!context.attendanceAccess.isAdmin || !ombudsman.isConfidential || !userId) throw new Error("Somente administradores podem conceder acesso a manifestacoes confidenciais.");
  const [user] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.ativo, true))).limit(1);
  if (!user) throw new Error("Usuario invalido ou inativo.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.insert(ombudsmanAccessGrants).values({ ombudsmanId: id, userId, grantedById: context.user.id, canViewIdentity }).onConflictDoUpdate({ target: [ombudsmanAccessGrants.ombudsmanId, ombudsmanAccessGrants.userId], set: { canViewIdentity, grantedById: context.user.id } });
    await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: id, userId: context.user.id, employeeId: context.employee.id, action: "ACCESS_GRANTED", details: { grantedUserId: userId, canViewIdentity } });
  }, { timeoutMs: 5_000 });
  revalidateOmbudsman(id);
}

export async function revokeOmbudsmanAccess(formData: FormData): Promise<void> {
  const id = stringValue(formData, "ombudsmanId");
  const userId = stringValue(formData, "userId");
  const { context, ombudsman } = await scopedOmbudsman(id, "update");
  if (!context.attendanceAccess.isAdmin || !ombudsman.isConfidential || !userId) throw new Error("Somente administradores podem revogar acesso confidencial.");
  await withDatabaseTransaction(databaseConnection, async (tx) => {
    await tx.delete(ombudsmanAccessGrants).where(and(eq(ombudsmanAccessGrants.ombudsmanId, id), eq(ombudsmanAccessGrants.userId, userId)));
    await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: id, userId: context.user.id, employeeId: context.employee.id, action: "ACCESS_REVOKED", details: { revokedUserId: userId } });
  }, { timeoutMs: 5_000 });
  revalidateOmbudsman(id);
}

export async function saveSupportChannel(formData: FormData): Promise<void> {
  const context = await getAttendanceContext("edit");
  if (!context.attendanceAccess.isManager) throw new Error("Somente gestores podem configurar canais.");
  const id = stringValue(formData, "id");
  const name = stringValue(formData, "name");
  const description = stringValue(formData, "description") || null;
  const sortOrder = Number(stringValue(formData, "sortOrder") || "0");
  const isActive = formData.get("isActive") === "on";
  if (!name || !Number.isInteger(sortOrder) || sortOrder < 0) throw new Error("Informe nome e ordem valida para o canal.");
  await withDatabaseTransaction(databaseConnection, async tx => {
    const [existing] = await tx.select({ id: supportChannels.id }).from(supportChannels).where(eq(supportChannels.id, id || "__novo__")).limit(1);
    if (existing) await tx.update(supportChannels).set({ name, description, sortOrder, isActive }).where(eq(supportChannels.id, existing.id));
    else await tx.insert(supportChannels).values({ name, description, sortOrder, isActive });
  }, { timeoutMs: 5_000 });
  revalidateAttendance();
}

export async function saveServiceSubject(formData: FormData): Promise<void> {
  const context = await getAttendanceContext("edit");
  if (!context.attendanceAccess.isManager) throw new Error("Somente gestores podem configurar assuntos.");
  const id = stringValue(formData, "id");
  const name = stringValue(formData, "name");
  const description = stringValue(formData, "description") || null;
  const defaultDepartmentId = stringValue(formData, "defaultDepartmentId") || null;
  const defaultPriority = stringValue(formData, "defaultPriority") || "Normal";
  const dueDaysRaw = stringValue(formData, "defaultDueDays");
  const defaultDueDays = dueDaysRaw ? Number(dueDaysRaw) : null;
  const isActive = formData.get("isActive") === "on";
  if (!name || (defaultDueDays !== null && (!Number.isInteger(defaultDueDays) || defaultDueDays < 1))) throw new Error("Informe um assunto e prazo valido.");
  if (defaultDepartmentId) {
    const [department] = await db.select({ id: departments.id }).from(departments).where(and(eq(departments.id, defaultDepartmentId), eq(departments.isActive, true))).limit(1);
    if (!department) throw new Error("Setor padrao invalido.");
  }
  await withDatabaseTransaction(databaseConnection, async tx => {
    const [existing] = await tx.select({ id: serviceSubjects.id }).from(serviceSubjects).where(eq(serviceSubjects.id, id || "__novo__")).limit(1);
    const values = { name, description, defaultDepartmentId, defaultPriority, defaultDueDays, isActive };
    if (existing) await tx.update(serviceSubjects).set(values).where(eq(serviceSubjects.id, existing.id));
    else await tx.insert(serviceSubjects).values(values);
  }, { timeoutMs: 5_000 });
  revalidateAttendance();
}
