import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { createValidatedProcess } from "@/lib/protocols/service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
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

export async function submitFunctionalRequest(context: AppContext, raw: unknown) {
  const input = requestInput.parse(raw);
  if (!context.user.employeeId) throw new AccessError("Conta sem vínculo funcional.", 403);
  const employeeId = context.user.employeeId;
  const hash = inputHash(input);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_REQUERIMENTO:${input.requestKey}`}))`;
    const employee = await tx.employee.findFirst({ where: { id: employeeId, isActive: true }, include: { person: { include: { addresses: true } } } });
    if (!employee) throw new AccessError("Cadastro funcional inativo.", 403);
    const previous = await tx.hrPortalRequest.findUnique({ where: { requestKey: input.requestKey } });
    if (previous) {
      const payload = functionalRequestPayloadSchema.parse(previous.payload);
      if (previous.employeeId !== employeeId || payload.inputHash !== hash) throw new Error("Chave da solicitação reutilizada com outros dados.");
      const process = await tx.process.findUniqueOrThrow({ where: { id: payload.processId }, select: { id: true, protocolNumber: true } });
      return { requestId: previous.id, ...process };
    }
    const service = (await listFunctionalServices(tx, employeeId)).find(item => item.id === input.serviceId);
    if (!service || service.configuration.version !== input.serviceVersion) throw new Error("Serviço indisponível ou formulário atualizado. Reabra o serviço antes de enviar.");
    const person = employee.person;
    if (!person || person.status !== "Ativo" || !person.rg || !person.addresses.length || !(person.email || person.phonePrimary)) throw new Error("Complete RG, contato e endereço no Cadastro Único antes de protocolar.");
    const values = validateFunctionalValues(service.configuration, input.values);
    if (["FERIAS", "AJUSTE_PONTO"].includes(service.configuration.operation)) {
      const contract = await tx.hrEmploymentContract.findFirst({ where: { id: values.contractId || "__SEM_CONTRATO__", employeeId } });
      if (!contract) throw new AccessError("Selecione um contrato do próprio servidor.", 403);
    }
    if (service.configuration.operation === "AJUSTE_PONTO") {
      const attendance = await tx.attendanceRecord.findFirst({ where: { id: values.attendanceId || "__SEM_PONTO__", employeeId } });
      if (!attendance) throw new AccessError("Registro de ponto indisponível.", 403);
      values.attendanceUpdatedAt = attendance.updatedAt.toISOString();
    }
    if (service.configuration.acceptance && !input.accepted) throw new Error("É necessário concordar com o termo apresentado.");
    if (new Set(input.attachments.map(item => item.code)).size !== input.attachments.length) throw new Error("Documento informado mais de uma vez.");
    const attachments: { code: string; documentId: string }[] = [];
    for (const requirement of service.configuration.requiredDocuments) {
      const reference = input.attachments.find(item => item.code === requirement.code);
      if (!reference) throw new Error(`Anexe ${requirement.label}.`);
      await tx.$queryRaw`SELECT id FROM "HrIntegrationEvent" WHERE id=${reference.uploadEventId} FOR UPDATE`;
      const upload = await tx.hrIntegrationEvent.findFirst({ where: { id: reference.uploadEventId, domain: "PORTAL", eventType: "ANEXO_FUNCIONAL_RECEBIDO" } });
      const data = z.object({ employeeId: z.string(), actorId: z.string(), serviceId: z.string(), serviceVersion: z.number(), code: z.string(), documentId: z.string(), requestId: z.string().nullable() }).parse(upload?.payload);
      if (upload?.status !== "RECEBIDO" || data.employeeId !== employeeId || data.actorId !== context.user.id || data.serviceId !== service.id || data.serviceVersion !== input.serviceVersion || data.code !== requirement.code || data.requestId || upload.result) throw new AccessError("Anexo não pertence a este requerimento.", 403);
      if (!await tx.documentVersion.findFirst({ where: { documentId: data.documentId, versionNumber: 1, status: { in: ["FINAL", "SIGNED"] }, document: { status: { in: ["Válido", "Assinado"] } } }, select: { id: true } })) throw new Error("Anexo cancelado ou indisponível na origem GED.");
      attachments.push({ code: requirement.code, documentId: data.documentId });
    }
    if (input.attachments.length !== attachments.length) throw new Error("Anexo não autorizado pelo serviço.");
    const process = await createValidatedProcess(tx, employee, context.user.id, { processTypeId: service.configuration.processTypeId, subjectId: service.configuration.subjectId, personId: person.id, description: input.description });
    const destination = await tx.process.findUniqueOrThrow({ where: { id: process.id }, select: { currentDepartment: { select: { secretariatId: true } } } });
    const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: service.configuration.budgetUnitId } });
    if (destination.currentDepartment?.secretariatId !== unit.secretariatId) throw new Error("Roteiro inicial incompatível com a unidade responsável pelo serviço.");
    const payload = { origin: "REQUERIMENTO_FUNCIONAL", processId: process.id, serviceId: service.id, serviceName: service.name, configuration: service.configuration, inputHash: hash, description: input.description, values, accepted: input.accepted, attachments, awaitingComplement: false, execution: "AGUARDANDO_DECISAO" };
    const request = await tx.hrPortalRequest.create({ data: { employeeId, actorId: context.user.id, requestKey: input.requestKey, kind: `FUNCIONAL_${service.configuration.operation}`, payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue } });
    await tx.hrPortalRequestBinding.create({ data: { requestId: request.id, processId: process.id, serviceRuleId: service.id, employeeId, actorId: context.user.id, serviceVersion: service.configuration.version } });
    await tx.process.update({ where: { id: process.id }, data: { portalOrigin: "PORTAL_SERVIDOR", portalPurpose: "INTERNO_ENTIDADE" } });
    for (const attachment of attachments) await tx.processDocument.create({ data: { processId: process.id, documentId: attachment.documentId, employeeId, purpose: "REQUERIMENTO_FUNCIONAL" } });
    for (const reference of input.attachments) {
      const upload = await tx.hrIntegrationEvent.findUniqueOrThrow({ where: { id: reference.uploadEventId } });
      await tx.hrIntegrationEvent.update({ where: { id: upload.id }, data: { result: { requestId: request.id }, status: "PROCESSADO" } });
    }
    await tx.processEvent.create({ data: { processId: process.id, employeeId, eventType: "FUNCTIONAL_REQUEST_OPENED", description: "Requerimento funcional recebido.", metadata: JSON.stringify({ requestId: request.id, origin: "PORTAL_SERVIDOR", purpose: "INTERNO_ENTIDADE", serviceId: service.id, version: service.configuration.version }) } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.formSubmit, targetType: "EMPLOYEE_PORTAL_REQUEST", targetId: request.id });
    return { requestId: request.id, id: process.id, protocolNumber: process.protocolNumber };
  });
}

