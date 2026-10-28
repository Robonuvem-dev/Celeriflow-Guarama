import { config } from "dotenv";
import { saveDigitalService } from "../src/lib/portal-cidadao/catalog";
import { digitalServiceSchema } from "../src/lib/portal-cidadao/services-policy";
import { portalServiceTemplates } from "../src/lib/portal-cidadao/service-templates";
import { insertAuditEvent } from "../src/db/repositories/platform/audit";
import { auditEventTypes } from "../src/lib/contracts/audit";
import { and, eq, sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { users } from "../src/db/schema/identity";
import { departments } from "../src/db/schema/administration";
import { planningEntityUnits } from "../src/db/schema/planning-catalog";
import { judicialBudgetUnits } from "../src/db/schema/process-judicial";
import { processTypes, processSubjects } from "../src/db/schema/processes";
import { portalServiceConfigurations } from "../src/db/schema/portal-services";
import { auditEvents } from "../src/db/schema/audit";

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
  const { db, databaseConnection } = await import("../src/db/client");
  try {
    const [actor] = await db.select({ id: users.id, ativo: users.ativo }).from(users).where(eq(users.email, "admin@email.com")).limit(1);
    if (!actor) throw new Error("Administrador autorizado não encontrado.");
    if (!actor.ativo) throw new Error("Administrador autorizado inativo.");
    const [binding] = await db.select().from(planningEntityUnits).where(eq(planningEntityUnits.budgetUnitId, "p0-current-exe-ug-1")).limit(1);
    if (!binding) throw new Error("UG do Executivo não encontrada.");
    if (binding.governmentEntityId !== "p0-current-exe") throw new Error("UG do Executivo divergente.");
    const [unit] = await db.select({ secretariatId: judicialBudgetUnits.secretariatId }).from(judicialBudgetUnits).where(eq(judicialBudgetUnits.id, binding.budgetUnitId)).limit(1);
    if (!unit) throw new Error("UG do Executivo não encontrada.");
    if (apply) await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
      const [department] = await tx.select().from(departments).where(eq(departments.id, departmentId)).limit(1);
      if (department && (!department.isActive || department.secretariatId !== unit.secretariatId)) throw new Error("Setor preparado alterado; preservar e conferir.");
      if (!department) await tx.insert(departments).values({ id: departmentId, name: "Central de Protocolos e Serviços Municipais", secretariatId: unit.secretariatId });
      const [type] = await tx.select().from(processTypes).where(eq(processTypes.id, processTypeId)).limit(1);
      if (type && (!type.isActive || type.initialDepartmentId !== departmentId || type.genericWorkflowEnabled)) throw new Error("Tipo preparado alterado; preservar roteiro atual.");
      if (!type) await tx.insert(processTypes).values({ id: processTypeId, name: "Solicitação municipal", description: decision, initialDepartmentId: departmentId, defaultSlaDays: 15 });
      const [subject] = await tx.select().from(processSubjects).where(eq(processSubjects.id, subjectId)).limit(1);
      if (subject && (!subject.isActive || subject.processTypeId !== processTypeId || subject.initialDepartmentId !== departmentId)) throw new Error("Assunto preparado alterado; preservar configuração atual.");
      if (!subject) await tx.insert(processSubjects).values({ id: subjectId, name: "Solicitação de serviço municipal", description: decision, processTypeId, initialDepartmentId: departmentId, slaDays: 15 });
      if (!(await tx.select({ id: auditEvents.id }).from(auditEvents).where(and(eq(auditEvents.targetId, key), eq(auditEvents.targetType, "PORTAL_SERVICE_ROUTING"))).limit(1)).length) await insertAuditEvent(tx, { actorUsuarioId: actor.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "PORTAL_SERVICE_ROUTING", targetId: key });
    }, { timeoutMs: 5_000 });
    const results = [];
    for (const slug of slugs) {
      const template = portalServiceTemplates.find(item => item.slug === slug)!;
      const [existing] = await db.select({ id: portalServiceConfigurations.id, published: portalServiceConfigurations.published, version: portalServiceConfigurations.version }).from(portalServiceConfigurations).where(eq(portalServiceConfigurations.slug, slug)).limit(1);
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
      const saved = await saveDigitalService(databaseConnection, actor.id, input);
      await insertAuditEvent(db, { actorUsuarioId: actor.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "PORTAL_SERVICE_CONFIGURATION", targetId: saved.id });
      results.push({ slug, state: "PUBLISHED", id: saved.id, version: saved.version });
    }
    console.log(JSON.stringify({ mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", decision, departmentId, processTypeId, subjectId, services: results }, null, 2));
  } finally { await databaseConnection.pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação dos serviços."); process.exitCode = 1; });
