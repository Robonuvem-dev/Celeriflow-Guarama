import { config } from "dotenv";
import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as t from "../src/db/schema/municipal-setup-tools";
import { createMunicipalEdition, firstMunicipalActor, lockMunicipal, municipalAccountingEvent, municipalEdition, municipalObject, municipalRequired, openMunicipalSetupConnection } from "./lib/municipal-setup-tools";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const sourceVersionId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const versionId = "aurora-advance-controls-2026-v1";
const control = "7.9.1.2.1.00.00.00.00.00.00.00";
const pending = "8.9.1.2.1.01.00.00.00.00.00.00";
const reported = "8.9.1.2.1.02.00.00.00.00.00.00";
const approved = "8.9.1.2.1.03.00.00.00.00.00.00";
const disallowed = "8.9.1.2.1.04.00.00.00.00.00.00";
const codes = [control, pending, reported, approved, disallowed];
const events = [{ code: "ADVANCE_GRANTED", debit: control, credit: pending }, { code: "ADVANCE_REPORTED", debit: pending, credit: reported }, { code: "ADVANCE_APPROVED", debit: reported, credit: approved }, { code: "ADVANCE_DISALLOWED", debit: reported, credit: disallowed }];
const decision = "Aurora das Veredas — controle de adiantamentos pelo empenho/concessão, apresentação e revisão da prestação; procedimento inicial estimado autorizado, contas oficiais TCE-PR 2026, sem lei municipal presumida.";
const hash = createHash("sha256").update(JSON.stringify({ sourceHash, codes, events, decision })).digest("hex");

export async function adoptAdvanceAccounting(connection: DatabaseConnection, apply = false) {
    return withDatabaseTransaction(connection, async tx => {
      await lockMunicipal(tx, versionId);
      const source = municipalRequired(await municipalEdition(tx, sourceVersionId), "Catálogo oficial");
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Origem oficial divergente.");
      const entries = await tx.select().from(t.entries).where(and(eq(t.entries.versionId, sourceVersionId), eq(t.entries.kind, "ACCOUNT"), inArray(t.entries.code, codes)));
      if (entries.length !== codes.length) throw new Error("Subconjunto de controle oficial incompleto.");
      const ids = new Map<string, string>();
      for (const entry of entries) {
        const attributes = municipalObject(entry.attributes);
        if (attributes.postingAllowed !== true || attributes.informationNature !== "C" || attributes.balanceNature !== (entry.code.startsWith("7.") ? "D" : "C") || attributes.effectiveFrom !== "2026-01-01" || attributes.effectiveUntil !== "2026-12-31") throw new Error(`Conta de controle não conciliada ${entry.code}.`);
        const [account] = await tx.select().from(t.plans).where(eq(t.plans.code, entry.code)).limit(1);
        if (account && (account.name !== entry.name || account.type !== "Controle")) throw new Error(`Cadastro existente divergente ${entry.code}; preservar e conciliar.`);
        ids.set(entry.code, account?.id ?? `aurora-account:${entry.code}`);
      }
      const existing = await municipalEdition(tx, versionId);
      if (existing && (existing.sourceHash !== hash || existing.status !== "PUBLISHED" || existing.entries.length !== codes.length || existing.entries.some(entry => entry.canonicalId !== ids.get(entry.code)))) throw new Error("Edição de controle publicada divergente.");
      for (const event of events) {
        const current = await municipalAccountingEvent(tx, event.code);
        if (current && (!current.isActive || current.rules.length !== 1 || current.rules[0].debitAccountId !== ids.get(event.debit) || current.rules[0].creditAccountId !== ids.get(event.credit) || !current.rules[0].isActive || current.rules[0].isReference)) throw new Error(`Matriz de controle existente divergente ${event.code}.`);
        if (existing && !current) throw new Error(`Evento ausente na edição publicada ${event.code}.`);
      }
      if (apply && !existing) {
        const actor = await firstMunicipalActor(tx);
        for (const entry of entries) await tx.insert(t.plans).values({ id: ids.get(entry.code)!, code: entry.code, name: entry.name, type: "Controle" }).onConflictDoNothing({ target: t.plans.code });
        await createMunicipalEdition(tx, { id: versionId, year: 2026, label: "Aurora das Veredas — controles de adiantamentos 2026 v1", sourceHash: hash, status: "DRAFT", normativeReference: decision, createdById: actor.id }, entries.map(entry => ({ kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: ids.get(entry.code)!, attributes: { ...municipalObject(entry.attributes), mapped: true, operational: true, pocOnly: false, sourceEntryId: entry.id, sourceVersionId, estimatedMunicipalPolicy: true, decision } })));
        for (const event of events) {
          const [created] = await tx.insert(t.events).values({ code: event.code, name: event.code, description: decision }).onConflictDoNothing({ target: t.events.code }).returning({ id: t.events.id });
          if (created) await tx.insert(t.postingRules).values({ eventId: created.id, debitAccountId: ids.get(event.debit)!, creditAccountId: ids.get(event.credit)!, description: versionId, isReference: false });
        }
        await tx.insert(t.audits).values({ action: "ADOPT_MUNICIPAL_ADVANCE_CONTROLS", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { hash, sourceHash, codes, events, decision } });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, hash, codes, events };
    }, { timeoutMs: 60000 });
}
async function main() {
  const connection = openMunicipalSetupConnection();
  try { console.log(JSON.stringify(await adoptAdvanceAccounting(connection, apply), null, 2)); }
  finally { await connection.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
