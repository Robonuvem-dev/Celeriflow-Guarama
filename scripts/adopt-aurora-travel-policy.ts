import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { travelAllowancePolicySchema } from "../src/lib/rh/travel-allowance";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const policy = travelAllowancePolicySchema.parse({ origin: "DIARIAS_MUNICIPAIS", rates: { DF: "600.00", CAPITAL: "450.00", INTERIOR: "300.00", INTERNACIONAL: "200.00" }, minimumDistanceKm: 50, rounding: "HALF_UP", legalReference: "Aurora das Veredas — parâmetros iniciais estimados autorizados para implantação; valores ajustáveis, sem atribuição de lei municipal presumida.", estimated: true });
const hash = createHash("sha256").update(JSON.stringify(policy)).digest("hex");

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"AURORA:DIARIAS:2026:v1"}))`;
      const sets = await tx.hrPayrollRuleSet.findMany({ where: { scope: "PRODUCAO", isDemo: false, status: "ATIVA" }, include: { employmentRegimes: { where: { isActive: true } } }, orderBy: { id: "asc" } });
      const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
      if (!sets.length) {
        const instance = await tx.configuracaoInstancia.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
        const id = "aurora-travel-rules-2026-v1";
        if (apply) {
          const created = await tx.hrPayrollRuleSet.create({ data: { id, configuracaoInstanciaId: instance.id, code: "AURORA_DIARIAS_2026_V1", name: "Aurora das Veredas — política municipal de viagens", status: "ATIVA", scope: "PRODUCAO", isDemo: false, effectiveFrom: new Date("2026-01-01"), effectiveUntil: new Date("2026-12-31T23:59:59.999Z"), approvedAt: new Date(), legalReference: policy.legalReference, notes: "Conjunto de viagens; não é parametrização completa de cálculo da folha.", employmentRegimes: { create: { id: "aurora-travel-regime-2026-v1", code: "ESTATUTARIO", name: "Servidor estatutário — viagens municipais", employmentNature: "ESTATUTARIO", defaultMonthlyHours: 220, legalReference: policy.legalReference } } }, include: { employmentRegimes: true } });
          sets.push(created);
        } else {
          return { mode: "READ_ONLY", hash, policy, plannedRuleSetId: id, plannedRegimeId: "aurora-travel-regime-2026-v1", ruleIds: [], productionSets: [] };
        }
      }
      const ruleIds: string[] = [];
      for (const set of sets.filter(set => set.employmentRegimes.length > 0)) {
        const id = `aurora-travel-2026-v1:${set.id}`;
        const previous = await tx.hrPayrollRule.findUnique({ where: { ruleSetId_code: { ruleSetId: set.id, code: "DIARIAS_MUNICIPAIS" } } });
        if (previous && (previous.id !== id || JSON.stringify(travelAllowancePolicySchema.parse(previous.value)) !== JSON.stringify(policy))) throw new Error(`Política existente divergente em ${set.id}; preservar edição e adotar nova vigência.`);
        if (apply && !previous) {
          await tx.hrPayrollRule.create({ data: { id, ruleSetId: set.id, code: "DIARIAS_MUNICIPAIS", category: "DIARIAS", name: "Aurora das Veredas — diárias municipais 2026 v1", valueType: "JSON", value: policy as Prisma.InputJsonValue, legalReference: policy.legalReference } });
          await tx.financialAuditLog.create({ data: { action: "ADOPT_MUNICIPAL_TRAVEL_POLICY", entityType: "HrPayrollRule", entityId: id, authorUsuarioId: actor.id, payload: { hash, policy, ruleSetId: set.id } } });
        }
        ruleIds.push(previous?.id ?? id);
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", hash, policy, ruleIds, productionSets: sets.map(set => ({ id: set.id, regimes: set.employmentRegimes.map(regime => regime.id) })) };
    }, { timeout: 60000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
