import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { activePortalEmployee, changePortalEvent, insertPortalRequest, portalCount, portalEvent, portalFirst, portalRequest, portalRequired, requiredPortalRequest } from "@/db/repositories/portal-servidor/records";
import { portalEmployeeProfile } from "@/db/repositories/portal-servidor/profile";
import { portalContracts } from "@/db/repositories/portal-servidor/contracts";
import { employeePortalRequests, employeePortalRequestBindings } from "@/db/schema/employee-portal";
import { processes, processDocuments, processEvents } from "@/db/schema/processes";
import type { AttendanceRecord } from "@/lib/contracts/personnel";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { createValidatedProcess } from "@/lib/protocols/service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { functionalServiceSchema, listFunctionalServices, validateFunctionalValues } from "./service-catalog";
import { reserveVacationRightInTransaction } from "@/lib/rh/vacation-rights";
import { resolveContractRevision } from "@/lib/rh/contract-timeline";
import { publicationPayloadSchema } from "./publication-contract";
import { reconcileAttendanceSources } from "@/lib/rh/attendance-reconciliation";

const requestInput = z.object({
  requestKey: z.string().min(1).max(160), serviceId: z.string().min(1), serviceVersion: z.number().int().positive(),
  description: z.string().trim().min(10).max(4000), values: z.record(z.string(), z.string().max(4000)),
  accepted: z.boolean(), attachments: z.array(z.object({ code: z.string().min(1), uploadEventId: z.string().min(1) }).strict()).max(20),
}).strict();

export const functionalRequestPayloadSchema = z.object({
  origin: z.literal("REQUERIMENTO_FUNCIONAL"), processId: z.string().min(1), serviceId: z.string().min(1), serviceName: z.string(),
  configuration: functionalServiceSchema, inputHash: z.string(), description: z.string(), values: z.record(z.string(), z.string()),
  accepted: z.boolean(), attachments: z.array(z.object({ code: z.string(), documentId: z.string() })),
  awaitingComplement: z.boolean(), execution: z.enum(["AGUARDANDO_DECISAO", "PENDENTE", "EXECUTADA", "NAO_APLICAVEL"]),
  resultPublicationId: z.string().optional(),
  complementDocumentCodes: z.array(z.string()).default([]),
});

function inputHash(input: z.infer<typeof requestInput>) {
  return createHash("sha256").update(JSON.stringify({ ...input, values: Object.fromEntries(Object.entries(input.values).sort(([a], [b]) => a.localeCompare(b))), attachments: [...input.attachments].sort((a, b) => a.code.localeCompare(b.code)) })).digest("hex");
}

