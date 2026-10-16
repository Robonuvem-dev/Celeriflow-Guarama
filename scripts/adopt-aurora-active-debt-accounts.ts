import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const sourceId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const versionId = "aurora-active-debt-accounts-2026-v1";
const decision = "Aurora das Veredas — na emissão da CDA, reclassificar somente direito já reconhecido em conta de dívida ativa pelo saldo residual, sem segunda VPA; conservar contas da reclassificação/extinção e não reconhecer legados retroativamente.";
const taxes = [{ id: "tax_iptu", component: "05" }, { id: "tax_itbi", component: "06" }, { id: "tax_issqn", component: "07" }];
const codes = taxes.flatMap(tax => [`1.1.2.5.1.01.${tax.component}.00.00.00.00.00`, `3.6.5.1.1.01.01.${tax.component}.00.00.00.00`]).sort();
async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`;
      const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: sourceId } });
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Origem oficial da dívida ativa divergente.");
      const entries = await tx.planningCatalogEntry.findMany({ where: { versionId: sourceId, kind: "ACCOUNT", code: { in: codes } }, orderBy: { code: "asc" } });
      if (entries.length !== 6) throw new Error("Seis contas oficiais da dívida ativa são exigidas.");
      const canonical = new Map<string, string>();
      for (const entry of entries) {
        const attributes = entry.attributes as Prisma.JsonObject;
        if (attributes.postingAllowed !== true || attributes.informationNature !== "P" || attributes.balanceNature !== "D" || attributes.effectiveFrom !== "2026-01-01" || attributes.effectiveUntil !== "2026-12-31") throw new Error(`Classificação inválida: ${entry.code}.`);
        const previous = await tx.accountingPlan.findUnique({ where: { code: entry.code } });
        const type = entry.code.startsWith("1.") ? "Ativo" : "VPD";
        if (previous && (previous.name !== entry.name || previous.type !== type)) throw new Error(`Conta existente divergente: ${entry.code}.`);
        canonical.set(entry.code, previous?.id ?? `aurora-account:${entry.code}`);
      }
      const hash = createHash("sha256").update(JSON.stringify({ sourceHash, decision, codes })).digest("hex");
      const catalog = await tx.planningCatalogVersion.findUnique({ where: { id: versionId }, include: { entries: true } });
      if (catalog && (catalog.status !== "PUBLISHED" || catalog.sourceHash !== hash || catalog.entries.length !== 6 || catalog.entries.some(entry => { const original = entries.find(row => row.code === entry.code); const a = entry.attributes as Prisma.JsonObject; return !original || entry.canonicalId !== canonical.get(entry.code) || entry.name !== original.name || a.sourceEntryId !== original.id || a.operational !== true || a.pocOnly !== false; }))) throw new Error("Edição publicada da dívida ativa divergente.");
      const units = await tx.budgetUnit.findMany({ where: { planningEntityUnit: { governmentEntityId: { in: ["p0-current-exe", "p0-current-leg"] } } }, select: { id: true }, orderBy: { id: "asc" } });
      if (!units.length) throw new Error("UGs municipais não configuradas.");
      const profiles = [];
      for (const tax of taxes) {
        const storedTax = await tx.tax.findUniqueOrThrow({ where: { id: tax.id } });
        if (!storedTax.isActive) throw new Error(`Tributo municipal inativo: ${tax.id}.`);
        const original = await tx.accountingPlan.findUniqueOrThrow({ where: { code: `1.1.2.1.1.01.${tax.component}.00.00.00.00.00` } });
        const debtAccountId = canonical.get(`1.1.2.5.1.01.${tax.component}.00.00.00.00.00`)!;
        const lossAccountId = canonical.get(`3.6.5.1.1.01.01.${tax.component}.00.00.00.00`)!;
        for (const unit of units) for (const [code, debitAccountId, creditAccountId] of [[`TAX_ACTIVE_DEBT:${tax.id}:${unit.id}`, debtAccountId, original.id], [`TAX_ACTIVE_DEBT_EXTINCTION:${tax.id}:${unit.id}`, lossAccountId, debtAccountId]]) {
          const event = await tx.accountingEventCatalog.findUnique({ where: { code }, include: { rules: { where: { isActive: true } } } });
          if (event && (!event.isActive || event.rules.length !== 1 || event.rules[0].isReference || event.rules[0].debitAccountId !== debitAccountId || event.rules[0].creditAccountId !== creditAccountId)) throw new Error(`Evento municipal existente divergente: ${code}.`);
          profiles.push({ code, debitAccountId, creditAccountId, exists: !!event });
        }
      }
      const audit = await tx.financialAuditLog.findFirst({ where: { action: "ADOPT_ACTIVE_DEBT_ACCOUNTS", entityId: versionId } });
      if (audit && (!catalog || profiles.some(row => !row.exists))) throw new Error("Adoção auditada da dívida ativa incompleta.");
      if (apply) {
        const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        for (const entry of entries) await tx.accountingPlan.upsert({ where: { code: entry.code }, update: {}, create: { id: canonical.get(entry.code)!, code: entry.code, name: entry.name, type: entry.code.startsWith("1.") ? "Ativo" : "VPD" } });
        if (!catalog) {
          await tx.planningCatalogVersion.create({ data: { id: versionId, year: 2026, label: "Aurora das Veredas — dívida ativa 2026 v1", sourceHash: hash, normativeReference: decision, status: "DRAFT", createdById: actor.id, entries: { create: entries.map(entry => ({ kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: canonical.get(entry.code)!, attributes: { ...(entry.attributes as Prisma.JsonObject), mapped: true, operational: true, pocOnly: false, sourceEntryId: entry.id, sourceVersionId: sourceId, decision } })) } } });
          await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
        }
        for (const profile of profiles.filter(row => !row.exists)) await tx.accountingEventCatalog.create({ data: { code: profile.code, name: profile.code, description: decision, rules: { create: { debitAccountId: profile.debitAccountId, creditAccountId: profile.creditAccountId, isReference: false, description: versionId } } } });
        if (!audit) await tx.financialAuditLog.create({ data: { action: "ADOPT_ACTIVE_DEBT_ACCOUNTS", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { hash, sourceHash, decision, profiles } } });
      }
      const auditCount = await tx.financialAuditLog.count({ where: { action: "ADOPT_ACTIVE_DEBT_ACCOUNTS", entityId: versionId } });
      if ((audit || apply) && auditCount !== 1) throw new Error("Auditoria da adoção da dívida ativa divergente.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, hash, accountCount: entries.length, auditCount, profiles };
    }, { timeout: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
