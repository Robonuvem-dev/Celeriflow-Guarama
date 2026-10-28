import { config } from "dotenv";
import { createHash } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { setupAudits, setupPlans, setupTransactions } from "../src/db/schema/finance-setup-tools";
import { adoptSetupPostingRule, createSetupEdition, openFinanceSetupConnection, publishSetupEdition, readSetupActor, readSetupAudit, readSetupBinding, readSetupEntry, readSetupEvent, readSetupVersion, setupObject, setupRequired } from "./lib/finance-setup-tools";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-rap-registration-matrix-2026-v1";
const sourceVersionId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const accounts = [{ suffix: "unprocessed-registered", code: "6.2.2.1.3.05.00.00.00.00.00.00" }, { suffix: "processed-registered", code: "6.2.2.1.3.07.00.00.00.00.00.00" }];
const scope = [{ governmentEntityId: "p0-current-exe", budgetUnitId: "p0-current-exe-ug-1" }, { governmentEntityId: "p0-current-leg", budgetUnitId: "p0-current-leg-ug-1" }];
const events = [{ eventCode: "RAP_NAO_PROCESSADO_INSCRICAO", debitAccountId: "aurora-budget-posting-matrix-2026-v1:account:committed", suffix: "unprocessed-registered" }, { eventCode: "RAP_PROCESSADO_INSCRICAO", debitAccountId: "aurora-budget-posting-matrix-2026-v1:account:settled", suffix: "processed-registered" }];
const decision = "Procedimento municipal inicial ajustável: no encerramento, transferência do crédito empenhado a liquidar para empenhos inscritos não processados e do liquidado a pagar para empenhos inscritos processados. Reutiliza as contas de execução já adotadas. A inscrição não constitui outro passivo nem altera por si o comprometimento DDR anteriormente existente; pares complementares podem ser adotados quando houver origem documental aplicável. Não substitui abertura de saldos RAP no novo exercício ou adoção patrimonial/DDR por origem.";
const configurationHash = createHash("sha256").update(JSON.stringify({ accounts, scope, events, decision, sourceHash })).digest("hex");

export async function prepareRapRegistrationMatrix(connection: DatabaseConnection, apply = false) {
    return withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
      const actor = await readSetupActor(tx);
      if (!actor.ativo || !actor.employeeId || actor.perfil.codigo !== "SYSTEM_ADMINISTRATOR") throw new Error("Administrador com autoria funcional indisponível.");
      const source = await readSetupVersion(tx, sourceVersionId);
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Referência anual divergente.");
      const references = await Promise.all(accounts.map(account => readSetupEntry(tx, `${sourceVersionId}:${account.code}`)));
      if (references.some(entry => { const data = setupObject(entry.attributes); return data.postingAllowed !== true || data.informationNature !== "O" || data.balanceNature !== "C" || data.sourceHash !== sourceHash; })) throw new Error("Conta de inscrição sem referência escritural orçamentária conciliada.");
      for (const event of events) setupRequired((await tx.select({ id: setupPlans.id }).from(setupPlans).where(eq(setupPlans.id, event.debitAccountId)).limit(1))[0], "Conta de débito");
      for (const item of scope) if ((await readSetupBinding(tx, item.budgetUnitId)).governmentEntityId !== item.governmentEntityId) throw new Error("UG fora do ente explícito.");
      const prior = await readSetupAudit(tx, "PREPARE_RAP_REGISTRATION_MATRIX", key);
      if (prior && setupObject(prior.payload).configurationHash !== configurationHash) throw new Error("Adoção anterior divergente.");
      for (const event of events) {
        const existing = await readSetupEvent(tx, event.eventCode, true);
        if (!prior && existing) throw new Error("Preserve a matriz preexistente de inscrição RAP.");
        if (prior && (!existing?.isActive || existing.rules.length !== 1 || existing.rules[0].debitAccountId !== event.debitAccountId || existing.rules[0].creditAccountId !== `${key}:account:${event.suffix}` || existing.rules[0].components.length || existing.rules[0].isReference)) throw new Error("Matriz alterada após adoção; preserve o trabalho do operador.");
      }
      const [{ total: before }] = await tx.select({ total: count() }).from(setupTransactions);
      if (apply && !prior) {
        for (const [index, account] of accounts.entries()) await tx.insert(setupPlans).values({ id: `${key}:account:${account.suffix}`, code: `AURORA.REGISTRATION.${account.suffix.toUpperCase()}`, name: references[index].name, type: "Orçamentária" });
        for (const item of scope) {
          const id = `${key}:catalog:${item.governmentEntityId}`;
          await createSetupEdition(tx, { id, year: 2026, label: "Inscrição anual de restos a pagar", status: "DRAFT", sourceHash: createHash("sha256").update(JSON.stringify({ configurationHash, item })).digest("hex"), normativeReference: decision, createdById: actor.id }, references.map((entry, index) => ({ kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: `${key}:account:${accounts[index].suffix}`, attributes: { ...setupObject(entry.attributes), ...item, operational: true, mapped: true, pocOnly: false, sourceVersionId, sourceEntryId: entry.id, adoptionScope: "ANNUAL_RAP_BUDGET_REGISTRATION", decision } })));
          await publishSetupEdition(tx, id);
        }
        for (const event of events) await adoptSetupPostingRule(tx, { usuarioId: actor.id, employeeId: actor.employeeId }, { eventCode: event.eventCode, eventName: event.eventCode === "RAP_PROCESSADO_INSCRICAO" ? "Inscrição de RAP processado" : "Inscrição de RAP não processado", debitAccountId: event.debitAccountId, creditAccountId: `${key}:account:${event.suffix}`, isReference: false, description: decision });
        await tx.insert(setupAudits).values({ action: "PREPARE_RAP_REGISTRATION_MATRIX", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, authorEmployeeId: actor.employeeId, payload: { configurationHash, scope, decision, sourceVersionId, sourceHash, accountingMovementsCreated: false } });
      }
      if ((await tx.select({ total: count() }).from(setupTransactions))[0].total !== before) throw new Error("Adoção não pode gerar fatos anuais.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), configurationHash, scope, events: events.map(event => event.eventCode), decision };
    }, { timeoutMs: 120000 });
}
async function main() {
  const connection = openFinanceSetupConnection();
  try { console.log(JSON.stringify(await prepareRapRegistrationMatrix(connection, apply), null, 2)); }
  finally { await connection.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