export async function submitFunctionalRequest(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = requestInput.parse(raw);
  if (!context.user.employeeId) throw new AccessError("Conta sem vínculo funcional.", 403);
  const employeeId = context.user.employeeId;
  const hash = inputHash(input);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_REQUERIMENTO:${input.requestKey}`}))`);
    const employee = await portalEmployeeProfile(tx, employeeId);
    if (!employee?.isActive) throw new AccessError("Cadastro funcional inativo.", 403);
    const previous = await portalRequest(tx, sql`"requestKey"=${input.requestKey}`);
    if (previous) {
      const payload = functionalRequestPayloadSchema.parse(previous.payload);
      if (previous.employeeId !== employeeId || payload.inputHash !== hash) throw new Error("Chave da solicitação reutilizada com outros dados.");
      const process = await portalRequired<{ id: string; protocolNumber: string }>(tx, sql`SELECT id,"protocolNumber" FROM "Process" WHERE id=${payload.processId}`);
      return { requestId: previous.id, ...process };
    }
    const service = (await listFunctionalServices(tx, employeeId)).find(item => item.id === input.serviceId);
    if (!service || service.configuration.version !== input.serviceVersion) throw new Error("Serviço indisponível ou formulário atualizado. Reabra o serviço antes de enviar.");
    const person = employee.person;
    if (!person || person.status !== "Ativo" || !person.rg || !person.addresses.length || !(person.email || person.phonePrimary)) throw new Error("Complete RG, contato e endereço no Cadastro Único antes de protocolar.");
    const values = validateFunctionalValues(service.configuration, input.values);
    if (["FERIAS", "AJUSTE_PONTO"].includes(service.configuration.operation)) {
      const contract = await portalFirst<{ id: string }>(tx, sql`SELECT id FROM "HrEmploymentContract" WHERE id=${values.contractId || "__SEM_CONTRATO__"} AND "employeeId"=${employeeId} LIMIT 1`);
      if (!contract) throw new AccessError("Selecione um contrato do próprio servidor.", 403);
    }
    if (service.configuration.operation === "AJUSTE_PONTO") {
      const attendance = await portalFirst<AttendanceRecord>(tx, sql`SELECT * FROM "AttendanceRecord" WHERE id=${values.attendanceId || "__SEM_PONTO__"} AND "employeeId"=${employeeId} LIMIT 1`);
      if (!attendance) throw new AccessError("Registro de ponto indisponível.", 403);
      values.attendanceUpdatedAt = attendance.updatedAt.toISOString();
    }
    if (service.configuration.acceptance && !input.accepted) throw new Error("É necessário concordar com o termo apresentado.");
    if (new Set(input.attachments.map(item => item.code)).size !== input.attachments.length) throw new Error("Documento informado mais de uma vez.");
    const attachments: { code: string; documentId: string }[] = [];
    for (const requirement of service.configuration.requiredDocuments) {
      const reference = input.attachments.find(item => item.code === requirement.code);
      if (!reference) throw new Error(`Anexe ${requirement.label}.`);
      await tx.execute(sql`SELECT id FROM "HrIntegrationEvent" WHERE id=${reference.uploadEventId} FOR UPDATE`);
      const upload = await portalEvent(tx, sql`id=${reference.uploadEventId} AND domain='PORTAL' AND "eventType"='ANEXO_FUNCIONAL_RECEBIDO'`);
      const data = z.object({ employeeId: z.string(), actorId: z.string(), serviceId: z.string(), serviceVersion: z.number(), code: z.string(), documentId: z.string(), requestId: z.string().nullable() }).parse(upload?.payload);
      if (upload?.status !== "RECEBIDO" || data.employeeId !== employeeId || data.actorId !== context.user.id || data.serviceId !== service.id || data.serviceVersion !== input.serviceVersion || data.code !== requirement.code || data.requestId || upload.result) throw new AccessError("Anexo não pertence a este requerimento.", 403);
      if (!await portalFirst<{ id: string }>(tx, sql`SELECT v.id FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v."documentId"=${data.documentId} AND v."versionNumber"=1 AND v.status IN ('FINAL','SIGNED') AND d.status IN ('Válido','Assinado') LIMIT 1`)) throw new Error("Anexo cancelado ou indisponível na origem GED.");
      attachments.push({ code: requirement.code, documentId: data.documentId });
    }
    if (input.attachments.length !== attachments.length) throw new Error("Anexo não autorizado pelo serviço.");
    const process = await createValidatedProcess(tx, employee, context.user.id, { processTypeId: service.configuration.processTypeId, subjectId: service.configuration.subjectId, personId: person.id, description: input.description });
    const destination = await portalRequired<{ secretariatId: string | null }>(tx, sql`SELECT d."secretariatId" FROM "Process" p LEFT JOIN "Department" d ON d.id=p."currentDepartmentId" WHERE p.id=${process.id}`);
    const unit = await portalRequired<{ secretariatId: string | null }>(tx, sql`SELECT "secretariatId" FROM "BudgetUnit" WHERE id=${service.configuration.budgetUnitId}`);
    if (destination.secretariatId !== unit.secretariatId) throw new Error("Roteiro inicial incompatível com a unidade responsável pelo serviço.");
    const payload = { origin: "REQUERIMENTO_FUNCIONAL", processId: process.id, serviceId: service.id, serviceName: service.name, configuration: service.configuration, inputHash: hash, description: input.description, values, accepted: input.accepted, attachments, awaitingComplement: false, execution: "AGUARDANDO_DECISAO" };
    const request = await insertPortalRequest(tx, { employeeId, actorId: context.user.id, requestKey: input.requestKey, kind: `FUNCIONAL_${service.configuration.operation}`, payload });
    await tx.insert(employeePortalRequestBindings).values({ requestId: request.id, processId: process.id, serviceRuleId: service.id, employeeId, actorId: context.user.id, serviceVersion: service.configuration.version });
    await tx.update(processes).set({ portalOrigin: "PORTAL_SERVIDOR", portalPurpose: "INTERNO_ENTIDADE" }).where(eq(processes.id, process.id));
    for (const attachment of attachments) await tx.insert(processDocuments).values({ processId: process.id, documentId: attachment.documentId, employeeId, purpose: "REQUERIMENTO_FUNCIONAL" });
    for (const reference of input.attachments) {
      await changePortalEvent(tx, reference.uploadEventId, { result: { requestId: request.id }, status: "PROCESSADO" });
    }
    await tx.insert(processEvents).values({ processId: process.id, employeeId, eventType: "FUNCTIONAL_REQUEST_OPENED", description: "Requerimento funcional recebido.", metadata: JSON.stringify({ requestId: request.id, origin: "PORTAL_SERVIDOR", purpose: "INTERNO_ENTIDADE", serviceId: service.id, version: service.configuration.version }) });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.formSubmit, targetType: "EMPLOYEE_PORTAL_REQUEST", targetId: request.id });
    return { requestId: request.id, id: process.id, protocolNumber: process.protocolNumber };
  });
}

