import { config } from "dotenv";
import { createHash } from "node:crypto";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import type { JsonObject, JsonValue } from "../src/db/json";
import { withDatabaseTransaction } from "../src/db/transaction";
import { planningCatalogEntries, planningCatalogVersions } from "../src/db/schema/planning-catalog";
import { accountingEvents, accountingPlans, accountingRules } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { assetCategories } from "../src/db/schema/assets";
import { users } from "../src/db/schema/identity";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const sourceId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const versionId = "aurora-asset-impairment-accounts-2026-v1";
const decision = "Aurora das Veredas — redução a valor recuperável do imobilizado em VPD e conta redutora por categoria; avaliação fundamentada e sem reclassificação retroativa dos bens existentes.";
const groups = [
  { code: "MUNICIPAL:MAQUINAS", group: "01.01" },
  { code: "MUNICIPAL:INFORMATICA", group: "01.02" },
  { code: "MUNICIPAL:MOBILIARIO", group: "01.03" },
  { code: "MUNICIPAL:VEICULOS", group: "01.05" },
  { code: "MUNICIPAL:DEMAIS_MOVEIS", group: "01.99" },
  { code: "MUNICIPAL:IMOVEIS", group: "02.99" },
];

function attributes(value: JsonValue): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Atributos patrimoniais inválidos.");
  return value;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(url);
  try {
    const result = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`);
      const [source] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, sourceId)).limit(1);
      if (!source || source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Origem oficial patrimonial divergente.");
      const codes = groups.flatMap(row => [`3.6.1.5.1.${row.group}.00.00.00.00.00`, `1.2.3.9.1.${row.group}.00.00.00.00.00`]);
      const entries = await tx.select().from(planningCatalogEntries).where(and(eq(planningCatalogEntries.versionId, sourceId), eq(planningCatalogEntries.kind, "ACCOUNT"), inArray(planningCatalogEntries.code, codes))).orderBy(asc(planningCatalogEntries.code));
      if (entries.length !== codes.length) throw new Error("Contas oficiais de impairment incompletas.");
      const canonical = new Map<string, string>();
      for (const entry of entries) {
        const a = attributes(entry.attributes);
        if (a.postingAllowed !== true || a.informationNature !== "P" || a.balanceNature !== (entry.code.startsWith("1.") ? "C" : "D") || a.effectiveFrom !== "2026-01-01" || a.effectiveUntil !== "2026-12-31") throw new Error(`Conta inválida: ${entry.code}.`);
        const [existing] = await tx.select().from(accountingPlans).where(eq(accountingPlans.code, entry.code)).limit(1);
        const type = entry.code.startsWith("1.") ? "Ativo" : "VPD";
        if (existing && (existing.name !== entry.name || existing.type !== type)) throw new Error(`Conta existente divergente: ${entry.code}.`);
        canonical.set(entry.code, existing?.id ?? `aurora-account:${entry.code}`);
      }
      const hash = createHash("sha256").update(JSON.stringify({ sourceHash, decision, entries: entries.map(row => ({ code: row.code, name: row.name, attributes: row.attributes })) })).digest("hex");
      const [catalog] = await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, versionId)).limit(1);
      const catalogEntries = catalog ? await tx.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, versionId)) : [];
      if (catalog && (catalog.status !== "PUBLISHED" || catalog.sourceHash !== hash || catalogEntries.length !== entries.length || catalogEntries.some(row => {
        const original = entries.find(entry => entry.code === row.code);
        const a = attributes(row.attributes);
        return !original || row.name !== original.name || row.canonicalId !== canonical.get(row.code) || a.sourceEntryId !== original.id || a.operational !== true || a.pocOnly !== false || a.postingAllowed !== true;
      }))) throw new Error("Edição publicada de impairment divergente.");
      const profiles = [];
      for (const row of groups) {
        const [category] = await tx.select().from(assetCategories).where(eq(assetCategories.code, row.code)).limit(1);
        if (!category) throw new Error(`Categoria indisponível: ${row.code}.`);
        if (!category.isActive) throw new Error(`Categoria inativa: ${row.code}.`);
        const eventCode = `ASSET_IMPAIRMENT:${category.id}`;
        const debitAccountId = canonical.get(`3.6.1.5.1.${row.group}.00.00.00.00.00`)!;
        const creditAccountId = canonical.get(`1.2.3.9.1.${row.group}.00.00.00.00.00`)!;
        const [event] = await tx.select().from(accountingEvents).where(eq(accountingEvents.code, eventCode)).limit(1);
        const rules = event ? await tx.select().from(accountingRules).where(and(eq(accountingRules.eventId, event.id), eq(accountingRules.isActive, true))) : [];
        if (event && (!event.isActive || rules.length !== 1 || rules[0].isReference || rules[0].debitAccountId !== debitAccountId || rules[0].creditAccountId !== creditAccountId)) throw new Error(`Matriz existente divergente: ${eventCode}.`);
        profiles.push({ categoryId: category.id, eventCode, debitAccountId, creditAccountId, exists: !!event });
      }
      const [audit] = await tx.select({ id: financialAuditLogs.id }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "ADOPT_ASSET_IMPAIRMENT_PROFILES"), eq(financialAuditLogs.entityId, versionId))).limit(1);
      if (audit && (!catalog || profiles.some(row => !row.exists))) throw new Error("Adoção auditada incompleta.");
      if (apply) {
        const [actor] = await tx.select({ id: users.id }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.createdAt)).limit(1);
        if (!actor) throw new Error("Usuário ativo para adoção patrimonial indisponível.");
        for (const entry of entries) await tx.insert(accountingPlans).values({ id: canonical.get(entry.code)!, code: entry.code, name: entry.name, type: entry.code.startsWith("1.") ? "Ativo" : "VPD" }).onConflictDoNothing({ target: accountingPlans.code });
        if (!catalog) {
          await tx.insert(planningCatalogVersions).values({ id: versionId, year: 2026, label: "Aurora das Veredas — impairment patrimonial 2026 v1", sourceHash: hash, normativeReference: decision, status: "DRAFT", createdById: actor.id });
          await tx.insert(planningCatalogEntries).values(entries.map(entry => ({ versionId, kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: canonical.get(entry.code)!, attributes: { ...attributes(entry.attributes), mapped: true, operational: true, pocOnly: false, sourceEntryId: entry.id, sourceVersionId: sourceId, decision } })));
          await tx.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, versionId));
        }
        for (const profile of profiles.filter(row => !row.exists)) {
          const [event] = await tx.insert(accountingEvents).values({ code: profile.eventCode, name: `Redução a valor recuperável — ${profile.categoryId}`, description: decision }).returning({ id: accountingEvents.id });
          await tx.insert(accountingRules).values({ eventId: event.id, debitAccountId: profile.debitAccountId, creditAccountId: profile.creditAccountId, isReference: false, description: versionId });
        }
        if (!audit) await tx.insert(financialAuditLogs).values({ action: "ADOPT_ASSET_IMPAIRMENT_PROFILES", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { hash, sourceHash, decision, profiles } });
      }
      const [{ total: auditCount }] = await tx.select({ total: count() }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "ADOPT_ASSET_IMPAIRMENT_PROFILES"), eq(financialAuditLogs.entityId, versionId)));
      if ((audit || apply) && auditCount !== 1) throw new Error("Auditoria de impairment divergente.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, hash, auditCount, accountCount: entries.length, profiles };
    }, { timeoutMs: 60000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
