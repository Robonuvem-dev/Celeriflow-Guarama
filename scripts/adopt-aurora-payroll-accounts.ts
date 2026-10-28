import { config } from "dotenv";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as t from "../src/db/schema/municipal-setup-tools";
import { createMunicipalEdition, firstMunicipalActor, municipalEdition, municipalObject, municipalRequired, openMunicipalSetupConnection } from "./lib/municipal-setup-tools";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const sourceVersionId = "p1-tce-pr-account-2026-1.0d";
const versionId = "aurora-payroll-accounts-2026-v1";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const decision = "Adoção inicial de contas analíticas de pessoal de Aurora das Veredas, conforme autorização do responsável para parâmetros estimados e ajustáveis na implantação; referência oficial TCE-PR 2026, sem atribuição de lei municipal presumida.";
const codes = [
  "2.1.1.1.1.01.02.00.00.00.00.00",
  "2.1.1.1.1.01.03.00.00.00.00.00",
  "2.1.1.4.1.01.01.00.00.00.00.00",
  "3.1.1.1.1.01.21.00.00.00.00.00",
  "3.1.1.1.1.01.22.00.00.00.00.00",
  "3.1.2.2.1.01.00.00.00.00.00.00",
];
const hash = createHash("sha256").update(JSON.stringify({ sourceVersionId, sourceHash, decision, codes })).digest("hex");

export async function adoptPayrollAccounts(connection: DatabaseConnection, apply = false) {
    return withDatabaseTransaction(connection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`);
      const source = municipalRequired(await municipalEdition(tx, sourceVersionId), "Catálogo oficial");
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Catálogo oficial diverge da origem registrada.");
      const entries = await tx.select().from(t.entries).where(and(eq(t.entries.versionId, sourceVersionId), eq(t.entries.kind, "ACCOUNT"), inArray(t.entries.code, codes))).orderBy(asc(t.entries.code));
      if (entries.length !== codes.length) throw new Error("Subconjunto oficial incompleto.");
      const accounts: Array<{ source: typeof entries[number]; canonicalId: string; type: string }> = [];
      for (const entry of entries) {
        const attributes = municipalObject(entry.attributes);
        const debit = entry.code.startsWith("3.");
        if (attributes.postingAllowed !== true || attributes.informationNature !== "P" || attributes.balanceNature !== (debit ? "D" : "C") || attributes.effectiveFrom !== "2026-01-01" || attributes.effectiveUntil !== "2026-12-31") throw new Error(`Classificação não conciliada: ${entry.code}.`);
        const type = debit ? "Despesa" : "Passivo";
        const [existing] = await tx.select().from(t.plans).where(eq(t.plans.code, entry.code)).limit(1);
        if (existing && (existing.name !== entry.name || existing.type !== type)) throw new Error(`Conta local conflitante ${entry.code}; preservar cadastro e conciliar o de-para.`);
        accounts.push({ source: entry, canonicalId: existing?.id ?? `aurora-account:${entry.code}`, type });
      }
      const prior = await municipalEdition(tx, versionId);
      if (prior && (prior.sourceHash !== hash || prior.status !== "PUBLISHED" || prior.entries.length !== accounts.length || prior.entries.some((entry) => !accounts.some((account) => account.source.code === entry.code && account.canonicalId === entry.canonicalId) || municipalObject(entry.attributes).operational !== true))) throw new Error("Adoção publicada divergente; criar nova edição em vez de sobrescrever.");
      if (apply && !prior) {
        const actor = await firstMunicipalActor(tx);
        for (const account of accounts) await tx.insert(t.plans).values({ id: account.canonicalId, code: account.source.code, name: account.source.name, type: account.type }).onConflictDoNothing({ target: t.plans.code });
        await createMunicipalEdition(tx, { id: versionId, year: 2026, label: "Aurora das Veredas — contas de pessoal 2026 v1", sourceHash: hash, status: "DRAFT", normativeReference: decision, createdById: actor.id }, accounts.map((account) => ({ kind: "ACCOUNT", code: account.source.code, name: account.source.name, degree: account.source.degree, canonicalId: account.canonicalId, attributes: { ...municipalObject(account.source.attributes), operational: true, mapped: true, homologated: true, pocOnly: false, sourceVersionId, sourceEntryId: account.source.id, decision, estimatedMunicipalPolicy: true } })));
        await tx.insert(t.audits).values({ action: "ADOPT_MUNICIPAL_PAYROLL_ACCOUNTS", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { sourceVersionId, sourceHash, hash, decision, codes } });
      }
      if (apply) {
        const { assertPublishedAccountClassification } = await import("../src/lib/financeiro/account-catalog");
        await assertPublishedAccountClassification(tx, accounts.map((account) => ({ id: account.canonicalId })), new Date("2026-10-12"));
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, hash, sourceVersionId, accounts: accounts.map((account) => ({ code: account.source.code, name: account.source.name, canonicalId: account.canonicalId })), decision };
    }, { timeoutMs: 60000 });
}
async function main() {
  const connection = openMunicipalSetupConnection();
  try { console.log(JSON.stringify(await adoptPayrollAccounts(connection, apply), null, 2)); }
  finally { await connection.pool.end(); }
}

if (require.main === module) main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