export async function readOwnFunctionalRequest(db: DatabaseExecutor, employeeId: string, requestId: string) {
  const request = await portalRequest(db, sql`id=${requestId} AND "employeeId"=${employeeId} AND payload->>'origin'='REQUERIMENTO_FUNCIONAL'`);
  if (!request) throw new AccessError("Requerimento indisponível.", 404);
  const payload = functionalRequestPayloadSchema.parse(request.payload);
  const row = await portalRequired<{ id: string; protocolNumber: string; status: string; expectedCompletionAt: Date | null; departmentId: string | null; departmentName: string | null; stageId: string | null; stageLabel: string | null; createdAt: Date; completedAt: Date | null }>(db, sql`SELECT p.id,p."protocolNumber",p.status,p."expectedCompletionAt",d.id AS "departmentId",d.name AS "departmentName",s.id AS "stageId",s.label AS "stageLabel",p."createdAt",p."completedAt" FROM "Process" p LEFT JOIN "Department" d ON d.id=p."currentDepartmentId" LEFT JOIN "ProcessWorkflowStage" s ON s.id=p."currentWorkflowStageId" WHERE p.id=${payload.processId}`);
  const process = { id: row.id, protocolNumber: row.protocolNumber, status: row.status, expectedCompletionAt: row.expectedCompletionAt, currentDepartment: row.departmentId ? { name: row.departmentName! } : null, currentWorkflowStage: row.stageId ? { label: row.stageLabel } : null, createdAt: row.createdAt, completedAt: row.completedAt };
  return { request, payload, process };
}

export async function requestFunctionalComplement(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ requestId: z.string().min(1), instructions: z.string().trim().min(10).max(4000), documentCodes: z.array(z.string()).max(20).default([]) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para analisar o requerimento.", 403);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requiredPortalRequest(tx, input.requestId);
    const payload = functionalRequestPayloadSchema.parse(request.payload);
    assertBudgetUnitAccess(context.user, payload.configuration.budgetUnitId);
    const process = await portalRequired<{ id: string; currentDepartmentId: string | null; status: string }>(tx, sql`SELECT id,"currentDepartmentId",status FROM "Process" WHERE id=${payload.processId}`);
    if (!isSystemAdministrator(context.user) && process.currentDepartmentId !== context.user.departmentId) throw new AccessError("Requerimento fora do setor responsável.", 403);
    if (request.status !== "EM_ANALISE" || ["Arquivado", "Cancelado", "Concluído"].includes(process.status)) throw new Error("Requerimento não aceita pendências.");
    if (new Set(input.documentCodes).size !== input.documentCodes.length || input.documentCodes.some(code => !payload.configuration.requiredDocuments.some(document => document.code === code))) throw new Error("Documentos de complemento devem pertencer ao formulário enviado.");
    await tx.update(employeePortalRequests).set({ payload: { ...payload, awaitingComplement: true, complementDocumentCodes: input.documentCodes } }).where(eq(employeePortalRequests.id, request.id));
    await tx.insert(processEvents).values({ processId: process.id, employeeId: context.user.employeeId, departmentId: process.currentDepartmentId, eventType: "FUNCTIONAL_COMPLEMENT_REQUESTED", description: input.instructions });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.processUpdated, targetType: "EMPLOYEE_PORTAL_REQUEST", targetId: request.id });
  });
}

