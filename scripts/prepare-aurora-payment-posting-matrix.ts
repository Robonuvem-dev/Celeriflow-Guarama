import { config } from "dotenv";
import { createHash } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { setupAudits, setupPlans, setupTransactions } from "../src/db/schema/finance-setup-tools";
import { adoptSetupPostingRule, createSetupEdition, openFinanceSetupConnection, publishSetupEdition, readSetupActor, readSetupAudit, readSetupBinding, readSetupEntry, readSetupEvent, readSetupPredecessor, readSetupVersion, setupObject, setupRequired } from "./lib/finance-setup-tools";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-payment-posting-matrix-2026-v1";
const sourceVersionId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const paidCode = "6.2.2.1.3.04.00.00.00.00.00.00";
const paidId = `${key}:account:paid`;
const settledId = "aurora-budget-posting-matrix-2026-v1:account:settled";
const eventCode = "PAGAMENTO_EFETIVADO";
const scope = [{ governmentEntityId: "p0-current-exe", budgetUnitId: "p0-current-exe-ug-1" }, { governmentEntityId: "p0-current-leg", budgetUnitId: "p0-current-leg-ug-1" }];
const decision = "Procedimento municipal inicial ajustável: pagamento bruto transfere crédito empenhado liquidado a pagar para crédito empenhado pago na execução orçamentária TCE-PR 2026. O estorno inverte a postagem original. Escopo explícito das duas UGs. A partida patrimonial do passivo, banco e retenções e o controle de disponibilidade por fonte exigem matriz complementar própria.";
const hash = createHash("sha256").update(JSON.stringify({ key, sourceHash, paidCode, paidId, settledId, eventCode, scope, decision })).digest("hex");

export async function preparePaymentPostingMatrix(connection: DatabaseConnection, apply = false) {
    return withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
      const actor = await readSetupActor(tx);
      if (!actor.ativo || !actor.employeeId || actor.perfil.codigo !== "SYSTEM_ADMINISTRATOR") throw new Error("Administrador com autoria funcional indisponível.");
      const source = await readSetupVersion(tx, sourceVersionId);
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Referência contábil divergente.");
      const entry = await readSetupEntry(tx, `${sourceVersionId}:${paidCode}`);
      const attributes = setupObject(entry.attributes);
      if (entry.kind !== "ACCOUNT" || attributes.postingAllowed !== true || attributes.informationNature !== "O" || attributes.balanceNature !== "C" || attributes.sourceHash !== sourceHash) throw new Error("Conta de crédito empenhado pago não conciliada.");
      const settled = setupRequired((await tx.select({ id: setupPlans.id }).from(setupPlans).where(eq(setupPlans.id, settledId)).limit(1))[0], "Conta liquidada");
      for (const item of scope) {
        const binding = await readSetupBinding(tx, item.budgetUnitId);
        if (binding.governmentEntityId !== item.governmentEntityId) throw new Error("UG fora do ente explícito.");
        const predecessor = await readSetupPredecessor(tx, settled.id, item.budgetUnitId);
        if (setupObject(predecessor.attributes).governmentEntityId !== item.governmentEntityId) throw new Error("Classificação de liquidado a pagar fora do ente.");
      }
      const prior = await readSetupAudit(tx, "PREPARE_PAYMENT_POSTING_MATRIX", key);
      if (prior && setupObject(prior.payload).configurationHash !== hash) throw new Error("Preparação anterior divergente.");
      const event = await readSetupEvent(tx, eventCode);
      if (!prior && event) throw new Error("Evento de pagamento preexistente; preservar sua configuração.");
      if (prior && (!event?.isActive || event.rules.filter(rule => rule.isActive).length !== 1 || !event.rules.some(rule => rule.isActive && !rule.isReference && rule.debitAccountId === settledId && rule.creditAccountId === paidId))) throw new Error("Matriz de pagamento alterada após adoção.");
      const [{ total: before }] = await tx.select({ total: count() }).from(setupTransactions);
      if (apply && !prior) {
        await tx.insert(setupPlans).values({ id: paidId, code: "AURORA.BUDGET.PAID", name: entry.name, type: "Orçamentária" });
        for (const item of scope) {
          const versionId = `${key}:catalog:${item.governmentEntityId}`;
          const editionHash = createHash("sha256").update(JSON.stringify({ configurationHash: hash, scope: item })).digest("hex");
          await createSetupEdition(tx, { id: versionId, year: 2026, label: "Aurora das Veredas — pagamento orçamentário", status: "DRAFT", sourceHash: editionHash, normativeReference: decision, createdById: actor.id }, [{ kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: paidId, attributes: { ...attributes, ...item, operational: true, mapped: true, pocOnly: false, sourceVersionId, sourceEntryId: entry.id, adoptionScope: "BUDGET_EXECUTION_ONLY", decision } }]);
          await publishSetupEdition(tx, versionId);
        }
        await adoptSetupPostingRule(tx, { usuarioId: actor.id, employeeId: actor.employeeId }, { eventCode, eventName: "Pagamento — execução orçamentária", debitAccountId: settledId, creditAccountId: paidId, description: decision, isReference: false });
        await tx.insert(setupAudits).values({ action: "PREPARE_PAYMENT_POSTING_MATRIX", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, scope, decision, sourceVersionId, sourceHash, accountingMovementsCreated: false } });
      }
      if ((await tx.select({ total: count() }).from(setupTransactions))[0].total !== before) throw new Error("A preparação não pode gerar fatos financeiros.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash: hash, scope, eventCode, paidCode, decision };
    }, { timeoutMs: 120000 });
}
async function main() {
  const connection = openFinanceSetupConnection();
  try { console.log(JSON.stringify(await preparePaymentPostingMatrix(connection, apply), null, 2)); }
  finally { await connection.pool.end(); }
}

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação do pagamento."); process.exitCode = 1; });
