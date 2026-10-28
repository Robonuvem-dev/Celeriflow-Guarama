import { createHash } from "node:crypto";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { planningCatalogEntries, planningCatalogVersions, planningEntityUnits } from "@/db/schema/planning-catalog";
import { accountingEvents, accountingPlans, accountingRules } from "@/db/schema/finance-accounting";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { taxes as taxTable } from "@/db/schema/taxation-core";
import { users } from "@/db/schema/identity";
import { requiredDebtRow } from "./records";
import { activeDebtSnapshot } from "./snapshot";

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
const sourceId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const versionId = "aurora-active-debt-accounts-2026-v1";
const decision = "Aurora das Veredas — na emissão da CDA, reclassificar somente direito já reconhecido em conta de dívida ativa pelo saldo residual, sem segunda VPA; conservar contas da reclassificação/extinção e não reconhecer legados retroativamente.";
const taxes = [{ id: "tax_iptu", component: "05" }, { id: "tax_itbi", component: "06" }, { id: "tax_issqn", component: "07" }];
const codes = taxes.flatMap(tax => [`1.1.2.5.1.01.${tax.component}.00.00.00.00.00`, `3.6.5.1.1.01.01.${tax.component}.00.00.00.00`]).sort();

/** The CLI and isolated integration fixture supply the originating transaction.
 * Dry run performs only reads and its transaction-scoped advisory lock. */
