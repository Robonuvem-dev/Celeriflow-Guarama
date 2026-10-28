import { config } from "dotenv";
import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as t from "../src/db/schema/municipal-setup-personnel";
import { audits } from "../src/db/schema/municipal-setup-tools";
import { firstMunicipalActor, lockMunicipal, municipalRequired, openMunicipalSetupConnection } from "./lib/municipal-setup-tools";
import { travelAllowancePolicySchema } from "../src/lib/rh/travel-allowance";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const policy = travelAllowancePolicySchema.parse({ origin: "DIARIAS_MUNICIPAIS", rates: { DF: "600.00", CAPITAL: "450.00", INTERIOR: "300.00", INTERNACIONAL: "200.00" }, minimumDistanceKm: 50, rounding: "HALF_UP", legalReference: "Aurora das Veredas — parâmetros iniciais estimados autorizados para implantação; valores ajustáveis, sem atribuição de lei municipal presumida.", estimated: true });
const hash = createHash("sha256").update(JSON.stringify(policy)).digest("hex");

export async function adoptTravelPolicy(connection: DatabaseConnection, apply = false) {
    return withDatabaseTransaction(connection, async tx => {
      await lockMunicipal(tx, "AURORA:DIARIAS:2026:v1");
      const sets = [];
      for (const set of await tx.select().from(t.ruleSets).where(and(eq(t.ruleSets.scope, "PRODUCAO"), eq(t.ruleSets.isDemo, false), eq(t.ruleSets.status, "ATIVA"))).orderBy(asc(t.ruleSets.id))) {
        sets.push({ ...set, employmentRegimes: await tx.select().from(t.regimes).where(and(eq(t.regimes.ruleSetId, set.id), eq(t.regimes.isActive, true))) });
      }
      const actor = await firstMunicipalActor(tx);
      if (!sets.length) {
        const instance = municipalRequired((await tx.select({ id: t.instances.id }).from(t.instances).orderBy(asc(t.instances.createdAt)).limit(1))[0], "Instância");
        const id = "aurora-travel-rules-2026-v1";
        if (apply) {
          const [created] = await tx.insert(t.ruleSets).values({ id, configuracaoInstanciaId: instance.id, code: "AURORA_DIARIAS_2026_V1", name: "Aurora das Veredas — política municipal de viagens", status: "ATIVA", scope: "PRODUCAO", isDemo: false, effectiveFrom: new Date("2026-01-01"), effectiveUntil: new Date("2026-12-31T23:59:59.999Z"), approvedAt: new Date(), legalReference: policy.legalReference, notes: "Conjunto de viagens; não é parametrização completa de cálculo da folha." }).returning();
          const employmentRegimes = await tx.insert(t.regimes).values({ ruleSetId: id, id: "aurora-travel-regime-2026-v1", code: "ESTATUTARIO", name: "Servidor estatutário — viagens municipais", employmentNature: "ESTATUTARIO", defaultMonthlyHours: 220, legalReference: policy.legalReference }).returning();
          sets.push({ ...created, employmentRegimes });
        } else {
          return { mode: "READ_ONLY", hash, policy, plannedRuleSetId: id, plannedRegimeId: "aurora-travel-regime-2026-v1", ruleIds: [], productionSets: [] };
        }
      }
      const ruleIds: string[] = [];
      for (const set of sets.filter(set => set.employmentRegimes.length > 0)) {
        const id = `aurora-travel-2026-v1:${set.id}`;
        const [previous] = await tx.select().from(t.rules).where(and(eq(t.rules.ruleSetId, set.id), eq(t.rules.code, "DIARIAS_MUNICIPAIS"))).limit(1);
        if (previous && (previous.id !== id || JSON.stringify(travelAllowancePolicySchema.parse(previous.value)) !== JSON.stringify(policy))) throw new Error(`Política existente divergente em ${set.id}; preservar edição e adotar nova vigência.`);
        if (apply && !previous) {
          await tx.insert(t.rules).values({ id, ruleSetId: set.id, code: "DIARIAS_MUNICIPAIS", category: "DIARIAS", name: "Aurora das Veredas — diárias municipais 2026 v1", valueType: "JSON", value: policy, legalReference: policy.legalReference });
          await tx.insert(audits).values({ action: "ADOPT_MUNICIPAL_TRAVEL_POLICY", entityType: "HrPayrollRule", entityId: id, authorUsuarioId: actor.id, payload: { hash, policy, ruleSetId: set.id } });
        }
        ruleIds.push(previous?.id ?? id);
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", hash, policy, ruleIds, productionSets: sets.map(set => ({ id: set.id, regimes: set.employmentRegimes.map(regime => regime.id) })) };
    }, { timeoutMs: 60000 });
}
async function main() {
  const connection = openMunicipalSetupConnection();
  try { console.log(JSON.stringify(await adoptTravelPolicy(connection, apply), null, 2)); }
  finally { await connection.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