export async function readOwnFunctionalRequest(db: PrismaClient, employeeId: string, requestId: string) {
  const request = await db.hrPortalRequest.findFirst({ where: { id: requestId, employeeId, payload: { path: ["origin"], equals: "REQUERIMENTO_FUNCIONAL" } } });
  if (!request) throw new AccessError("Requerimento indisponível.", 404);
  const payload = functionalRequestPayloadSchema.parse(request.payload);
  const process = await db.process.findUniqueOrThrow({ where: { id: payload.processId }, select: { id: true, protocolNumber: true, status: true, expectedCompletionAt: true, currentDepartment: { select: { name: true } }, currentWorkflowStage: { select: { label: true } }, createdAt: true, completedAt: true } });
  return { request, payload, process };
}

export async function requestFunctionalComplement(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), instructions: z.string().trim().min(10).max(4000), documentCodes: z.array(z.string()).max(20).default([]) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para analisar o requerimento.", 403);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    const payload = functionalRequestPayloadSchema.parse(request.payload);
    assertBudgetUnitAccess(context.user, payload.configuration.budgetUnitId);
    const process = await tx.process.findUniqueOrThrow({ where: { id: payload.processId } });
    if (!isSystemAdministrator(context.user) && process.currentDepartmentId !== context.user.departmentId) throw new AccessError("Requerimento fora do setor responsável.", 403);
    if (request.status !== "EM_ANALISE" || ["Arquivado", "Cancelado", "Concluído"].includes(process.status)) throw new Error("Requerimento não aceita pendências.");
    if (new Set(input.documentCodes).size !== input.documentCodes.length || input.documentCodes.some(code => !payload.configuration.requiredDocuments.some(document => document.code === code))) throw new Error("Documentos de complemento devem pertencer ao formulário enviado.");
    await tx.hrPortalRequest.update({ where: { id: request.id }, data: { payload: JSON.parse(JSON.stringify({ ...payload, awaitingComplement: true, complementDocumentCodes: input.documentCodes })) as Prisma.InputJsonValue } });
    await tx.processEvent.create({ data: { processId: process.id, employeeId: context.user.employeeId, departmentId: process.currentDepartmentId, eventType: "FUNCTIONAL_COMPLEMENT_REQUESTED", description: input.instructions } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.processUpdated, targetType: "EMPLOYEE_PORTAL_REQUEST", targetId: request.id });
  });
}