export async function submitFunctionalComplement(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ requestId: z.string().min(1), description: z.string().trim().min(10).max(4000), requestKey: z.string().min(1).max(160), attachments: z.array(z.object({ code: z.string(), uploadEventId: z.string() }).strict()).max(20).default([]) }).strict().parse(raw);
  const fingerprint = createHash("sha256").update(JSON.stringify({ description: input.description, attachments: [...input.attachments].sort((a, b) => a.code.localeCompare(b.code)) })).digest("hex");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await portalRequest(tx, sql`id=${input.requestId} AND "employeeId"=${context.user.employeeId || "__SEM_VINCULO__"}`);
    if (!request || !await activePortalEmployee(tx, request.employeeId)) throw new AccessError("Requerimento indisponível.", 403);
    const payload = functionalRequestPayloadSchema.parse(request.payload);
    const previous = await portalFirst<{ description: string | null }>(tx, sql`SELECT description FROM "ProcessEvent" WHERE "processId"=${payload.processId} AND "eventType"='FUNCTIONAL_COMPLEMENT' AND metadata=${input.requestKey} LIMIT 1`);
    if (previous) { if (previous.description !== (input.attachments.length ? `${input.description}\nReferência documental: ${fingerprint}` : input.description)) throw new Error("Complemento repetido com dados diferentes."); return; }
    const process = await portalRequired<{ id: string; status: string }>(tx, sql`SELECT id,status FROM "Process" WHERE id=${payload.processId}`);
    if (!payload.awaitingComplement || request.status !== "EM_ANALISE" || ["Arquivado", "Cancelado", "Concluído"].includes(process.status)) throw new Error("Não há pendência aberta para complementação.");
    if (new Set(input.attachments.map(document => document.code)).size !== input.attachments.length || payload.complementDocumentCodes.some(code => !input.attachments.some(document => document.code === code))) throw new Error("Envie todos os documentos solicitados, sem repetir códigos.");
    const attachments = [...payload.attachments];
    for (const reference of [...input.attachments].sort((a, b) => a.uploadEventId.localeCompare(b.uploadEventId))) {
      if (!payload.configuration.requiredDocuments.some(document => document.code === reference.code)) throw new Error("Documento não configurado para o serviço.");
      await tx.execute(sql`SELECT id FROM "HrIntegrationEvent" WHERE id=${reference.uploadEventId} FOR UPDATE`);
      const upload = await portalEvent(tx, sql`id=${reference.uploadEventId} AND "eventType"='ANEXO_FUNCIONAL_RECEBIDO' AND domain='PORTAL' AND status='RECEBIDO'`);
      const document = z.object({ employeeId: z.string(), actorId: z.string(), targetRequestId: z.string(), code: z.string(), documentId: z.string() }).parse(upload?.payload);
      if (document.employeeId !== request.employeeId || document.actorId !== context.user.id || document.targetRequestId !== request.id || document.code !== reference.code || upload?.result) throw new AccessError("Anexo não pertence a este complemento.", 403);
      if (!await portalFirst<{ id: string }>(tx, sql`SELECT v.id FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v."documentId"=${document.documentId} AND v."versionNumber"=1 AND v.status IN ('FINAL','SIGNED') AND d.status IN ('Válido','Assinado') LIMIT 1`)) throw new Error("Comprovação indisponível na origem GED.");
      attachments.push({ code: document.code, documentId: document.documentId });
      await tx.insert(processDocuments).values({ processId: process.id, documentId: document.documentId, employeeId: request.employeeId, purpose: "REQUERIMENTO_FUNCIONAL" });
      await changePortalEvent(tx, upload!.id, { status: "PROCESSADO", result: { requestId: request.id, complementKey: input.requestKey } });
    }
    await tx.insert(processEvents).values({ processId: payload.processId, employeeId: request.employeeId, eventType: "FUNCTIONAL_COMPLEMENT", description: input.attachments.length ? `${input.description}\nReferência documental: ${fingerprint}` : input.description, metadata: input.requestKey });
    await tx.update(employeePortalRequests).set({ payload: { ...payload, attachments, awaitingComplement: false, complementDocumentCodes: [] } }).where(eq(employeePortalRequests.id, request.id));
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.processUpdated, targetType: "EMPLOYEE_PORTAL_REQUEST", targetId: request.id });
  });
}

