import { config } from "dotenv";
import { createHash } from "node:crypto";
import { publishGenericWorkflowDefinition } from "../src/lib/protocols/generic-workflow-definition-service";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const decision = "Aurora das Veredas — roteiro inicial estimado de viagens: revisão RH e liberação Financeiro, três dias corridos por etapa; ajustável por nova versão publicada.";
const hash = createHash("sha256").update(decision).digest("hex");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"AURORA:DIARIAS:ROTEIROS:2026:v1"}))`;
      const units = await tx.planningEntityUnit.findMany({ where: { governmentEntity: { code: { in: ["AURORA-EXEC", "AURORA-LEG"] } } }, include: { governmentEntity: true, budgetUnit: true }, orderBy: { budgetUnitId: "asc" } });
      if (!units.length) throw new Error("Identidades municipais devem estar configuradas antes dos roteiros.");
      const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
      const rows = [];
      for (const unit of units.filter((row, index) => units.findIndex(candidate => candidate.governmentEntityId === row.governmentEntityId) === index)) {
        const prefix = `aurora-travel-workflow:${unit.governmentEntityId}`;
        const definitionId = `${prefix}:v1`;
        const departments = [`${prefix}:rh`, `${prefix}:finance`];
        const existing = await tx.genericProcessWorkflowDefinition.findUnique({ where: { id: definitionId }, include: { stages: { orderBy: { position: "asc" } } } });
        if (existing && (existing.status !== "PUBLISHED" || existing.version !== 1 || existing.stages.length !== 2 || existing.stages.some((stage, index) => stage.departmentId !== departments[index] || stage.slaCalendarDays !== 3))) throw new Error(`Roteiro inicial divergente ${definitionId}; preservar e revisar em nova versão.`);
        if (apply && !existing) {
          for (const [index, id] of departments.entries()) await tx.department.create({ data: { id, name: `${unit.governmentEntity.name} — ${index === 0 ? "Revisão de viagens RH" : "Liberação financeira de viagens"}`, secretariatId: unit.budgetUnit.secretariatId, isActive: true } });
          await tx.processType.create({ data: { id: prefix, name: `${unit.governmentEntity.name} — viagens municipais`, genericWorkflowEnabled: true, requiresInterested: true, description: decision, subjects: { create: { id: `${prefix}:subject`, name: "Diária municipal", requiresInterested: true } } } });
          await tx.genericProcessWorkflowDefinition.create({ data: { id: definitionId, processTypeId: prefix, version: 1, stages: { create: departments.map((departmentId, index) => ({ position: index + 1, departmentId, label: index === 0 ? "Revisão RH" : "Autorização e empenho", slaCalendarDays: 3 })) } } });
          await publishGenericWorkflowDefinition(tx, definitionId, actor.id);
          await tx.financialAuditLog.create({ data: { action: "ADOPT_MUNICIPAL_TRAVEL_WORKFLOW", entityType: "GenericProcessWorkflowDefinition", entityId: definitionId, authorUsuarioId: actor.id, payload: { hash, decision, governmentEntityId: unit.governmentEntityId, budgetUnitId: unit.budgetUnitId } } });
        }
        rows.push({ budgetUnitIds: units.filter(row => row.governmentEntityId === unit.governmentEntityId).map(row => row.budgetUnitId), governmentEntityId: unit.governmentEntityId, processTypeId: prefix, subjectId: `${prefix}:subject`, definitionId });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", hash, decision, rows };
    }, { timeout: 60000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
