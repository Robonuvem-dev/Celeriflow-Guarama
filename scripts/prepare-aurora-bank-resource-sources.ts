import { config } from "dotenv";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { setupSources, setupAudits } from "../src/db/schema/finance-setup-tools";
import { adoptSetupBankSources, openFinanceSetupConnection, readSetupActor, readSetupAudit, readSetupBankAccount, setupFingerprint, setupObject, setupRequired } from "./lib/finance-setup-tools";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-bank-resource-sources-2026-v1";
const source = { id: "aurora-source-1501", code: "1501", name: "Outros recursos não vinculados", stnGroup: "1", stnSpecification: "501", referenceYear: 2026 };
const sources = ["aurora-source-1500", source.id];
const scope = [
  { governmentEntityId: "p0-current-exe", budgetUnitId: "p0-current-exe-ug-1", bankAccountId: "aurora-finance-control-2026-v1:bank:exe" },
  { governmentEntityId: "p0-current-leg", budgetUnitId: "p0-current-leg-ug-1", bankAccountId: "aurora-finance-control-2026-v1:bank:leg" },
];
const decision = "Configuração municipal inicial ajustável autorizada: as duas contas de movimentação podem receber fontes 1500 e 1501 explicitamente. Fonte principal 1500 preservada, saldos iniciais permanecem zero, sem atribuir movimentos históricos nem criar arrecadações ou dotações da fonte adicional.";
const hash = createHash("sha256").update(JSON.stringify({ key, source, sources, scope, decision })).digest("hex");

export async function prepareBankResourceSources(connection: DatabaseConnection, apply = false) {
    return withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
      const actor = await readSetupActor(tx);
      if (!actor.ativo || !actor.employeeId || actor.perfil.codigo !== "SYSTEM_ADMINISTRATOR") throw new Error("Administrador com autoria funcional indisponível.");
      const prior = await readSetupAudit(tx, "PREPARE_BANK_RESOURCE_SOURCES", key);
      if (prior && setupObject(prior.payload).configurationHash !== hash) throw new Error("Preparação anterior divergente.");
      const original = setupRequired((await tx.select().from(setupSources).where(eq(setupSources.id, sources[0])).limit(1))[0], "Fonte original");
      if (original.code !== "1500") throw new Error("Fonte original divergente.");
      const existing = (await tx.select().from(setupSources).where(eq(setupSources.code, source.code)).limit(1))[0] ?? null;
      if (existing && (existing.id !== source.id || existing.name !== source.name || existing.stnGroup !== source.stnGroup || existing.stnSpecification !== source.stnSpecification || existing.referenceYear !== source.referenceYear)) throw new Error("Fonte adicional preexistente divergente; preserve seu cadastro.");
      for (const item of scope) {
        const account = await readSetupBankAccount(tx, item.bankAccountId);
        if (!account.isActive || account.resourceSourceId !== sources[0] || account.budgetUnitId !== item.budgetUnitId || account.governmentEntityId !== item.governmentEntityId) throw new Error("Conta fora da configuração municipal explícita.");
        if (!prior && account.permittedSources.length) throw new Error("Lista de fontes preexistente; preservar a configuração.");
        if (prior && JSON.stringify(account.permittedSources.map(permission => permission.resourceSourceId).sort()) !== JSON.stringify([...sources].sort())) throw new Error("Lista de fontes alterada após adoção.");
      }
      const fingerprint = async () => {
        return setupFingerprint(tx, "TreasuryMovement");
      };
      const before = await fingerprint();
      if (apply && !prior) {
        if (!existing) await tx.insert(setupSources).values(source);
        for (const item of scope) await adoptSetupBankSources(tx, { usuarioId: actor.id, employeeId: actor.employeeId }, item.bankAccountId, sources);
        await tx.insert(setupAudits).values({ action: "PREPARE_BANK_RESOURCE_SOURCES", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, scope, sources, decision, parameterOrigin: "OWNER_ESTIMATE" } });
      }
      if (await fingerprint() !== before) throw new Error("Configuração não pode alterar tesouraria histórica.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash: hash, scope, sources, decision, treasuryPreserved: true };
    }, { timeoutMs: 120000 });
}
async function main() {
  const connection = openFinanceSetupConnection();
  try { console.log(JSON.stringify(await prepareBankResourceSources(connection, apply), null, 2)); }
  finally { await connection.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