export async function decideFunctionalRequest(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ requestId: z.string().min(1), status: z.enum(["DEFERIDA", "INDEFERIDA"]), decision: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para decidir o requerimento.", 403);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requiredPortalRequest(tx, input.requestId);
    const payload = functionalRequestPayloadSchema.parse(request.payload);
    assertBudgetUnitAccess(context.user, payload.configuration.budgetUnitId);
    const process = await portalRequired<{ id: string; status: string; currentDepartmentId: string | null }>(tx, sql`SELECT id,status,"currentDepartmentId" FROM "Process" WHERE id=${payload.processId}`);
    if (!isSystemAdministrator(context.user) && process.currentDepartmentId !== context.user.departmentId) throw new AccessError("Requerimento fora do setor responsável.", 403);
    if (request.status !== "EM_ANALISE") {
      if (request.status === input.status && request.decision === input.decision) return request.id;
      throw new Error("Requerimento já decidido; o histórico foi preservado.");
    }
    if (payload.awaitingComplement || ["Arquivado", "Cancelado", "Concluído"].includes(process.status)) throw new Error("Resolva as pendências e confira a situação do processo antes de decidir.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${request.employeeId}`}))`);
    if (!await activePortalEmployee(tx, request.employeeId)) throw new Error("Titular funcional inativo. Encaminhe o atendimento ao RH.");
    let execution: "EXECUTADA" | "NAO_APLICAVEL" | "PENDENTE" = input.status === "DEFERIDA" && payload.configuration.operation === "SOLICITACAO_RH" ? "PENDENTE" : "NAO_APLICAVEL";
    let reference: string | null = null;
    if (input.status === "DEFERIDA" && payload.configuration.operation === "FERIAS") {
      const values = payload.values;
      const own = await portalFirst<{ id: string }>(tx, sql`SELECT id FROM "HrEmploymentContract" WHERE id=${values.contractId} AND "employeeId"=${request.employeeId} LIMIT 1`);
      if (!own) throw new Error("Contrato não pertence mais ao titular.");
      const entry = await reserveVacationRightInTransaction(tx, context.user.id, { contractId: own.id, sourceKey: `PORTAL:FERIAS:${request.id}`, periodStart: values.periodStart, periodEnd: values.periodEnd, kind: values.kind, start: values.start, days: values.days, reason: input.decision });
      execution = "EXECUTADA"; reference = entry.id;
    }
    if (input.status === "DEFERIDA" && payload.configuration.operation === "AJUSTE_PONTO") {
      const values = payload.values;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${values.contractId}`}))`);
      await tx.execute(sql`SELECT id FROM "AttendanceRecord" WHERE id=${values.attendanceId} FOR UPDATE`);
      const attendance = await portalFirst<AttendanceRecord>(tx, sql`SELECT * FROM "AttendanceRecord" WHERE id=${values.attendanceId} AND "employeeId"=${request.employeeId} LIMIT 1`);
      const contract = (await portalContracts(tx, sql`id=${values.contractId} AND "employeeId"=${request.employeeId}`))[0];
      if (!attendance || !contract || attendance.updatedAt.toISOString() !== values.attendanceUpdatedAt) throw new Error("Ponto ou contrato alterado após o requerimento. Revise o conflito.");
      const historical = resolveContractRevision(contract, contract.revisions, { start: attendance.date, end: attendance.date }).contract;
      if (attendance.date < historical.admittedAt || historical.endsAt && attendance.date > historical.endsAt) throw new Error("Registro fora do período do vínculo.");
      const competence = `${String(attendance.date.getUTCMonth() + 1).padStart(2, "0")}/${attendance.date.getUTCFullYear()}`;
      if (await portalCount(tx, sql`SELECT count(*) FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" WHERE c."employeeId"=${request.employeeId} AND r.status='FECHADA' AND p.competence=${competence}`) || await portalCount(tx, sql`SELECT count(*) FROM "Payroll" p WHERE p.competence=${competence} AND p.status IN ('Fechada','Paga') AND EXISTS(SELECT 1 FROM "PayrollItem" i WHERE i."payrollId"=p.id AND i."employeeId"=${request.employeeId})`)) throw new Error("Competência fechada exige reabertura/ajuste formal na origem RH/Folha antes da alteração do ponto.");
      const update = z.object({ status: z.enum(["Presente", "Falta", "Atraso", "Abonada"]), entryTime: z.union([z.iso.datetime({ offset: true }), z.literal("")]), exitTime: z.union([z.iso.datetime({ offset: true }), z.literal("")]), hoursWorked: z.coerce.number().min(0).max(24), extraHours: z.coerce.number().min(0).max(24), bankHours: z.coerce.number().min(-24).max(24) }).parse(values);
      const entryTime = update.entryTime ? new Date(update.entryTime) : null, exitTime = update.exitTime ? new Date(update.exitTime) : null;
      if (exitTime && (!entryTime || exitTime <= entryTime || exitTime.getTime() - entryTime.getTime() > 86400000)) throw new Error("Intervalo de marcações inválido.");
      const after = await portalRequired<AttendanceRecord>(tx, sql`UPDATE "AttendanceRecord" SET status=${update.status},"entryTime"=${entryTime},"exitTime"=${exitTime},"hoursWorked"=${update.hoursWorked},"extraHours"=${update.extraHours},"bankHours"=${update.bankHours},"updatedAt"=${new Date()} WHERE id=${attendance.id} RETURNING *`);
      await reconcileAttendanceSources(tx, context.user.id, request.id, attendance, after, historical);
      await tx.insert(processEvents).values({ processId: process.id, eventType: "FUNCTIONAL_ATTENDANCE_AUDIT", employeeId: context.user.employeeId, metadata: JSON.stringify({ requestId: request.id, before: attendance, after }) });
      execution = "EXECUTADA"; reference = attendance.id;
    }
    const decidedAt = new Date();
    await tx.update(employeePortalRequests).set({ status: input.status, decision: input.decision, decidedBy: context.user.id, decidedAt, payload: { ...payload, execution } }).where(eq(employeePortalRequests.id, request.id));
    await tx.insert(processEvents).values({ processId: process.id, employeeId: context.user.employeeId, departmentId: process.currentDepartmentId, eventType: "FUNCTIONAL_DECISION", description: input.decision, metadata: JSON.stringify({ status: input.status, requestId: request.id }) });
    if (reference) await tx.insert(processEvents).values({ processId: process.id, employeeId: context.user.employeeId, eventType: "FUNCTIONAL_EXECUTION", description: "Providência funcional aplicada ao registro de origem.", metadata: JSON.stringify({ reference, operation: payload.configuration.operation, requestId: request.id }) });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_PORTAL_DECISION", targetId: request.id });
    return request.id;
  });
}

