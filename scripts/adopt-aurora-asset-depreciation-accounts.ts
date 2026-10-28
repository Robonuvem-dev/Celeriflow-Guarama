import { config } from "dotenv";
import { createHash } from "node:crypto";
import { and, asc, count, eq, ilike, inArray, like, or, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import type { JsonObject, JsonValue } from "../src/db/json";
import { withDatabaseTransaction } from "../src/db/transaction";
import { planningCatalogEntries, planningCatalogVersions } from "../src/db/schema/planning-catalog";
import { accountingPlans } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { users } from "../src/db/schema/identity";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const sourceId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const versionId = "aurora-asset-depreciation-accounts-2026-v1";
const decision = "Aurora das Veredas — contas patrimoniais oficiais para depreciação de bens móveis/imóveis, com classificação da categoria e vida útil ajustáveis na implantação; sem alteração retroativa dos bens e históricos existentes.";

function attributes(value: JsonValue): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Atributos patrimoniais inválidos.");
  return value;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(url);
  try {
    const report = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`);
      const [source] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, sourceId)).limit(1);
      if (!source || source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Origem patrimonial oficial divergente.");
      const entries = await tx.select().from(planningCatalogEntries).where(and(eq(planningCatalogEntries.versionId, sourceId), eq(planningCatalogEntries.kind, "ACCOUNT"), or(and(like(planningCatalogEntries.code, "1.2.3.8.1.%"), ilike(planningCatalogEntries.name, "%DEPRECIAÇÃO%")), inArray(planningCatalogEntries.code, ["3.3.3.1.1.01.01.00.00.00.00.00", "3.3.3.1.1.01.02.00.00.00.00.00"])))).orderBy(asc(planningCatalogEntries.code));
      const selected = entries.filter(entry => attributes(entry.attributes).postingAllowed === true);
      if (selected.length !== 20) throw new Error("Subconjunto oficial de depreciação incompleto ou alterado.");
      const hash = createHash("sha256").update(JSON.stringify({ sourceHash, decision, entries: selected.map(entry => ({ code: entry.code, name: entry.name, attributes: entry.attributes })) })).digest("hex");
      const ids = new Map<string, string>();
      for (const entry of selected) {
        const data = attributes(entry.attributes);
        if (data.informationNature !== "P" || data.balanceNature !== (entry.code.startsWith("1.") ? "C" : "D") || data.effectiveFrom !== "2026-01-01" || data.effectiveUntil !== "2026-12-31") throw new Error(`Classificação divergente: ${entry.code}.`);
        const [account] = await tx.select().from(accountingPlans).where(eq(accountingPlans.code, entry.code)).limit(1);
        const type = entry.code.startsWith("1.") ? "Ativo" : "VPD";
        if (account && (account.name !== entry.name || account.type !== type)) throw new Error(`Preservar e conciliar conta existente divergente: ${entry.code}.`);
        ids.set(entry.code, account?.id ?? `aurora-account:${entry.code}`);
      }
      const [existing] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, versionId)).limit(1);
      const existingEntries = existing ? await tx.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, versionId)) : [];
      if (existing && (existing.status !== "PUBLISHED" || existing.sourceHash !== hash || existingEntries.length !== selected.length || existingEntries.some(entry => { const origin = selected.find(row => row.code === entry.code); const data = attributes(entry.attributes); return !origin || entry.canonicalId !== ids.get(entry.code) || entry.name !== origin.name || entry.degree !== origin.degree || data.sourceEntryId !== origin.id || data.operational !== true || data.pocOnly !== false; }))) throw new Error("Edição patrimonial publicada divergente.");
      if (apply && !existing) {
        const [actor] = await tx.select({ id: users.id }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.createdAt)).limit(1);
        if (!actor) throw new Error("Usuário ativo para adoção patrimonial indisponível.");
        for (const entry of selected) await tx.insert(accountingPlans).values({ id: ids.get(entry.code)!, code: entry.code, name: entry.name, type: entry.code.startsWith("1.") ? "Ativo" : "VPD" }).onConflictDoNothing({ target: accountingPlans.code });
        await tx.insert(planningCatalogVersions).values({ id: versionId, year: 2026, label: "Aurora das Veredas — depreciação patrimonial 2026 v1", sourceHash: hash, normativeReference: decision, status: "DRAFT", createdById: actor.id });
        await tx.insert(planningCatalogEntries).values(selected.map(entry => ({ versionId, kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: ids.get(entry.code)!, attributes: { ...attributes(entry.attributes), mapped: true, operational: true, pocOnly: false, sourceEntryId: entry.id, sourceVersionId: sourceId, decision } })));
        await tx.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, versionId));
        await tx.insert(financialAuditLogs).values({ action: "ADOPT_ASSET_DEPRECIATION_ACCOUNTS", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { hash, sourceHash, decision, codes: selected.map(entry => entry.code) } });
      }
      const [{ total: auditCount }] = await tx.select({ total: count() }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "ADOPT_ASSET_DEPRECIATION_ACCOUNTS"), eq(financialAuditLogs.entityId, versionId)));
      if ((existing || apply) && auditCount !== 1) throw new Error("Auditoria da adoção patrimonial divergente.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, hash, auditCount, accounts: selected.map(entry => ({ code: entry.code, name: entry.name, id: ids.get(entry.code) })) };
    }, { timeoutMs: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