export async function submitFunctionalComplement(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), description: z.string().trim().min(10).max(4000), requestKey: z.string().min(1).max(160), attachments: z.array(z.object({ code: z.string(), uploadEventId: z.string() }).strict()).max(20).default([]) }).strict().parse(raw);
  const fingerprint = createHash("sha256").update(JSON.stringify({ description: input.description, attachments: [...input.attachments].sort((a, b) => a.code.localeCompare(b.code)) })).digest("hex");
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findFirst({ where: { id: input.requestId, employeeId: context.user.employeeId || "__SEM_VINCULO__" } });
    if (!request || !await tx.employee.findFirst({ where: { id: request.employeeId, isActive: true } })) throw new AccessError("Requerimento indisponível.", 403);
    const payload = functionalRequestPayloadSchema.parse(request.payload);
    const previous = await tx.processEvent.findFirst({ where: { processId: payload.processId, eventType: "FUNCTIONAL_COMPLEMENT", metadata: input.requestKey } });
    if (previous) { if (previous.description !== (input.attachments.length ? `${input.description}\nReferência documental: ${fingerprint}` : input.description)) throw new Error("Complemento repetido com dados diferentes."); return; }
    const process = await tx.process.findUniqueOrThrow({ where: { id: payload.processId } });
    if (!payload.awaitingComplement || request.status !== "EM_ANALISE" || ["Arquivado", "Cancelado", "Concluído"].includes(process.status)) throw new Error("Não há pendência aberta para complementação.");
    if (new Set(input.attachments.map(document => document.code)).size !== input.attachments.length || payload.complementDocumentCodes.some(code => !input.attachments.some(document => document.code === code))) throw new Error("Envie todos os documentos solicitados, sem repetir códigos.");
    const attachments = [...payload.attachments];
    for (const reference of [...input.attachments].sort((a, b) => a.uploadEventId.localeCompare(b.uploadEventId))) {
      if (!payload.configuration.requiredDocuments.some(document => document.code === reference.code)) throw new Error("Documento não configurado para o serviço.");
      await tx.$queryRaw`SELECT id FROM "HrIntegrationEvent" WHERE id=${reference.uploadEventId} FOR UPDATE`;
      const upload = await tx.hrIntegrationEvent.findFirst({ where: { id: reference.uploadEventId, eventType: "ANEXO_FUNCIONAL_RECEBIDO", domain: "PORTAL", status: "RECEBIDO" } });
      const document = z.object({ employeeId: z.string(), actorId: z.string(), targetRequestId: z.string(), code: z.string(), documentId: z.string() }).parse(upload?.payload);
      if (document.employeeId !== request.employeeId || document.actorId !== context.user.id || document.targetRequestId !== request.id || document.code !== reference.code || upload?.result) throw new AccessError("Anexo não pertence a este complemento.", 403);
      if (!await tx.documentVersion.findFirst({ where: { documentId: document.documentId, versionNumber: 1, status: { in: ["FINAL", "SIGNED"] }, document: { status: { in: ["Válido", "Assinado"] } } }, select: { id: true } })) throw new Error("Comprovação indisponível na origem GED.");
      attachments.push({ code: document.code, documentId: document.documentId });
      await tx.processDocument.create({ data: { processId: process.id, documentId: document.documentId, employeeId: request.employeeId, purpose: "REQUERIMENTO_FUNCIONAL" } });
      await tx.hrIntegrationEvent.update({ where: { id: upload!.id }, data: { status: "PROCESSADO", result: { requestId: request.id, complementKey: input.requestKey } } });
    }
    await tx.processEvent.create({ data: { processId: payload.processId, employeeId: request.employeeId, eventType: "FUNCTIONAL_COMPLEMENT", description: input.attachments.length ? `${input.description}\nReferência documental: ${fingerprint}` : input.description, metadata: input.requestKey } });
    await tx.hrPortalRequest.update({ where: { id: request.id }, data: { payload: JSON.parse(JSON.stringify({ ...payload, attachments, awaitingComplement: false, complementDocumentCodes: [] })) as Prisma.InputJsonValue } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.processUpdated, targetType: "EMPLOYEE_PORTAL_REQUEST", targetId: request.id });
  });
}

