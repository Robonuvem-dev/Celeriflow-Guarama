import { config } from "dotenv";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { JsonObject, JsonValue } from "../src/db/json";
import { withDatabaseTransaction } from "../src/db/transaction";
import { accountingEvents, accountingPlans, accountingRules } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { users } from "../src/db/schema/identity";
import { planningCatalogEntries, planningCatalogVersions } from "../src/db/schema/planning-catalog";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const sourceVersionId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const versionId = "p1-poc-tax-matrix-2026-v1";
const codes = {
  cash: "1.1.1.1.1.19.00.00.00.00.00.00",
  receivable: "1.1.2.1.1.01.99.00.00.00.00.00",
  refundable: "2.1.8.8.1.99.99.00.00.00.00.00",
};
const events = [
  { code: "TAX_COLLECTION_EXCESS", name: "POC — excedente tributário a restituir", debit: codes.cash, credit: codes.refundable },
  { code: "TAX_CREDIT_REFUNDED", name: "POC — restituição tributária paga", debit: codes.refundable, credit: codes.cash },
  { code: "TAX_CREDIT_COMPENSATED", name: "POC — compensação de crédito tributário", debit: codes.refundable, credit: codes.receivable },
];
const hash = createHash("sha256").update(JSON.stringify({ sourceHash, codes, events, year: 2026, pocOnly: true })).digest("hex");
const object = (value: JsonValue): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};

async function main() {
  const { databaseConnection } = await import("../src/db/client");
  try {
    const report = await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`);
      const [source] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, sourceVersionId));
      if (!source) throw new Error("Versão oficial não encontrada.");
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Origem oficial divergente.");
      const entries = await tx.select().from(planningCatalogEntries).where(and(eq(planningCatalogEntries.versionId, sourceVersionId), eq(planningCatalogEntries.kind, "ACCOUNT"), inArray(planningCatalogEntries.code, Object.values(codes))));
      if (entries.length !== Object.keys(codes).length) throw new Error("Contas oficiais da matriz não encontradas.");
      const accounts = new Map<string, string>();
      for (const entry of entries) {
        const attr = object(entry.attributes);
        if (attr.postingAllowed !== true || attr.informationNature !== "P" || attr.balanceNature !== (entry.code.startsWith("1.") ? "D" : "C")) throw new Error(`Classificação incompatível: ${entry.code}`);
        const [existing] = await tx.select().from(accountingPlans).where(eq(accountingPlans.code, entry.code));
        const type = entry.code.startsWith("1.") ? "Ativo" : "Passivo";
        if (existing && (existing.name !== entry.name || existing.type !== type)) throw new Error(`De-para conflitante; preservar conta ${existing.id}.`);
        accounts.set(entry.code, existing?.id ?? `p1-poc-account:${entry.code}`);
      }
      const [prior] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, versionId));
      if (prior && (prior.sourceHash !== hash || prior.status !== "PUBLISHED" || prior.year !== 2026)) throw new Error("Versão POC existente divergente.");
      // Never replace a local event or deactivate a local posting rule.
      for (const event of events) {
        const [existing] = await tx.select().from(accountingEvents).where(eq(accountingEvents.code, event.code));
        const rules = existing ? await tx.select().from(accountingRules).where(eq(accountingRules.eventId, existing.id)) : [];
        if (existing && (!existing.isActive || existing.name !== event.name || rules.length !== 1 || !rules[0].isActive || !rules[0].isReference || rules[0].debitAccountId !== accounts.get(event.debit) || rules[0].creditAccountId !== accounts.get(event.credit))) throw new Error(`Evento local conflitante: ${event.code}. Não sobrescrever.`);
      }
      if (apply) {
        const [actor] = await tx.select({ id: users.id }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.createdAt)).limit(1);
        if (!actor) throw new Error("Ator ativo não encontrado.");
        if (!prior) {
          for (const entry of entries) await tx.insert(accountingPlans).values({ id: accounts.get(entry.code)!, code: entry.code, name: entry.name, type: entry.code.startsWith("1.") ? "Ativo" : "Passivo" }).onConflictDoNothing({ target: accountingPlans.code });
          await tx.insert(planningCatalogVersions).values({
            id: versionId, year: 2026, sourceHash: hash, status: "DRAFT", label: "POC — matriz tributária de ensaio 2026 v1",
            normativeReference: "Autorização do usuário para matriz de ensaio. Subconjunto PCASP TCE-PR; homologação municipal pendente. Publicação restrita ao modo POC.", createdById: actor.id,
          });
          await tx.insert(planningCatalogEntries).values(entries.map((entry) => ({ versionId, kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: accounts.get(entry.code)!, attributes: { ...object(entry.attributes), pocOnly: true, mapped: true, homologated: false, sourceVersionId, sourceEntryId: entry.id, matrixHash: hash } })));
          await tx.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, versionId));
          await tx.insert(financialAuditLogs).values({ action: "CONFIGURE_POC_TAX_MATRIX", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { matrixHash: hash, sourceHash, pocOnly: true, homologated: false, events } });
        } else {
          const bindings = await tx.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, versionId));
          if (bindings.length !== entries.length || bindings.some((entry) => entry.canonicalId !== accounts.get(entry.code) || object(entry.attributes).pocOnly !== true || object(entry.attributes).matrixHash !== hash)) throw new Error("Vínculos POC existentes divergentes.");
        }
        for (const event of events) {
          const [created] = await tx.insert(accountingEvents).values({ code: event.code, name: event.name, description: `POC; matriz ${hash}; homologação municipal pendente.` }).onConflictDoNothing({ target: accountingEvents.code }).returning({ id: accountingEvents.id });
          if (created) await tx.insert(accountingRules).values({ eventId: created.id, debitAccountId: accounts.get(event.debit)!, creditAccountId: accounts.get(event.credit)!, isReference: true, description: "Ensaio tributário patrimonial; não substitui controles orçamentários/MSC." });
        }
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, matrixHash: hash, sourceVersionId, sourceHash, pocOnly: true, homologated: false, accounts: entries.map((entry) => ({ code: entry.code, name: entry.name, canonicalId: accounts.get(entry.code) })), events };
    }, { timeoutMs: 60_000, lockTimeoutMs: 60_000 });
    if (apply) writeFileSync("docs/poc-p0/MATRIZ_TRIBUTARIA_POC_P1.json", `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { await databaseConnection.pool.end(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
