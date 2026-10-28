import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { portalServiceConfigurations, portalServiceVersions, publicServices } from "@/db/schema/portal-services";
import { processSubjects, processTypes, processWorkflowStages } from "@/db/schema/processes";
import { culturalSpaces } from "@/db/schema/culture";
import { documentClasses } from "@/db/schema/document-workflow";
import { judicialBudgetUnits } from "@/db/schema/process-judicial";
import { portalTaxServiceActivities, portalItbiTransactionTypes } from "@/db/schema/portal-fiscal";
import { digitalServiceSchema, saveDigitalServiceSchema } from "./services-policy";

export async function listDigitalServices(db: DatabaseExecutor, query: { q?: string; group?: string; audience?: string } = {}) {
  const pattern = `%${(query.q || "").replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.select({ service: portalServiceConfigurations, publicService: publicServices }).from(portalServiceConfigurations).innerJoin(publicServices, eq(publicServices.id, portalServiceConfigurations.publicServiceId)).where(and(eq(portalServiceConfigurations.published, true), eq(publicServices.isActive, true), query.q ? or(ilike(publicServices.name, pattern), ilike(publicServices.description, pattern)) : undefined, query.group ? eq(portalServiceConfigurations.group, query.group) : undefined, query.audience ? eq(portalServiceConfigurations.audience, query.audience) : undefined)).orderBy(desc(portalServiceConfigurations.featured), asc(portalServiceConfigurations.sortOrder), asc(portalServiceConfigurations.slug));
  return rows.map(row => ({ ...row.service, publicService: row.publicService }));
}

export async function saveDigitalService(connection: DatabaseConnection, actorId: string, raw: unknown) {
  const input = saveDigitalServiceSchema.parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL_SERVICE:${input.slug}`}))`);
    const prior = input.id ? (await tx.select().from(portalServiceConfigurations).where(eq(portalServiceConfigurations.id, input.id)).limit(1))[0] : null;
    if (input.id && !prior) throw new Error("Serviço não encontrado.");
    if (prior && prior.slug !== input.slug) throw new Error("Preserve o código do serviço já cadastrado.");
    const operational = !["ESPECIALIZADO", "INFORMATIVO"].includes(input.provider);
    if (input.published && operational) {
      if (!input.requiresLogin) throw new Error("Solicitações pessoais exigem login. Canais anônimos usam a política própria de Ouvidoria.");
      const [subjectRow] = await tx.select({ subject: processSubjects, processType: processTypes }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId)).where(and(eq(processSubjects.id, input.configuration.subjectId), eq(processSubjects.processTypeId, input.configuration.processTypeId), eq(processSubjects.isActive, true))).limit(1);
      const subject = subjectRow ? { ...subjectRow.subject, processType: subjectRow.processType } : null;
      const [{ total: stages }] = await tx.select({ total: count() }).from(processWorkflowStages).where(and(eq(processWorkflowStages.processTypeId, input.configuration.processTypeId), eq(processWorkflowStages.isActive, true)));
      if (!subject?.processType.isActive || !(subject.initialDepartmentId || subject.processType.initialDepartmentId || stages || subject.processType.genericWorkflowEnabled)) throw new Error("Configure tipo, assunto e roteiro/setor ativos antes de publicar.");
      if (["RESERVA", "AGENDAMENTO"].includes(input.provider) && (!input.configuration.resourceKey || !input.configuration.availableSlots.length)) throw new Error("Defina o recurso, as vagas e a duração da reserva.");
      if (input.provider === "RESERVA" && !(await tx.select({ id: culturalSpaces.id }).from(culturalSpaces).where(and(eq(culturalSpaces.id, input.configuration.spaceId), eq(culturalSpaces.active, true), eq(culturalSpaces.status, "Disponível"))).limit(1)).length) throw new Error("Vincule um espaço disponível da fonte Cultura/Esporte.");
      if (["CADASTRO", "TRIBUTARIO"].includes(input.provider) && !input.configuration.taxpayerScope) throw new Error("Defina o escopo do contribuinte para esta operação.");
      if (input.configuration.executor !== "SOLICITACAO") {
        const requiredScope = ({ GUIA: "DAM", NFSE_AVULSA: "NFSE", ITBI: "ITBI" } as const)[input.configuration.executor];
        if (input.configuration.taxpayerScope !== requiredScope) throw new Error(`Configure o escopo ${requiredScope} para este executor fiscal.`);
        if (input.provider !== "TRIBUTARIO" || !(await tx.select({ id: judicialBudgetUnits.id }).from(judicialBudgetUnits).where(eq(judicialBudgetUnits.id, input.configuration.executorConfiguration.budgetUnitId)).limit(1)).length) throw new Error("Executor fiscal exige provedor tributário e unidade gestora configurada.");
        if (input.configuration.executor === "NFSE_AVULSA" && !(await tx.select({ id: portalTaxServiceActivities.id }).from(portalTaxServiceActivities).where(and(eq(portalTaxServiceActivities.id, input.configuration.executorConfiguration.serviceActivityId), eq(portalTaxServiceActivities.isActive, true))).limit(1)).length) throw new Error("Selecione atividade fiscal ativa para a NFS-e avulsa.");
        if (input.configuration.executor === "ITBI" && !(await tx.select({ id: portalItbiTransactionTypes.id }).from(portalItbiTransactionTypes).where(and(eq(portalItbiTransactionTypes.id, input.configuration.executorConfiguration.transactionTypeId), eq(portalItbiTransactionTypes.isActive, true))).limit(1)).length) throw new Error("Selecione tipo de transmissão ativo para o ITBI.");
        if (input.configuration.instantCompletion && (input.configuration.executor !== "GUIA" || subject.processType.genericWorkflowEnabled || stages)) throw new Error("Conclusão instantânea exige emissão de guia em assunto sem roteiro de análise.");
      }
    }
    if (input.published && input.provider === "ESPECIALIZADO" && !input.configuration.targetPath) throw new Error("Informe o destino especializado.");
    for (const requirement of input.configuration.documents) if (!(await tx.select({ id: documentClasses.id }).from(documentClasses).where(and(eq(documentClasses.code, requirement.documentClassCode), eq(documentClasses.isActive, true))).limit(1)).length) throw new Error(`Classe documental indisponível: ${requirement.label}.`);
    const publicData = { name: input.name, description: input.description, target: input.audience, requirements: input.requirements, steps: input.steps, deadline: input.deadline, cost: input.cost, linkUrl: input.configuration.targetPath || null, isActive: true };
    const [common] = prior ? await tx.update(publicServices).set(publicData).where(eq(publicServices.id, prior.publicServiceId)).returning() : await tx.insert(publicServices).values(publicData).returning();
    const version = (prior?.version || 0) + 1;
    const data = { publicServiceId: common.id, slug: input.slug, group: input.group, audience: input.audience, provider: input.provider, requiresLogin: input.requiresLogin, published: input.published, featured: input.featured, sortOrder: input.sortOrder, version, configuration: input.configuration };
    const [service] = prior ? await tx.update(portalServiceConfigurations).set(data).where(eq(portalServiceConfigurations.id, prior.id)).returning() : await tx.insert(portalServiceConfigurations).values(data).returning();
    await tx.insert(portalServiceVersions).values({ serviceId: service.id, version, createdById: actorId, snapshot: { ...publicData, ...data } });
    return service;
  }, { timeoutMs: 5_000 });
}

export async function readDigitalService(db: DatabaseExecutor, slug: string) {
  const [row] = await db.select({ service: portalServiceConfigurations, publicService: publicServices }).from(portalServiceConfigurations).innerJoin(publicServices, eq(publicServices.id, portalServiceConfigurations.publicServiceId)).where(and(eq(portalServiceConfigurations.slug, slug), eq(portalServiceConfigurations.published, true), eq(publicServices.isActive, true))).limit(1);
  const item = row ? { ...row.service, publicService: row.publicService } : null;
  return item ? { ...item, definition: digitalServiceSchema.parse(item.configuration) } : null;
}