export async function decideFunctionalRequest(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), status: z.enum(["DEFERIDA", "INDEFERIDA"]), decision: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para decidir o requerimento.", 403);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    const payload = functionalRequestPayloadSchema.parse(request.payload);
    assertBudgetUnitAccess(context.user, payload.configuration.budgetUnitId);
    const process = await tx.process.findUniqueOrThrow({ where: { id: payload.processId } });
    if (!isSystemAdministrator(context.user) && process.currentDepartmentId !== context.user.departmentId) throw new AccessError("Requerimento fora do setor responsável.", 403);
    if (request.status !== "EM_ANALISE") {
      if (request.status === input.status && request.decision === input.decision) return request.id;
      throw new Error("Requerimento já decidido; o histórico foi preservado.");
    }
    if (payload.awaitingComplement || ["Arquivado", "Cancelado", "Concluído"].includes(process.status)) throw new Error("Resolva as pendências e confira a situação do processo antes de decidir.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${request.employeeId}`}))`;
    if (!await tx.employee.findFirst({ where: { id: request.employeeId, isActive: true } })) throw new Error("Titular funcional inativo. Encaminhe o atendimento ao RH.");
    let execution: "EXECUTADA" | "NAO_APLICAVEL" | "PENDENTE" = input.status === "DEFERIDA" && payload.configuration.operation === "SOLICITACAO_RH" ? "PENDENTE" : "NAO_APLICAVEL";
    let reference: string | null = null;
    if (input.status === "DEFERIDA" && payload.configuration.operation === "FERIAS") {
      const values = payload.values;
      const own = await tx.hrEmploymentContract.findFirst({ where: { id: values.contractId, employeeId: request.employeeId } });
      if (!own) throw new Error("Contrato não pertence mais ao titular.");
      const entry = await reserveVacationRightInTransaction(tx, context.user.id, { contractId: own.id, sourceKey: `PORTAL:FERIAS:${request.id}`, periodStart: values.periodStart, periodEnd: values.periodEnd, kind: values.kind, start: values.start, days: values.days, reason: input.decision });
      execution = "EXECUTADA"; reference = entry.id;
    }
    if (input.status === "DEFERIDA" && payload.configuration.operation === "AJUSTE_PONTO") {
      const values = payload.values;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${values.contractId}`}))`;
      await tx.$queryRaw`SELECT id FROM "AttendanceRecord" WHERE id=${values.attendanceId} FOR UPDATE`;
      const attendance = await tx.attendanceRecord.findFirst({ where: { id: values.attendanceId, employeeId: request.employeeId } });
      const contract = await tx.hrEmploymentContract.findFirst({ where: { id: values.contractId, employeeId: request.employeeId }, include: { revisions: true } });
      if (!attendance || !contract || attendance.updatedAt.toISOString() !== values.attendanceUpdatedAt) throw new Error("Ponto ou contrato alterado após o requerimento. Revise o conflito.");
      const historical = resolveContractRevision(contract, contract.revisions, { start: attendance.date, end: attendance.date }).contract;
      if (attendance.date < historical.admittedAt || historical.endsAt && attendance.date > historical.endsAt) throw new Error("Registro fora do período do vínculo.");
      const competence = `${String(attendance.date.getUTCMonth() + 1).padStart(2, "0")}/${attendance.date.getUTCFullYear()}`;
      if (await tx.hrPayrollStatement.count({ where: { contract: { employeeId: request.employeeId }, run: { status: "FECHADA", payroll: { competence } } } }) || await tx.payroll.count({ where: { competence, status: { in: ["Fechada", "Paga"] }, items: { some: { employeeId: request.employeeId } } } })) throw new Error("Competência fechada exige reabertura/ajuste formal na origem RH/Folha antes da alteração do ponto.");
      const update = z.object({ status: z.enum(["Presente", "Falta", "Atraso", "Abonada"]), entryTime: z.union([z.iso.datetime({ offset: true }), z.literal("")]), exitTime: z.union([z.iso.datetime({ offset: true }), z.literal("")]), hoursWorked: z.coerce.number().min(0).max(24), extraHours: z.coerce.number().min(0).max(24), bankHours: z.coerce.number().min(-24).max(24) }).parse(values);
      const entryTime = update.entryTime ? new Date(update.entryTime) : null, exitTime = update.exitTime ? new Date(update.exitTime) : null;
      if (exitTime && (!entryTime || exitTime <= entryTime || exitTime.getTime() - entryTime.getTime() > 86400000)) throw new Error("Intervalo de marcações inválido.");
      const after = await tx.attendanceRecord.update({ where: { id: attendance.id }, data: { ...update, entryTime, exitTime } });
      await reconcileAttendanceSources(tx, context.user.id, request.id, attendance, after, historical);
      await tx.processEvent.create({ data: { processId: process.id, eventType: "FUNCTIONAL_ATTENDANCE_AUDIT", employeeId: context.user.employeeId, metadata: JSON.stringify({ requestId: request.id, before: attendance, after }) } });
      execution = "EXECUTADA"; reference = attendance.id;
    }
    const decidedAt = new Date();
    await tx.hrPortalRequest.update({ where: { id: request.id }, data: { status: input.status, decision: input.decision, decidedBy: context.user.id, decidedAt, payload: JSON.parse(JSON.stringify({ ...payload, execution })) as Prisma.InputJsonValue } });
    await tx.processEvent.create({ data: { processId: process.id, employeeId: context.user.employeeId, departmentId: process.currentDepartmentId, eventType: "FUNCTIONAL_DECISION", description: input.decision, metadata: JSON.stringify({ status: input.status, requestId: request.id }) } });
    if (reference) await tx.processEvent.create({ data: { processId: process.id, employeeId: context.user.employeeId, eventType: "FUNCTIONAL_EXECUTION", description: "Providência funcional aplicada ao registro de origem.", metadata: JSON.stringify({ reference, operation: payload.configuration.operation, requestId: request.id }) } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_PORTAL_DECISION", targetId: request.id });
    return request.id;
  });
}

