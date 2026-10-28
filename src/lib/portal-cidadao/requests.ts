import { createHash } from "node:crypto";
import { and, count, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { portalServiceRequests, portalServiceRequestEvents, portalServiceUploads, portalServiceSchedules, portalScheduleRequests, portalServiceRatings, portalTaxServiceRequests } from "@/db/schema/portal-services";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import { processes, processDocuments, genericWorkflowInstances } from "@/db/schema/processes";
import { processCitizenAccesses } from "@/db/schema/citizen-access";
import { infrastructureServices } from "@/db/schema/infrastructure";
import { culturalReservations } from "@/db/schema/culture";
import { findActivePortalAccount, readPublishedPortalService, readPortalRegistryIdentity, readPortalTaxpayer, readPortalTaxpayerGrant, readPortalRequestForOperation, readOwnPortalRequestData, readPortalResultDocument } from "@/db/repositories/portal-content/services";
import { type ProtocolScopeContext, protocolScopeCondition } from "@/lib/protocols/access";
import { canPerformModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { getVersionSignatureStatus } from "@/lib/documents/document-flow-policy";
import { digitalServiceSchema, openingSchema, requestOperationSchema, ratingSchema } from "./services-policy";
import { validateMunicipalLocation, validateServiceValues } from "./services-policy";
import { openExternalServiceProcess } from "./external-opening";
import { executePortalTaxOpening } from "./tax-executors";
import { createScopedSpaceReservation } from "./space-reservations";

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

async function consumeUploads(tx: DatabaseTransaction, actorId: string, serviceId: string, version: number, uploadIds: string[], requestId: string, targetRequestId: string | null, processId: string) {
  if (new Set(uploadIds).size !== uploadIds.length) throw new Error("Não repita anexos.");
  const uploads = await tx.select().from(portalServiceUploads).where(and(inArray(portalServiceUploads.id, uploadIds), eq(portalServiceUploads.ownerId, actorId), eq(portalServiceUploads.serviceId, serviceId), eq(portalServiceUploads.serviceVersion, version), isNull(portalServiceUploads.requestId), targetRequestId === null ? isNull(portalServiceUploads.targetRequestId) : eq(portalServiceUploads.targetRequestId, targetRequestId)));
  if (uploads.length !== uploadIds.length) throw new Error("Anexo alheio, consumido ou de outra versão/solicitação.");
  for (const upload of uploads) {
    const changed = await tx.update(portalServiceUploads).set({ requestId }).where(and(eq(portalServiceUploads.id, upload.id), eq(portalServiceUploads.ownerId, actorId), isNull(portalServiceUploads.requestId))).returning({ id: portalServiceUploads.id });
    if (changed.length !== 1) throw new Error("O anexo já foi utilizado.");
    await tx.insert(processDocuments).values({ processId, documentId: upload.documentId, purpose: "AUTOATENDIMENTO_REQUERENTE" });
  }
  return uploads;
}

export async function submitPortalService(connection: DatabaseConnection, actorId: string, raw: unknown) {
  const input = openingSchema.parse(raw);
  const hash = createHash("sha256").update(stable(input)).digest("hex");
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_OPEN:${actorId}:${input.requestKey}`}))`);
    if (!await findActivePortalAccount(tx, actorId)) throw new AccessError("Conta municipal indisponível.", 403);
    const [previous] = await tx.select({ id: portalServiceRequests.id, inputHash: portalServiceRequests.inputHash, process: { protocolNumber: processes.protocolNumber } }).from(portalServiceRequests).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).where(and(eq(portalServiceRequests.actorId, actorId), eq(portalServiceRequests.requestKey, input.requestKey))).limit(1);
    if (previous) {
      if (previous.inputHash !== hash) throw new Error("A chave já foi utilizada com outro conteúdo.");
      return { id: previous.id, protocolNumber: previous.process.protocolNumber };
    }
    const service = await readPublishedPortalService(tx, input.serviceId, input.version);
    if (!service || ["ESPECIALIZADO", "INFORMATIVO"].includes(service.provider)) throw new Error("Serviço/versão indisponível para solicitação. Atualize a página.");
    const configuration = digitalServiceSchema.parse(service.configuration);
    validateServiceValues(configuration, input.values);
    validateMunicipalLocation(configuration, input.latitude, input.longitude);
    if (configuration.acceptance && !input.accepted) throw new Error("Confirme o termo do serviço.");
    if (service.provider === "MANUTENCAO" && !input.location) throw new Error("Informe o endereço da ocorrência.");
    let interested: { personId: string | null; companyId: string | null } | null = null;
    const registryIdentity = await readPortalRegistryIdentity(tx, actorId, true);
    interested = registryIdentity;
    let sourceSnapshot: unknown = null;
    if (service.provider === "CADASTRO" && !input.taxpayerId && registryIdentity) {
      const person = registryIdentity.personId ? (await tx.select().from(people).where(eq(people.id, registryIdentity.personId)).limit(1))[0] : null;
      const company = registryIdentity.companyId ? (await tx.select().from(companies).where(eq(companies.id, registryIdentity.companyId)).limit(1))[0] : null;
      sourceSnapshot = person ? { personId: person.id, updatedAt: person.updatedAt.toISOString(), phonePrimary: person.phonePrimary, phoneSecondary: person.phoneSecondary, whatsapp: person.whatsapp, emailSecondary: person.emailSecondary } : company ? { companyId: company.id, updatedAt: company.updatedAt.toISOString(), phone: company.phone, whatsapp: company.whatsapp, emailFiscal: company.emailFiscal, contactPerson: company.contactPerson } : null;
    }
    if (input.taxpayerId || service.provider === "TRIBUTARIO" || (service.provider === "CADASTRO" && !registryIdentity)) {
      const access = await readPortalTaxpayerGrant(tx, actorId, input.taxpayerId);
      if (!access || !Array.isArray(access.scopes) || !access.scopes.includes(configuration.taxpayerScope || "PROCESSOS")) throw new AccessError("Sem vínculo vigente para esta operação do contribuinte.", 403);
      const taxpayer = await readPortalTaxpayer(tx, input.taxpayerId);
      if (!taxpayer || (taxpayer.person && taxpayer.person.status !== "Ativo") || (taxpayer.company && taxpayer.company.status !== "Ativo")) throw new Error("Interessado indisponível.");
      interested = taxpayer;
      sourceSnapshot = taxpayer.person ? { personId: taxpayer.person.id, updatedAt: taxpayer.person.updatedAt.toISOString(), phonePrimary: taxpayer.person.phonePrimary, phoneSecondary: taxpayer.person.phoneSecondary, whatsapp: taxpayer.person.whatsapp, emailSecondary: taxpayer.person.emailSecondary } : taxpayer.company ? { companyId: taxpayer.company.id, updatedAt: taxpayer.company.updatedAt.toISOString(), phone: taxpayer.company.phone, whatsapp: taxpayer.company.whatsapp, emailFiscal: taxpayer.company.emailFiscal, contactPerson: taxpayer.company.contactPerson } : null;
    }
    if (service.provider === "CADASTRO" && Object.keys(input.values).some((key) => !["phonePrimary", "phoneSecondary", "whatsapp", "emailSecondary", "phone", "emailFiscal", "contactPerson"].includes(key))) throw new Error("A atualização automática admite somente contatos. Outros dados exigem serviço administrativo e conferência na origem.");
    if (service.provider === "CADASTRO" && !sourceSnapshot) throw new Error("Vincule o cadastro canônico da pessoa ou empresa antes de solicitar revisão.");
    const process = await openExternalServiceProcess(tx, { actorId, processTypeId: configuration.processTypeId, subjectId: configuration.subjectId, personId: interested?.personId, companyId: interested?.companyId, description: input.description });
    const works = service.provider === "MANUTENCAO" ? (await tx.insert(infrastructureServices).values({ protocolo: process.protocolNumber, tipo: service.publicService.name, descricao: input.description, local: input.location, departmentId: process.currentDepartmentId, status: "Aberto" }).returning())[0] : null;
    const execution = service.provider === "TRIBUTARIO" ? await executePortalTaxOpening(tx, actorId, input.taxpayerId, process.id, configuration, input.values) : null;
    let reservation = null;
    if (service.provider === "RESERVA") {
      if (!input.startsAt || !configuration.availableSlots.includes(input.startsAt) || new Date(input.startsAt) <= new Date()) throw new Error("Selecione uma vaga futura publicada.");
      reservation = await createScopedSpaceReservation(tx, { spaceId: configuration.spaceId, personId: interested?.personId, companyId: interested?.companyId, startsAt: new Date(input.startsAt), endsAt: new Date(new Date(input.startsAt).getTime() + configuration.slotMinutes * 60000), purpose: input.description, protocolNumber: process.protocolNumber });
    }
    const [request] = await tx.insert(portalServiceRequests).values({
      serviceId: service.id, serviceVersion: service.version, snapshot: { name: service.publicService.name, provider: service.provider, configuration, requirements: service.publicService.requirements, steps: service.publicService.steps, deadline: service.publicService.deadline, cost: service.publicService.cost },
      actorId, taxpayerId: input.taxpayerId || null, processId: process.id, worksServiceId: works?.id, requestKey: input.requestKey, inputHash: hash,
      executorType: execution?.type || (reservation ? "RESERVA" : "SOLICITACAO"), executorId: execution?.id || reservation?.id, status: execution?.complete ? configuration.instantCompletion ? "CONCLUIDO" : "RESPONDIDO" : "RECEBIDO",
      payload: { ...input, sourceSnapshot },
    }).returning();
    await tx.insert(portalServiceRequestEvents).values({ requestId: request.id, actorId, kind: "ABERTURA", text: "Solicitação protocolada e encaminhada ao setor responsável.", requestKey: input.requestKey, inputHash: hash });
    const uploads = await consumeUploads(tx, actorId, service.id, service.version, input.uploadIds, request.id, null, process.id);
    if (configuration.documents.some((item) => item.required && !uploads.some((upload) => upload.code === item.code))) throw new Error("Envie os documentos obrigatórios do serviço.");
    if (service.provider === "TRIBUTARIO") await tx.insert(portalTaxServiceRequests).values({ taxpayerId: input.taxpayerId, processId: process.id, serviceType: service.slug, status: execution?.complete ? "CONCLUIDO" : "EM_ANALISE_INTERNA" });
    if (execution) {
      await tx.insert(portalServiceRequestEvents).values({ requestId: request.id, actorId, kind: "EXECUTOR", text: execution.message, requestKey: `executor:${input.requestKey}` });
      if (execution.complete && configuration.instantCompletion) await tx.update(processes).set({ status: "Concluído", completedAt: new Date(), expectedCompletionAt: null }).where(eq(processes.id, process.id));
    }
    if (["RESERVA", "AGENDAMENTO"].includes(service.provider)) {
      if (!input.startsAt || !configuration.availableSlots.includes(input.startsAt) || new Date(input.startsAt) <= new Date()) throw new Error("Selecione uma vaga futura publicada no serviço.");
      const startsAt = new Date(input.startsAt), endsAt = new Date(startsAt.getTime() + configuration.slotMinutes * 60000);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_RESOURCE:${configuration.resourceKey}`}))`);
      const [{ total: occupied }] = await tx.select({ total: count() }).from(portalServiceSchedules).where(and(eq(portalServiceSchedules.resourceKey, configuration.resourceKey), inArray(portalServiceSchedules.status, ["PROGRAMADO", "EM_EXECUCAO"]), lt(portalServiceSchedules.startsAt, endsAt), gt(portalServiceSchedules.endsAt, startsAt)));
      if (occupied) throw new Error("A vaga foi reservada por outra solicitação. Escolha outro horário.");
      const [schedule] = await tx.insert(portalServiceSchedules).values({ resourceKey: configuration.resourceKey, startsAt, endsAt, type: service.provider, reason: "Reserva do requerente", createdById: actorId }).returning({ id: portalServiceSchedules.id });
      await tx.insert(portalScheduleRequests).values({ scheduleId: schedule.id, requestId: request.id });
    }
    await tx.insert(processCitizenAccesses).values({ processId: process.id, usuarioId: actorId, grantedByUsuarioId: actorId, reason: "Titular da solicitação externa validada na abertura." });
    return { id: request.id, protocolNumber: process.protocolNumber };
  }, { timeoutMs: 30_000 });
}

