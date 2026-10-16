import { config } from "dotenv";
import { saveDigitalService } from "../src/lib/portal-cidadao/catalog";
import { digitalServiceSchema } from "../src/lib/portal-cidadao/services-policy";
import { portalServiceTemplates } from "../src/lib/portal-cidadao/service-templates";
import { writeAuditEvent, auditEventTypes } from "../src/lib/platform/audit-evidence";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-public-services-2026-v1";
const departmentId = `${key}:department`;
const processTypeId = `${key}:type`;
const subjectId = `${key}:subject`;
const decision = "Configuração inicial estimada autorizada: recepção municipal de solicitações, triagem de manutenção e emissão de guia por titular autorizado, com setor explícito e prazo administrativo inicial de 15 dias ajustável; sem prazo legal ou aprovação presumidos.";
const slugs = ["solicitacao-administrativa", "manutencao-servicos-publicos", "guia-arrecadacao"];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const actor = await prisma.usuario.findUniqueOrThrow({ where: { email: "admin@email.com" }, select: { id: true, ativo: true } });
    if (!actor.ativo) throw new Error("Administrador autorizado inativo.");
    const binding = await prisma.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: "p0-current-exe-ug-1" } });
    if (binding.governmentEntityId !== "p0-current-exe") throw new Error("UG do Executivo divergente.");
    const unit = await prisma.budgetUnit.findUniqueOrThrow({ where: { id: binding.budgetUnitId }, select: { secretariatId: true } });
    if (apply) await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
      const department = await tx.department.findUnique({ where: { id: departmentId } });
      if (department && (!department.isActive || department.secretariatId !== unit.secretariatId)) throw new Error("Setor preparado alterado; preservar e conferir.");
      if (!department) await tx.department.create({ data: { id: departmentId, name: "Central de Protocolos e Serviços Municipais", secretariatId: unit.secretariatId } });
      const type = await tx.processType.findUnique({ where: { id: processTypeId } });
      if (type && (!type.isActive || type.initialDepartmentId !== departmentId || type.genericWorkflowEnabled)) throw new Error("Tipo preparado alterado; preservar roteiro atual.");
      if (!type) await tx.processType.create({ data: { id: processTypeId, name: "Solicitação municipal", description: decision, initialDepartmentId: departmentId, defaultSlaDays: 15 } });
      const subject = await tx.subject.findUnique({ where: { id: subjectId } });
      if (subject && (!subject.isActive || subject.processTypeId !== processTypeId || subject.initialDepartmentId !== departmentId)) throw new Error("Assunto preparado alterado; preservar configuração atual.");
      if (!subject) await tx.subject.create({ data: { id: subjectId, name: "Solicitação de serviço municipal", description: decision, processTypeId, initialDepartmentId: departmentId, slaDays: 15 } });
      if (!await tx.auditEvent.findFirst({ where: { targetId: key, targetType: "PORTAL_SERVICE_ROUTING" } })) await writeAuditEvent(tx, { actorUsuarioId: actor.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "PORTAL_SERVICE_ROUTING", targetId: key });
    });
    const results = [];
    for (const slug of slugs) {
      const template = portalServiceTemplates.find(item => item.slug === slug)!;
      const existing = await prisma.portalServiceConfiguration.findUnique({ where: { slug }, select: { id: true, published: true, version: true } });
      if (existing) {
        results.push({ slug, state: "PRESERVED", ...existing });
        continue;
      }
      const configuration = digitalServiceSchema.parse({ ...template.configuration, processTypeId, subjectId,
        acceptance: "Confirmo os dados informados e autorizo seu uso para atendimento da solicitação municipal.",
        executorConfiguration: { ...template.configuration.executorConfiguration, budgetUnitId: binding.budgetUnitId },
      });
      const input = { ...template, published: true, featured: true, requirements: "Conta municipal autorizada; para a guia, vínculo conferido com o contribuinte e o lançamento.", deadline: "Prazo administrativo inicial: 15 dias, sujeito a complementação e configuração municipal.", cost: slug === "guia-arrecadacao" ? "Emissão da guia sem tarifa; valor devido conforme o lançamento original." : "Abertura da solicitação sem tarifa; eventual execução depende de análise do setor.", configuration };
      if (!apply) { results.push({ slug, state: "WOULD_PUBLISH" }); continue; }
      const saved = await saveDigitalService(prisma, actor.id, input);
      await writeAuditEvent(prisma, { actorUsuarioId: actor.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "PORTAL_SERVICE_CONFIGURATION", targetId: saved.id });
      results.push({ slug, state: "PUBLISHED", id: saved.id, version: saved.version });
    }
    console.log(JSON.stringify({ mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", decision, departmentId, processTypeId, subjectId, services: results }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação dos serviços."); process.exitCode = 1; });
