import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { type ProtocolContext, protocolScope } from "@/lib/protocols/access";
import { canPerformModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
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

async function consumeUploads(tx: Prisma.TransactionClient, actorId: string, serviceId: string, version: number, uploadIds: string[], requestId: string, targetRequestId: string | null, processId: string) {
  if (new Set(uploadIds).size !== uploadIds.length) throw new Error("Não repita anexos.");
  const uploads = await tx.portalServiceUpload.findMany({ where: { id: { in: uploadIds }, ownerId: actorId, serviceId, serviceVersion: version, requestId: null, targetRequestId } });
  if (uploads.length !== uploadIds.length) throw new Error("Anexo alheio, consumido ou de outra versão/solicitação.");
  for (const upload of uploads) {
    const count = await tx.portalServiceUpload.updateMany({ where: { id: upload.id, ownerId: actorId, requestId: null }, data: { requestId } });
    if (count.count !== 1) throw new Error("O anexo já foi utilizado.");
    await tx.processDocument.create({ data: { processId, documentId: upload.documentId, purpose: "AUTOATENDIMENTO_REQUERENTE" } });
  }
  return uploads;
}

export async function submitPortalService(db: PrismaClient, actorId: string, raw: unknown) {
  const input = openingSchema.parse(raw);
  const hash = createHash("sha256").update(stable(input)).digest("hex");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_OPEN:${actorId}:${input.requestKey}`}))`;
    if (!await tx.usuario.findFirst({ where: { id: actorId, ativo: true, perfil: { ativo: true } }, select: { id: true } })) throw new AccessError("Conta municipal indisponível.", 403);
    const previous = await tx.portalServiceRequest.findUnique({ where: { actorId_requestKey: { actorId, requestKey: input.requestKey } }, select: { id: true, inputHash: true, process: { select: { protocolNumber: true } } } });
    if (previous) {
      if (previous.inputHash !== hash) throw new Error("A chave já foi utilizada com outro conteúdo.");
      return { id: previous.id, protocolNumber: previous.process.protocolNumber };
    }
    const service = await tx.portalServiceConfiguration.findFirst({ where: { id: input.serviceId, published: true, version: input.version, publicService: { isActive: true } }, include: { publicService: true } });
    if (!service || ["ESPECIALIZADO", "INFORMATIVO"].includes(service.provider)) throw new Error("Serviço/versão indisponível para solicitação. Atualize a página.");
    const configuration = digitalServiceSchema.parse(service.configuration);
    validateServiceValues(configuration, input.values);
    validateMunicipalLocation(configuration, input.latitude, input.longitude);
    if (configuration.acceptance && !input.accepted) throw new Error("Confirme o termo do serviço.");
    if (service.provider === "MANUTENCAO" && !input.location) throw new Error("Informe o endereço da ocorrência.");
    let interested: { personId: string | null; companyId: string | null } | null = null;
    const registryIdentity = await tx.citizenRegistryIdentity.findFirst({ where: { usuarioId: actorId, revokedAt: null, OR: [{ person: { status: "Ativo" } }, { company: { status: "Ativo" } }] }, select: { personId: true, companyId: true } });
    interested = registryIdentity;
    let sourceSnapshot: unknown = null;
    if (service.provider === "CADASTRO" && !input.taxpayerId && registryIdentity) {
      const person = registryIdentity.personId ? await tx.person.findUnique({ where: { id: registryIdentity.personId } }) : null;
      const company = registryIdentity.companyId ? await tx.company.findUnique({ where: { id: registryIdentity.companyId } }) : null;
      sourceSnapshot = person ? { personId: person.id, updatedAt: person.updatedAt.toISOString(), phonePrimary: person.phonePrimary, phoneSecondary: person.phoneSecondary, whatsapp: person.whatsapp, emailSecondary: person.emailSecondary } : company ? { companyId: company.id, updatedAt: company.updatedAt.toISOString(), phone: company.phone, whatsapp: company.whatsapp, emailFiscal: company.emailFiscal, contactPerson: company.contactPerson } : null;
    }
    if (input.taxpayerId || service.provider === "TRIBUTARIO" || (service.provider === "CADASTRO" && !registryIdentity)) {
      const access = await tx.taxpayerPortalAccess.findFirst({ where: { usuarioId: actorId, taxpayerId: input.taxpayerId, accessType: "TITULAR", status: "ATIVO", revokedAt: null, grantedAt: { lte: new Date() } } });
      if (!access || !Array.isArray(access.scopes) || !access.scopes.includes(configuration.taxpayerScope || "PROCESSOS")) throw new AccessError("Sem vínculo vigente para esta operação do contribuinte.", 403);
      const taxpayer = await tx.taxpayer.findFirst({ where: { id: input.taxpayerId, status: "Ativo" }, include: { person: true, company: true } });
      if (!taxpayer || (taxpayer.person && taxpayer.person.status !== "Ativo") || (taxpayer.company && taxpayer.company.status !== "Ativo")) throw new Error("Interessado indisponível.");
      interested = taxpayer;
      sourceSnapshot = taxpayer.person ? { personId: taxpayer.person.id, updatedAt: taxpayer.person.updatedAt.toISOString(), phonePrimary: taxpayer.person.phonePrimary, phoneSecondary: taxpayer.person.phoneSecondary, whatsapp: taxpayer.person.whatsapp, emailSecondary: taxpayer.person.emailSecondary } : taxpayer.company ? { companyId: taxpayer.company.id, updatedAt: taxpayer.company.updatedAt.toISOString(), phone: taxpayer.company.phone, whatsapp: taxpayer.company.whatsapp, emailFiscal: taxpayer.company.emailFiscal, contactPerson: taxpayer.company.contactPerson } : null;
    }
    if (service.provider === "CADASTRO" && Object.keys(input.values).some((key) => !["phonePrimary", "phoneSecondary", "whatsapp", "emailSecondary", "phone", "emailFiscal", "contactPerson"].includes(key))) throw new Error("A atualização automática admite somente contatos. Outros dados exigem serviço administrativo e conferência na origem.");
    if (service.provider === "CADASTRO" && !sourceSnapshot) throw new Error("Vincule o cadastro canônico da pessoa ou empresa antes de solicitar revisão.");
    const process = await openExternalServiceProcess(tx, { actorId, processTypeId: configuration.processTypeId, subjectId: configuration.subjectId, personId: interested?.personId, companyId: interested?.companyId, description: input.description });
    const works = service.provider === "MANUTENCAO" ? await tx.obrasServico.create({ data: { protocolo: process.protocolNumber, tipo: service.publicService.name, descricao: input.description, local: input.location, departmentId: process.currentDepartmentId, status: "Aberto" } }) : null;
    const execution = service.provider === "TRIBUTARIO" ? await executePortalTaxOpening(tx, actorId, input.taxpayerId, process.id, configuration, input.values) : null;
    let reservation = null;
    if (service.provider === "RESERVA") {
      if (!input.startsAt || !configuration.availableSlots.includes(input.startsAt) || new Date(input.startsAt) <= new Date()) throw new Error("Selecione uma vaga futura publicada.");
      reservation = await createScopedSpaceReservation(tx, { spaceId: configuration.spaceId, personId: interested?.personId, companyId: interested?.companyId, startsAt: new Date(input.startsAt), endsAt: new Date(new Date(input.startsAt).getTime() + configuration.slotMinutes * 60000), purpose: input.description, protocolNumber: process.protocolNumber });
    }
    const request = await tx.portalServiceRequest.create({ data: {
      serviceId: service.id, serviceVersion: service.version, snapshot: { name: service.publicService.name, provider: service.provider, configuration, requirements: service.publicService.requirements, steps: service.publicService.steps, deadline: service.publicService.deadline, cost: service.publicService.cost } as Prisma.InputJsonValue,
      actorId, taxpayerId: input.taxpayerId || null, processId: process.id, worksServiceId: works?.id, requestKey: input.requestKey, inputHash: hash,
      executorType: execution?.type || (reservation ? "RESERVA" : "SOLICITACAO"), executorId: execution?.id || reservation?.id, status: execution?.complete ? configuration.instantCompletion ? "CONCLUIDO" : "RESPONDIDO" : "RECEBIDO",
      payload: { ...input, sourceSnapshot } as Prisma.InputJsonValue,
      events: { create: { actorId, kind: "ABERTURA", text: "Solicitação protocolada e encaminhada ao setor responsável.", requestKey: input.requestKey, inputHash: hash } },
    } });
    const uploads = await consumeUploads(tx, actorId, service.id, service.version, input.uploadIds, request.id, null, process.id);
    if (configuration.documents.some((item) => item.required && !uploads.some((upload) => upload.code === item.code))) throw new Error("Envie os documentos obrigatórios do serviço.");
    if (service.provider === "TRIBUTARIO") await tx.taxServiceRequest.create({ data: { taxpayerId: input.taxpayerId, processId: process.id, serviceType: service.slug, status: execution?.complete ? "CONCLUIDO" : "EM_ANALISE_INTERNA" } });
    if (execution) {
      await tx.portalServiceRequestEvent.create({ data: { requestId: request.id, actorId, kind: "EXECUTOR", text: execution.message, requestKey: `executor:${input.requestKey}` } });
      if (execution.complete && configuration.instantCompletion) await tx.process.update({ where: { id: process.id }, data: { status: "Concluído", completedAt: new Date(), expectedCompletionAt: null } });
    }
    if (["RESERVA", "AGENDAMENTO"].includes(service.provider)) {
      if (!input.startsAt || !configuration.availableSlots.includes(input.startsAt) || new Date(input.startsAt) <= new Date()) throw new Error("Selecione uma vaga futura publicada no serviço.");
      const startsAt = new Date(input.startsAt), endsAt = new Date(startsAt.getTime() + configuration.slotMinutes * 60000);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_RESOURCE:${configuration.resourceKey}`}))`;
      const occupied = await tx.portalServiceSchedule.count({ where: { resourceKey: configuration.resourceKey, status: { in: ["PROGRAMADO", "EM_EXECUCAO"] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
      if (occupied) throw new Error("A vaga foi reservada por outra solicitação. Escolha outro horário.");
      await tx.portalServiceSchedule.create({ data: { resourceKey: configuration.resourceKey, startsAt, endsAt, type: service.provider, reason: "Reserva do requerente", createdById: actorId, links: { create: { requestId: request.id } } } });
    }
    await tx.processCitizenAccess.create({ data: { processId: process.id, usuarioId: actorId, grantedByUsuarioId: actorId, reason: "Titular da solicitação externa validada na abertura." } });
    return { id: request.id, protocolNumber: process.protocolNumber };
  }, { timeout: 30000 });
}

export async function readOwnPortalRequest(db: PrismaClient, actorId: string, requestId: string) {
  const request = await db.portalServiceRequest.findFirst({ where: { id: requestId, actorId, process: { citizenAccesses: { some: { usuarioId: actorId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } } }, include: {
    process: { select: { id: true, protocolNumber: true, status: true, expectedCompletionAt: true, currentDepartment: { select: { name: true } } } },
    events: { where: { visible: true }, select: { id: true, kind: true, text: true, documentVersionId: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    uploads: { select: { id: true, code: true, filename: true, documentVersionId: true } },
    worksService: { select: { status: true, scheduledFor: true, completedAt: true } },
    schedules: { select: { id: true, schedule: { select: { id: true, type: true, status: true, startsAt: true, endsAt: true } } } }, rating: true,
  } });
  if (!request) throw new AccessError("Solicitação não encontrada.", 404);
  if ((request.snapshot as { provider: string }).provider === "CADASTRO" && !request.taxpayerId) {
    const identity = await db.citizenRegistryIdentity.findFirst({ where: { usuarioId: actorId, revokedAt: null }, select: { personId: true, companyId: true } });
    const original = (request.payload as { sourceSnapshot: { personId?: string; companyId?: string } }).sourceSnapshot;
    if (!identity || (original.personId && identity.personId !== original.personId) || (original.companyId && identity.companyId !== original.companyId)) throw new AccessError("Vínculo cadastral revogado ou divergente.", 403);
  }
  if (request.taxpayerId) {
    const definition = digitalServiceSchema.parse((request.snapshot as { configuration: unknown }).configuration);
    const access = await db.taxpayerPortalAccess.findFirst({ where: { usuarioId: actorId, taxpayerId: request.taxpayerId, accessType: "TITULAR", status: "ATIVO", revokedAt: null, grantedAt: { lte: new Date() } } });
    if (!access || !Array.isArray(access.scopes) || !access.scopes.includes(definition.taxpayerScope || "PROCESSOS")) throw new AccessError("Vínculo do contribuinte revogado ou fora do escopo.", 403);
  }
  return request;
}

export async function operatePortalRequest(db: PrismaClient, actorId: string, raw: unknown, context?: ProtocolContext) {
  const input = requestOperationSchema.parse(raw);
  const operationHash = createHash("sha256").update(stable(input)).digest("hex");
  const external = ["COMPLEMENTAR", "CANCELAR"].includes(input.operation);
  if (external) await readOwnPortalRequest(db, actorId, input.requestId);
  else if (!context || context.user.id !== actorId || !context.protocolAccess.canUpdate) throw new AccessError("Sem autorização para tratar solicitações.", 403);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_REQUEST:${input.requestId}`}))`;
    const request = await tx.portalServiceRequest.findFirst({ where: { id: input.requestId, ...(external ? { actorId } : { process: protocolScope(context!) }) }, include: { process: true, worksService: true } });
    if (!request || (!external && !context!.protocolAccess.isAdmin && context!.user.departmentId !== request.process.currentDepartmentId)) throw new AccessError("Solicitação não disponível ao titular/setor atual.", 403);
    const prior = await tx.portalServiceRequestEvent.findUnique({ where: { requestId_requestKey: { requestId: request.id, requestKey: input.requestKey } } });
    if (prior) {
      if (prior.inputHash !== operationHash || prior.actorId !== actorId) throw new Error("Chave já utilizada para outra operação.");
      return request;
    }
    if (request.revision !== input.revision) throw new Error("A solicitação mudou. Atualize antes de operar.");
    if (["CONCLUIDO", "CANCELADO"].includes(request.status) && input.operation !== "REABRIR") throw new Error("Solicitação encerrada.");
    if (!external && input.operation !== "NOTA" && request.process.status === "Aguardando Recebimento") throw new Error("Receba o processo central antes de tratar a solicitação.");
    if (input.requiredCodes.length && input.operation !== "EXIGENCIA") throw new Error("Exigências documentais só podem ser definidas pelo setor.");
    const definition = digitalServiceSchema.parse((request.snapshot as { configuration: unknown }).configuration);
    const generic = await tx.genericProcessWorkflowInstance.findUnique({ where: { processId: request.processId }, select: { status: true } });
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
      const links = await tx.portalScheduleRequest.findMany({ where: { requestId: request.id }, select: { scheduleId: true } });
      for (const link of links) {
        if (await tx.portalScheduleRequest.count({ where: { scheduleId: link.scheduleId } }) === 1) await tx.portalServiceSchedule.update({ where: { id: link.scheduleId }, data: { status: "CANCELADO" } });
      }
      if (request.worksServiceId) await tx.obrasServico.update({ where: { id: request.worksServiceId }, data: { status: "Cancelado" } });
      if (request.executorType === "RESERVA" && request.executorId) await tx.culturaReserva.update({ where: { id: request.executorId }, data: { status: "Cancelada" } });
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
      const version = await tx.documentVersion.findFirst({ where: { id: input.documentVersionId, status: { in: ["FINAL", "SIGNED"] }, document: { status: { in: ["Válido", "Assinado"] }, processDocuments: { some: { processId: request.processId } } } }, include: { document: { include: { documentClass: true } }, signatures: true } });
      if (!version || getVersionSignatureStatus(version.signatures) === "PENDING_SIGNATURE" || (version.document.documentClass?.signaturePolicy !== "INTERNAL_ALLOWED" && (version.status !== "SIGNED" || !version.signatures.some((item) => item.status === "SIGNED")))) throw new Error("Documento deve pertencer ao processo, estar válido e atender à assinatura exigida.");
    }
    if (input.operation === "CONCLUIR") {
      if (generic && generic.status !== "CONCLUDED") throw new Error("Conclua o roteiro genérico no processo antes de encerrar o serviço.");
      const provider = (request.snapshot as { provider: string }).provider;
      if (provider === "MANUTENCAO" && request.worksService?.status !== "Concluído") throw new Error("Conclua a execução na origem de Obras antes de encerrar o pedido.");
      if (provider === "RESERVA" && (!canPerformModuleOperation(context!.user, "CULTURA", "update") || !await tx.culturaReserva.findFirst({ where: { id: request.executorId || "", status: { in: ["Aprovada", "Realizada"] } }, select: { id: true } }))) throw new Error("Confirme a reserva na origem Cultura/Esporte antes de encerrar o pedido.");
      if (provider === "TRIBUTARIO") {
        if (!canPerformModuleOperation(context!.user, "TRIBUTACAO", "update") || !await tx.taxServiceRequest.findFirst({ where: { processId: request.processId, status: { in: ["CONCLUIDO", "DEFERIDO", "Concluído", "Deferido"] } }, select: { id: true } })) throw new Error("Conclua a operação tributária na fonte com autorização própria.");
      }
      if (provider === "CADASTRO") {
        if (!canPerformModuleOperation(context!.user, "CADASTROS", "update")) throw new AccessError("Atualização exige permissão de Cadastro Único.", 403);
        const payload = request.payload as unknown as { values: Record<string, string>; sourceSnapshot: { personId?: string; companyId?: string; updatedAt: string } };
        const original = payload.sourceSnapshot;
        if (original.personId) {
          const values = Object.fromEntries(Object.entries(payload.values).filter(([key]) => ["phonePrimary", "phoneSecondary", "whatsapp", "emailSecondary"].includes(key)));
          if (!Object.keys(values).length) throw new Error("O formulário não contém contatos aplicáveis à pessoa física.");
          const result = await tx.person.updateMany({ where: { id: original.personId, updatedAt: new Date(original.updatedAt) }, data: values });
          if (result.count !== 1) throw new Error("Cadastro alterado desde a proposta. Solicite uma nova revisão, preservando esta.");
        } else if (original.companyId) {
          const values = Object.fromEntries(Object.entries(payload.values).filter(([key]) => ["phone", "whatsapp", "emailFiscal", "contactPerson"].includes(key)));
          if (!Object.keys(values).length) throw new Error("O formulário não contém contatos aplicáveis à empresa.");
          const result = await tx.company.updateMany({ where: { id: original.companyId, updatedAt: new Date(original.updatedAt) }, data: values });
          if (result.count !== 1) throw new Error("Cadastro alterado desde a proposta.");
        } else throw new Error("Fonte cadastral não identificada.");
      }
      status = "CONCLUIDO";
    }
    await tx.portalServiceRequestEvent.create({ data: { requestId: request.id, actorId, kind: input.operation, text: input.text, visible: input.operation !== "NOTA", requestKey: input.requestKey, inputHash: operationHash, documentVersionId: input.documentVersionId || null } });
    const result = await tx.portalServiceRequest.update({ where: { id: request.id }, data: { status, revision: { increment: 1 }, ...(input.operation === "EXIGENCIA" ? { pendingDocumentCodes: input.requiredCodes } : input.operation === "COMPLEMENTAR" ? { pendingDocumentCodes: [] } : {}) } });
    const processStatus = ({ CONCLUIDO: "Concluído", CANCELADO: "Cancelado", AGUARDANDO_COMPLEMENTO: "Aguardando Complementação", EM_ANALISE: "Em Análise" } as Record<string, string>)[status];
    if (processStatus && !generic) {
      await tx.process.update({ where: { id: request.processId }, data: { status: processStatus, completedAt: status === "CONCLUIDO" ? new Date() : null } });
    }
    await writeAuditEvent(tx, { actorUsuarioId: actorId, eventType: auditEventTypes.processUpdated, targetType: "PORTAL_SERVICE_REQUEST", targetId: request.id });
    return result;
  }, { timeout: 30000 });
}

export async function ratePortalRequest(db: PrismaClient, actorId: string, requestId: string, raw: unknown) {
  const request = await readOwnPortalRequest(db, actorId, requestId);
  if (!["RESPONDIDO", "CONCLUIDO"].includes(request.status)) throw new Error("Avaliação exige serviço respondido ou concluído.");
  const data = ratingSchema.parse(raw);
  return db.portalServiceRating.upsert({ where: { requestId }, create: { requestId, ...data }, update: data });
}
