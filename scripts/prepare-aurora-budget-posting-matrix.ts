import { config } from "dotenv";
import { createHash } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { setupAudits, setupCatalogEntries, setupPlans, setupTransactions } from "../src/db/schema/finance-setup-tools";
import { adoptSetupPostingRule, createSetupEdition, openFinanceSetupConnection, publishSetupEdition, readSetupActor, readSetupAudit, readSetupBinding, readSetupEvent, readSetupVersion, setupObject } from "./lib/finance-setup-tools";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-budget-posting-matrix-2026-v1";
const sourceVersionId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const accounts = [
  { suffix: "available", code: "6.2.2.1.1.00.00.00.00.00.00.00" },
  { suffix: "committed", code: "6.2.2.1.3.01.00.00.00.00.00.00" },
  { suffix: "settled", code: "6.2.2.1.3.03.00.00.00.00.00.00" },
];
const rules = [
  { eventCode: "EMPENHO_EMITIDO", eventName: "Emissão de empenho — execução orçamentária", debit: "available", credit: "committed" },
  { eventCode: "LIQUIDACAO_REGISTRADA", eventName: "Liquidação — execução orçamentária", debit: "committed", credit: "settled" },
];
const scope = [{ governmentEntityId: "p0-current-exe", budgetUnitId: "p0-current-exe-ug-1" }, { governmentEntityId: "p0-current-leg", budgetUnitId: "p0-current-leg-ug-1" }];
const decision = "Adoção municipal para execução orçamentária das jornadas autorizadas: crédito disponível → empenhado a liquidar → liquidado a pagar, com contas escriturais oficiais TCE-PR 2026. Classificação vigente somente nas duas UGs indicadas. Configuração inicial ajustável; não constitui homologação integral da matriz, abertura de saldos, reconhecimento patrimonial do ativo/passivo ou controle de disponibilidade por fonte.";
const hash = createHash("sha256").update(JSON.stringify({ key, sourceHash, accounts, rules, scope, decision })).digest("hex");

export async function prepareBudgetPostingMatrix(connection: DatabaseConnection, apply = false) {
    return withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
      const actor = await readSetupActor(tx);
      if (!actor.ativo || actor.perfil.codigo !== "SYSTEM_ADMINISTRATOR") throw new Error("Administrador autorizado indisponível.");
      const source = await readSetupVersion(tx, sourceVersionId);
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Referência contábil divergente.");
      const entries = await tx.select().from(setupCatalogEntries).where(and(eq(setupCatalogEntries.versionId, sourceVersionId), eq(setupCatalogEntries.kind, "ACCOUNT"), inArray(setupCatalogEntries.code, accounts.map(item => item.code))));
      if (entries.length !== accounts.length || entries.some(entry => {
        const attributes = setupObject(entry.attributes);
        return attributes.postingAllowed !== true || attributes.informationNature !== "O" || attributes.balanceNature !== "C" || attributes.sourceHash !== sourceHash;
      })) throw new Error("Contas escriturais orçamentárias não conciliadas com a referência.");
      for (const item of scope) {
        const binding = await readSetupBinding(tx, item.budgetUnitId);
        if (binding.governmentEntityId !== item.governmentEntityId) throw new Error("Escopo da adoção contábil divergente.");
      }
      const prior = await readSetupAudit(tx, "PREPARE_BUDGET_POSTING_MATRIX", key);
      if (prior && setupObject(prior.payload).configurationHash !== hash) throw new Error("Adoção anterior divergente; preservar configuração.");
      for (const rule of rules) {
        const event = await readSetupEvent(tx, rule.eventCode);
        if (!prior && event) throw new Error(`Evento preexistente ${rule.eventCode}; conciliar antes de configurar, sem substituir regras.`);
        if (prior && (!event?.isActive || event.rules.filter(item => item.isActive).length !== 1 || !event.rules.some(item => item.isActive && !item.isReference && item.debitAccountId === `${key}:account:${rule.debit}` && item.creditAccountId === `${key}:account:${rule.credit}`))) throw new Error(`Regra ${rule.eventCode} alterada após adoção; preservar a edição atual.`);
      }
      const [{ total: before }] = await tx.select({ total: count() }).from(setupTransactions);
      if (apply && !prior) {
        for (const account of accounts) {
          const entry = entries.find(item => item.code === account.code)!;
          await tx.insert(setupPlans).values({ id: `${key}:account:${account.suffix}`, code: `AURORA.BUDGET.${account.suffix.toUpperCase()}`, name: entry.name, type: "Orçamentária" });
        }
        for (const item of scope) {
          const versionId = `${key}:catalog:${item.governmentEntityId}`;
          const editionHash = createHash("sha256").update(JSON.stringify({ configurationHash: hash, scope: item })).digest("hex");
          await createSetupEdition(tx, { id: versionId, year: 2026, label: "Aurora das Veredas — execução orçamentária", status: "DRAFT", sourceHash: editionHash, normativeReference: decision, createdById: actor.id }, accounts.map(account => {
              const entry = entries.find(candidate => candidate.code === account.code)!;
              return { kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: `${key}:account:${account.suffix}`, attributes: { ...setupObject(entry.attributes), ...item, operational: true, mapped: true, pocOnly: false, sourceVersionId, sourceEntryId: entry.id, adoptionScope: "BUDGET_EXECUTION_ONLY", decision } };
            }));
          await publishSetupEdition(tx, versionId);
        }
        for (const rule of rules) await adoptSetupPostingRule(tx, { usuarioId: actor.id, employeeId: actor.employeeId }, { eventCode: rule.eventCode, eventName: rule.eventName, debitAccountId: `${key}:account:${rule.debit}`, creditAccountId: `${key}:account:${rule.credit}`, description: decision, isReference: false });
        await tx.insert(setupAudits).values({ action: "PREPARE_BUDGET_POSTING_MATRIX", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { configurationHash: hash, decision, scope, sourceVersionId, sourceHash, eventCodes: rules.map(rule => rule.eventCode), accountingMovementsCreated: false } });
      }
      if ((await tx.select({ total: count() }).from(setupTransactions))[0].total !== before) throw new Error("A preparação não deve gerar lançamentos contábeis.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash: hash, scope, rules, decision };
    }, { timeoutMs: 120000 });
}
async function main() {
  const connection = openFinanceSetupConnection();
  try { console.log(JSON.stringify(await prepareBudgetPostingMatrix(connection, apply), null, 2)); }
  finally { await connection.pool.end(); }
}

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na adoção orçamentária."); process.exitCode = 1; });
