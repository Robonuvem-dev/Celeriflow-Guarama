import { Prisma, type PrismaClient } from "@prisma/client";
import { digitalServiceSchema, saveDigitalServiceSchema } from "./services-policy";

export async function listDigitalServices(db: PrismaClient, query: { q?: string; group?: string; audience?: string } = {}) {
  return db.portalServiceConfiguration.findMany({ where: {
    published: true, publicService: { isActive: true, ...(query.q ? { OR: [{ name: { contains: query.q, mode: "insensitive" } }, { description: { contains: query.q, mode: "insensitive" } }] } : {}) },
    ...(query.group ? { group: query.group } : {}), ...(query.audience ? { audience: query.audience } : {}),
  }, include: { publicService: true }, orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { slug: "asc" }] });
}

export async function saveDigitalService(db: PrismaClient, actorId: string, raw: unknown) {
  const input = saveDigitalServiceSchema.parse(raw);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_SERVICE:${input.slug}`}))`;
    const prior = input.id ? await tx.portalServiceConfiguration.findUniqueOrThrow({ where: { id: input.id } }) : null;
    if (prior && prior.slug !== input.slug) throw new Error("Preserve o código do serviço já cadastrado.");
    const operational = !["ESPECIALIZADO", "INFORMATIVO"].includes(input.provider);
    if (input.published && operational) {
      if (!input.requiresLogin) throw new Error("Solicitações pessoais exigem login. Canais anônimos usam a política própria de Ouvidoria.");
      const subject = await tx.subject.findFirst({ where: { id: input.configuration.subjectId, processTypeId: input.configuration.processTypeId, isActive: true }, include: { processType: true } });
      if (!subject?.processType.isActive || !(subject.initialDepartmentId || subject.processType.initialDepartmentId || await tx.processWorkflowStage.count({ where: { processTypeId: subject.processTypeId, isActive: true } }) || subject.processType.genericWorkflowEnabled)) throw new Error("Configure tipo, assunto e roteiro/setor ativos antes de publicar.");
      if (["RESERVA", "AGENDAMENTO"].includes(input.provider) && (!input.configuration.resourceKey || !input.configuration.availableSlots.length)) throw new Error("Defina o recurso, as vagas e a duração da reserva.");
      if (input.provider === "RESERVA" && !await tx.culturaEspaco.findFirst({ where: { id: input.configuration.spaceId, active: true, status: "Disponível" }, select: { id: true } })) throw new Error("Vincule um espaço disponível da fonte Cultura/Esporte.");
      if (["CADASTRO", "TRIBUTARIO"].includes(input.provider) && !input.configuration.taxpayerScope) throw new Error("Defina o escopo do contribuinte para esta operação.");
      if (input.configuration.executor !== "SOLICITACAO") {
        const requiredScope = ({ GUIA: "DAM", NFSE_AVULSA: "NFSE", ITBI: "ITBI" } as const)[input.configuration.executor];
        if (input.configuration.taxpayerScope !== requiredScope) throw new Error(`Configure o escopo ${requiredScope} para este executor fiscal.`);
        if (input.provider !== "TRIBUTARIO" || !await tx.budgetUnit.findUnique({ where: { id: input.configuration.executorConfiguration.budgetUnitId }, select: { id: true } })) throw new Error("Executor fiscal exige provedor tributário e unidade gestora configurada.");
        if (input.configuration.executor === "NFSE_AVULSA" && !await tx.taxServiceActivity.findFirst({ where: { id: input.configuration.executorConfiguration.serviceActivityId, isActive: true }, select: { id: true } })) throw new Error("Selecione atividade fiscal ativa para a NFS-e avulsa.");
        if (input.configuration.executor === "ITBI" && !await tx.itbiTransactionType.findFirst({ where: { id: input.configuration.executorConfiguration.transactionTypeId, isActive: true }, select: { id: true } })) throw new Error("Selecione tipo de transmissão ativo para o ITBI.");
        if (input.configuration.instantCompletion && (input.configuration.executor !== "GUIA" || subject.processType.genericWorkflowEnabled || await tx.processWorkflowStage.count({ where: { processTypeId: subject.processTypeId, isActive: true } }))) throw new Error("Conclusão instantânea exige emissão de guia em assunto sem roteiro de análise.");
      }
    }
    if (input.published && input.provider === "ESPECIALIZADO" && !input.configuration.targetPath) throw new Error("Informe o destino especializado.");
    for (const requirement of input.configuration.documents) if (!await tx.documentClass.findFirst({ where: { code: requirement.documentClassCode, isActive: true }, select: { id: true } })) throw new Error(`Classe documental indisponível: ${requirement.label}.`);
    const publicData = { name: input.name, description: input.description, target: input.audience, requirements: input.requirements, steps: input.steps, deadline: input.deadline, cost: input.cost, linkUrl: input.configuration.targetPath || null, isActive: true };
    const common = prior ? await tx.publicService.update({ where: { id: prior.publicServiceId }, data: publicData }) : await tx.publicService.create({ data: publicData });
    const version = (prior?.version || 0) + 1;
    const data = { publicServiceId: common.id, slug: input.slug, group: input.group, audience: input.audience, provider: input.provider, requiresLogin: input.requiresLogin, published: input.published, featured: input.featured, sortOrder: input.sortOrder, version, configuration: input.configuration as Prisma.InputJsonValue };
    const service = prior ? await tx.portalServiceConfiguration.update({ where: { id: prior.id }, data }) : await tx.portalServiceConfiguration.create({ data });
    await tx.portalServiceVersion.create({ data: { serviceId: service.id, version, createdById: actorId, snapshot: { ...publicData, ...data } as Prisma.InputJsonValue } });
    return service;
  });
}

export async function readDigitalService(db: PrismaClient, slug: string) {
  const item = await db.portalServiceConfiguration.findFirst({ where: { slug, published: true, publicService: { isActive: true } }, include: { publicService: true } });
  return item ? { ...item, definition: digitalServiceSchema.parse(item.configuration) } : null;
}