export async function completeFunctionalDocumentRequest(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ requestId: z.string().min(1), publicationId: z.string().min(1) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para concluir a providência.", 403);
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requiredPortalRequest(tx, input.requestId);
    const payload = functionalRequestPayloadSchema.parse(request.payload);
    assertBudgetUnitAccess(context.user, payload.configuration.budgetUnitId);
    const process = await portalRequired<{ id: string; currentDepartmentId: string | null; status: string }>(tx, sql`SELECT id,"currentDepartmentId",status FROM "Process" WHERE id=${payload.processId}`);
    if (!isSystemAdministrator(context.user) && process.currentDepartmentId !== context.user.departmentId) throw new AccessError("Requerimento fora do setor responsável.", 403);
    if (request.status !== "DEFERIDA" || payload.configuration.operation !== "SOLICITACAO_RH") throw new Error("Conclusão documental exige requerimento RH deferido.");
    if (payload.execution === "EXECUTADA") {
      if (payload.resultPublicationId !== input.publicationId) throw new Error("Providência já concluída com outro resultado.");
      return request.id;
    }
    if (payload.execution !== "PENDENTE" || ["Arquivado", "Cancelado", "Concluído"].includes(process.status)) throw new Error("Providência indisponível para execução.");
    const publication = await portalEvent(tx, sql`id=${input.publicationId} AND domain='PORTAL' AND "eventType"='DOCUMENTO_FUNCIONAL_DISPONIBILIZADO' AND status='PROCESSADO'`);
    if (!publication) throw new Error("Publicação documental indisponível.");
    const document = publicationPayloadSchema.parse(publication.payload);
    if (document.employeeId !== request.employeeId || document.budgetUnitId !== payload.configuration.budgetUnitId || new Date(document.releaseAt) > new Date()) throw new Error("O resultado deve estar liberado para o titular e UG do requerimento.");
    const version = await portalFirst<{ id: string }>(tx, sql`SELECT v.id FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" JOIN "Person" p ON p.id=d."personId" JOIN "Employee" e ON e."personId"=p.id WHERE v.id=${document.documentVersionId} AND v."hashSha256"=${document.hashSha256} AND v.status IN ('FINAL','SIGNED') AND d.status='Válido' AND e.id=${request.employeeId} LIMIT 1`);
    if (!version) throw new Error("Versão documental indisponível ou sem titularidade válida.");
    await tx.update(employeePortalRequests).set({ payload: { ...payload, execution: "EXECUTADA", resultPublicationId: publication.id } }).where(eq(employeePortalRequests.id, request.id));
    await tx.insert(processEvents).values({ processId: process.id, employeeId: context.user.employeeId, eventType: "FUNCTIONAL_EXECUTION", description: "Documento de resultado liberado para o titular.", metadata: JSON.stringify({ requestId: request.id, publicationId: publication.id, documentVersionId: version.id }) });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_PORTAL_EXECUTION", targetId: request.id });
    return request.id;
  });
}