export async function completeFunctionalDocumentRequest(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), publicationId: z.string().min(1) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para concluir a providência.", 403);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    const payload = functionalRequestPayloadSchema.parse(request.payload);
    assertBudgetUnitAccess(context.user, payload.configuration.budgetUnitId);
    const process = await tx.process.findUniqueOrThrow({ where: { id: payload.processId } });
    if (!isSystemAdministrator(context.user) && process.currentDepartmentId !== context.user.departmentId) throw new AccessError("Requerimento fora do setor responsável.", 403);
    if (request.status !== "DEFERIDA" || payload.configuration.operation !== "SOLICITACAO_RH") throw new Error("Conclusão documental exige requerimento RH deferido.");
    if (payload.execution === "EXECUTADA") {
      if (payload.resultPublicationId !== input.publicationId) throw new Error("Providência já concluída com outro resultado.");
      return request.id;
    }
    if (payload.execution !== "PENDENTE" || ["Arquivado", "Cancelado", "Concluído"].includes(process.status)) throw new Error("Providência indisponível para execução.");
    const publication = await tx.hrIntegrationEvent.findFirst({ where: { id: input.publicationId, domain: "PORTAL", eventType: "DOCUMENTO_FUNCIONAL_DISPONIBILIZADO", status: "PROCESSADO" } });
    if (!publication) throw new Error("Publicação documental indisponível.");
    const document = publicationPayloadSchema.parse(publication.payload);
    if (document.employeeId !== request.employeeId || document.budgetUnitId !== payload.configuration.budgetUnitId || new Date(document.releaseAt) > new Date()) throw new Error("O resultado deve estar liberado para o titular e UG do requerimento.");
    const version = await tx.documentVersion.findFirst({ where: { id: document.documentVersionId, hashSha256: document.hashSha256, status: { in: ["FINAL", "SIGNED"] }, document: { status: "Válido", person: { employee: { id: request.employeeId } } } } });
    if (!version) throw new Error("Versão documental indisponível ou sem titularidade válida.");
    await tx.hrPortalRequest.update({ where: { id: request.id }, data: { payload: JSON.parse(JSON.stringify({ ...payload, execution: "EXECUTADA", resultPublicationId: publication.id })) as Prisma.InputJsonValue } });
    await tx.processEvent.create({ data: { processId: process.id, employeeId: context.user.employeeId, eventType: "FUNCTIONAL_EXECUTION", description: "Documento de resultado liberado para o titular.", metadata: JSON.stringify({ requestId: request.id, publicationId: publication.id, documentVersionId: version.id }) } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_PORTAL_EXECUTION", targetId: request.id });
    return request.id;
  });
}