export async function adoptAuroraActiveDebtAccountsInTransaction(tx: DatabaseTransaction, apply: boolean) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`);
  const source = requiredDebtRow((await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, sourceId)).limit(1))[0]);
  if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Origem oficial da dívida ativa divergente.");
  const entries = await tx.select().from(planningCatalogEntries).where(and(eq(planningCatalogEntries.versionId, sourceId), eq(planningCatalogEntries.kind, "ACCOUNT"), inArray(planningCatalogEntries.code, codes))).orderBy(asc(planningCatalogEntries.code));
  if (entries.length !== 6) throw new Error("Seis contas oficiais da dívida ativa são exigidas.");
  const canonical = new Map<string, string>();
  for (const entry of entries) {
    const attributes = object(entry.attributes);
    if (attributes.postingAllowed !== true || attributes.informationNature !== "P" || attributes.balanceNature !== "D" || attributes.effectiveFrom !== "2026-01-01" || attributes.effectiveUntil !== "2026-12-31") throw new Error(`Classificação inválida: ${entry.code}.`);
    const previous = (await tx.select().from(accountingPlans).where(eq(accountingPlans.code, entry.code)).limit(1))[0];
    const type = entry.code.startsWith("1.") ? "Ativo" : "VPD";
    if (previous && (previous.name !== entry.name || previous.type !== type)) throw new Error(`Conta existente divergente: ${entry.code}.`);
    canonical.set(entry.code, previous?.id ?? `aurora-account:${entry.code}`);
  }
  const hash = createHash("sha256").update(JSON.stringify({ sourceHash, decision, codes })).digest("hex");
  const catalog = (await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, versionId)).limit(1))[0];
  const catalogEntries = catalog ? await tx.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, versionId)) : [];
  if (catalog && (catalog.status !== "PUBLISHED" || catalog.sourceHash !== hash || catalogEntries.length !== 6 || catalogEntries.some(entry => { const original = entries.find(row => row.code === entry.code); const a = object(entry.attributes); return !original || entry.canonicalId !== canonical.get(entry.code) || entry.name !== original.name || a.sourceEntryId !== original.id || a.operational !== true || a.pocOnly !== false; }))) throw new Error("Edição publicada da dívida ativa divergente.");
  const units = await tx.select({ id: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(inArray(planningEntityUnits.governmentEntityId, ["p0-current-exe", "p0-current-leg"])).orderBy(asc(planningEntityUnits.budgetUnitId));
  if (!units.length) throw new Error("UGs municipais não configuradas.");
  const profiles = [];
  for (const tax of taxes) {
    const storedTax = requiredDebtRow((await tx.select().from(taxTable).where(eq(taxTable.id, tax.id)).limit(1))[0]);
    if (!storedTax.isActive) throw new Error(`Tributo municipal inativo: ${tax.id}.`);
    const original = requiredDebtRow((await tx.select().from(accountingPlans).where(eq(accountingPlans.code, `1.1.2.1.1.01.${tax.component}.00.00.00.00.00`)).limit(1))[0]);
    const debtAccountId = canonical.get(`1.1.2.5.1.01.${tax.component}.00.00.00.00.00`)!;
    const lossAccountId = canonical.get(`3.6.5.1.1.01.01.${tax.component}.00.00.00.00`)!;
    for (const unit of units) for (const [code, debitAccountId, creditAccountId] of [[`TAX_ACTIVE_DEBT:${tax.id}:${unit.id}`, debtAccountId, original.id], [`TAX_ACTIVE_DEBT_EXTINCTION:${tax.id}:${unit.id}`, lossAccountId, debtAccountId]]) {
      const event = (await tx.select().from(accountingEvents).where(eq(accountingEvents.code, code)).limit(1))[0];
      const rules = event ? await tx.select().from(accountingRules).where(and(eq(accountingRules.eventId, event.id), eq(accountingRules.isActive, true))) : [];
      if (event && (!event.isActive || rules.length !== 1 || rules[0].isReference || rules[0].debitAccountId !== debitAccountId || rules[0].creditAccountId !== creditAccountId)) throw new Error(`Evento municipal existente divergente: ${code}.`);
      profiles.push({ code, debitAccountId, creditAccountId, exists: !!event });
    }
  }
  const audit = (await tx.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "ADOPT_ACTIVE_DEBT_ACCOUNTS"), eq(financialAuditLogs.entityId, versionId))).limit(1))[0];
  if (audit && (!catalog || profiles.some(row => !row.exists))) throw new Error("Adoção auditada da dívida ativa incompleta.");
  if (apply) {
    const actor = requiredDebtRow((await tx.select({ id: users.id }).from(users).where(eq(users.ativo, true)).orderBy(asc(users.createdAt)).limit(1))[0]);
    for (const entry of entries) await tx.insert(accountingPlans).values({ id: canonical.get(entry.code)!, code: entry.code, name: entry.name, type: entry.code.startsWith("1.") ? "Ativo" : "VPD" }).onConflictDoNothing({ target: accountingPlans.code });
    if (!catalog) {
      await tx.insert(planningCatalogVersions).values({ id: versionId, year: 2026, label: "Aurora das Veredas — dívida ativa 2026 v1", sourceHash: hash, normativeReference: decision, status: "DRAFT", createdById: actor.id });
      await tx.insert(planningCatalogEntries).values(entries.map(entry => ({ versionId, kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: canonical.get(entry.code)!, attributes: activeDebtSnapshot({ ...object(entry.attributes), mapped: true, operational: true, pocOnly: false, sourceEntryId: entry.id, sourceVersionId: sourceId, decision }) })));
      await tx.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, versionId));
    }
    for (const profile of profiles.filter(row => !row.exists)) {
      const [event] = await tx.insert(accountingEvents).values({ code: profile.code, name: profile.code, description: decision }).returning({ id: accountingEvents.id });
      await tx.insert(accountingRules).values({ eventId: event.id, debitAccountId: profile.debitAccountId, creditAccountId: profile.creditAccountId, isReference: false, description: versionId });
    }
    if (!audit) await tx.insert(financialAuditLogs).values({ action: "ADOPT_ACTIVE_DEBT_ACCOUNTS", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: activeDebtSnapshot({ hash, sourceHash, decision, profiles }) });
  }
  const auditCount = (await tx.select({ value: count() }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "ADOPT_ACTIVE_DEBT_ACCOUNTS"), eq(financialAuditLogs.entityId, versionId))))[0].value;
  if ((audit || apply) && auditCount !== 1) throw new Error("Auditoria da adoção da dívida ativa divergente.");
  return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, hash, accountCount: entries.length, auditCount, profiles };
}