export async function readOwnPortalRequest(db: DatabaseExecutor, actorId: string, requestId: string) {
  const request = await readOwnPortalRequestData(db, actorId, requestId);
  if (!request) throw new AccessError("Solicitação não encontrada.", 404);
  if ((request.snapshot as { provider: string }).provider === "CADASTRO" && !request.taxpayerId) {
    const identity = await readPortalRegistryIdentity(db, actorId);
    const original = (request.payload as { sourceSnapshot: { personId?: string; companyId?: string } }).sourceSnapshot;
    if (!identity || (original.personId && identity.personId !== original.personId) || (original.companyId && identity.companyId !== original.companyId)) throw new AccessError("Vínculo cadastral revogado ou divergente.", 403);
  }
  if (request.taxpayerId) {
    const definition = digitalServiceSchema.parse((request.snapshot as { configuration: unknown }).configuration);
    const access = await readPortalTaxpayerGrant(db, actorId, request.taxpayerId);
    if (!access || !Array.isArray(access.scopes) || !access.scopes.includes(definition.taxpayerScope || "PROCESSOS")) throw new AccessError("Vínculo do contribuinte revogado ou fora do escopo.", 403);
  }
  return request;
}

export async function operatePortalRequest(connection: DatabaseConnection, actorId: string, raw: unknown, context?: ProtocolScopeContext) {
  const input = requestOperationSchema.parse(raw);
  const operationHash = createHash("sha256").update(stable(input)).digest("hex");
  const external = ["COMPLEMENTAR", "CANCELAR"].includes(input.operation);
  if (external) await readOwnPortalRequest(connection.db, actorId, input.requestId);
  else if (!context || context.user.id !== actorId || !context.protocolAccess.canUpdate) throw new AccessError("Sem autorização para tratar solicitações.", 403);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_REQUEST:${input.requestId}`}))`);
    const request = await readPortalRequestForOperation(tx, input.requestId, external ? eq(portalServiceRequests.actorId, actorId) : protocolScopeCondition(context!));
    if (!request || (!external && !context!.protocolAccess.isAdmin && context!.user.departmentId !== request.process.currentDepartmentId)) throw new AccessError("Solicitação não disponível ao titular/setor atual.", 403);
    const [prior] = await tx.select().from(portalServiceRequestEvents).where(and(eq(portalServiceRequestEvents.requestId, request.id), eq(portalServiceRequestEvents.requestKey, input.requestKey))).limit(1);
    if (prior) {
      if (prior.inputHash !== operationHash || prior.actorId !== actorId) throw new Error("Chave já utilizada para outra operação.");
      return request;
    }
    if (request.revision !== input.revision) throw new Error("A solicitação mudou. Atualize antes de operar.");
    if (["CONCLUIDO", "CANCELADO"].includes(request.status) && input.operation !== "REABRIR") throw new Error("Solicitação encerrada.");
    if (!external && input.operation !== "NOTA" && request.process.status === "Aguardando Recebimento") throw new Error("Receba o processo central antes de tratar a solicitação.");
    if (input.requiredCodes.length && input.operation !== "EXIGENCIA") throw new Error("Exigências documentais só podem ser definidas pelo setor.");
    const definition = digitalServiceSchema.parse((request.snapshot as { configuration: unknown }).configuration);
    const [generic] = await tx.select({ status: genericWorkflowInstances.status }).from(genericWorkflowInstances).where(eq(genericWorkflowInstances.processId, request.processId)).limit(1);
    let status = request.status;
    if (input.operation === "COMPLEMENTAR") {
      if (request.status !== "AGUARDANDO_COMPLEMENTO") throw new Error("Não há exigência aberta.");
      const consumed = await consumeUploads(tx, actorId, request.serviceId, request.serviceVersion, input.uploadIds, request.id, request.id, request.processId);
      if (Array.isArray(request.pendingDocumentCodes) && request.pendingDocumentCodes.some((code) => typeof code === "string" && !consumed.some((item) => item.code === code))) throw new Error("Envie todos os documentos exigidos nesta pendência.");
      status = "EM_ANALISE";
    } else if (input.uploadIds.length) throw new Error("Anexos só são aceitos na complementação.");
    if (input.operation === "CANCELAR") {
      if (generic) throw new Error("Cancelamento de fluxo genérico exige tratamento pelo setor responsável.");
      if (request.worksService && ["Em Andamento", "Concluído"].includes(request.worksService.status)) throw new Error("Execução iniciada. Solicite o cancelamento ao setor.");
      status = "CANCELADO";
      const links = await tx.select({ scheduleId: portalScheduleRequests.scheduleId }).from(portalScheduleRequests).where(eq(portalScheduleRequests.requestId, request.id));
      for (const link of links) {
        const [{ total }] = await tx.select({ total: count() }).from(portalScheduleRequests).where(eq(portalScheduleRequests.scheduleId, link.scheduleId));
        if (total === 1) await tx.update(portalServiceSchedules).set({ status: "CANCELADO" }).where(eq(portalServiceSchedules.id, link.scheduleId));
      }
      if (request.worksServiceId) await tx.update(infrastructureServices).set({ status: "Cancelado" }).where(eq(infrastructureServices.id, request.worksServiceId));
      if (request.executorType === "RESERVA" && request.executorId) await tx.update(culturalReservations).set({ status: "Cancelada" }).where(eq(culturalReservations.id, request.executorId));
    }
    if (input.operation === "EXIGENCIA") { if (input.requiredCodes.some((code) => !definition.documents.some((item) => item.code === code))) throw new Error("Exija somente documentos previstos na versão do serviço."); status = "AGUARDANDO_COMPLEMENTO"; }
    if (input.operation === "RESPONDER") status = "RESPONDIDO";
    if (input.operation === "REABRIR") {
      if (generic) throw new Error("Reabertura de fluxo genérico exige tratamento do roteiro na origem.");
      if (!context?.protocolAccess.isAdmin || !["CONCLUIDO", "CANCELADO"].includes(request.status)) throw new Error("Reabertura exige administração e pedido encerrado.");
      status = "EM_ANALISE";
    }
    if (input.documentVersionId) {
      if (external || !["RESPONDER", "CONCLUIR"].includes(input.operation)) throw new Error("Somente o setor libera documentos de resultado.");
      const version = await readPortalResultDocument(tx, request.processId, input.documentVersionId);
      if (!version || getVersionSignatureStatus(version.signatures) === "PENDING_SIGNATURE" || (version.document.documentClass?.signaturePolicy !== "INTERNAL_ALLOWED" && (version.status !== "SIGNED" || !version.signatures.some((item) => item.status === "SIGNED")))) throw new Error("Documento deve pertencer ao processo, estar válido e atender à assinatura exigida.");
    }
    if (input.operation === "CONCLUIR") {
      if (generic && generic.status !== "CONCLUDED") throw new Error("Conclua o roteiro genérico no processo antes de encerrar o serviço.");
      const provider = (request.snapshot as { provider: string }).provider;
      if (provider === "MANUTENCAO" && request.worksService?.status !== "Concluído") throw new Error("Conclua a execução na origem de Obras antes de encerrar o pedido.");
      if (provider === "RESERVA" && (!canPerformModuleOperation(context!.user, "CULTURA", "update") || !(await tx.select({ id: culturalReservations.id }).from(culturalReservations).where(and(eq(culturalReservations.id, request.executorId || ""), inArray(culturalReservations.status, ["Aprovada", "Realizada"]))).limit(1)).length)) throw new Error("Confirme a reserva na origem Cultura/Esporte antes de encerrar o pedido.");
      if (provider === "TRIBUTARIO") {
        if (!canPerformModuleOperation(context!.user, "TRIBUTACAO", "update") || !(await tx.select({ id: portalTaxServiceRequests.id }).from(portalTaxServiceRequests).where(and(eq(portalTaxServiceRequests.processId, request.processId), inArray(portalTaxServiceRequests.status, ["CONCLUIDO", "DEFERIDO", "Concluído", "Deferido"]))).limit(1)).length) throw new Error("Conclua a operação tributária na fonte com autorização própria.");
      }
      if (provider === "CADASTRO") {
        if (!canPerformModuleOperation(context!.user, "CADASTROS", "update")) throw new AccessError("Atualização exige permissão de Cadastro Único.", 403);
        const payload = request.payload as unknown as { values: Record<string, string>; sourceSnapshot: { personId?: string; companyId?: string; updatedAt: string } };
        const original = payload.sourceSnapshot;
        if (original.personId) {
          const values = Object.fromEntries(Object.entries(payload.values).filter(([key]) => ["phonePrimary", "phoneSecondary", "whatsapp", "emailSecondary"].includes(key)));
          if (!Object.keys(values).length) throw new Error("O formulário não contém contatos aplicáveis à pessoa física.");
          const result = await tx.update(people).set(values).where(and(eq(people.id, original.personId), eq(people.updatedAt, new Date(original.updatedAt)))).returning({ id: people.id });
          if (result.length !== 1) throw new Error("Cadastro alterado desde a proposta. Solicite uma nova revisão, preservando esta.");
        } else if (original.companyId) {
          const values = Object.fromEntries(Object.entries(payload.values).filter(([key]) => ["phone", "whatsapp", "emailFiscal", "contactPerson"].includes(key)));
          if (!Object.keys(values).length) throw new Error("O formulário não contém contatos aplicáveis à empresa.");
          const result = await tx.update(companies).set(values).where(and(eq(companies.id, original.companyId), eq(companies.updatedAt, new Date(original.updatedAt)))).returning({ id: companies.id });
          if (result.length !== 1) throw new Error("Cadastro alterado desde a proposta.");
        } else throw new Error("Fonte cadastral não identificada.");
      }
      status = "CONCLUIDO";
    }
    await tx.insert(portalServiceRequestEvents).values({ requestId: request.id, actorId, kind: input.operation, text: input.text, visible: input.operation !== "NOTA", requestKey: input.requestKey, inputHash: operationHash, documentVersionId: input.documentVersionId || null });
    const [result] = await tx.update(portalServiceRequests).set({ status, revision: sql`${portalServiceRequests.revision} + 1`, ...(input.operation === "EXIGENCIA" ? { pendingDocumentCodes: input.requiredCodes } : input.operation === "COMPLEMENTAR" ? { pendingDocumentCodes: [] } : {}) }).where(eq(portalServiceRequests.id, request.id)).returning();
    const processStatus = ({ CONCLUIDO: "Concluído", CANCELADO: "Cancelado", AGUARDANDO_COMPLEMENTO: "Aguardando Complementação", EM_ANALISE: "Em Análise" } as Record<string, string>)[status];
    if (processStatus && !generic) {
      await tx.update(processes).set({ status: processStatus, completedAt: status === "CONCLUIDO" ? new Date() : null }).where(eq(processes.id, request.processId));
    }
    await insertAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.processUpdated, targetType: "PORTAL_SERVICE_REQUEST", targetId: request.id });
    return result;
  }, { timeoutMs: 30_000 });
}

export async function ratePortalRequest(db: DatabaseExecutor, actorId: string, requestId: string, raw: unknown) {
  const request = await readOwnPortalRequest(db, actorId, requestId);
  if (!["RESPONDIDO", "CONCLUIDO"].includes(request.status)) throw new Error("Avaliação exige serviço respondido ou concluído.");
  const data = ratingSchema.parse(raw);
  const [rating] = await db.insert(portalServiceRatings).values({ requestId, ...data }).onConflictDoUpdate({ target: portalServiceRatings.requestId, set: data }).returning();
  return rating;
}
