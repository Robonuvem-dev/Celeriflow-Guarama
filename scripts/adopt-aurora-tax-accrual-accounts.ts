import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const sourceVersionId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const versionId = "aurora-tax-accrual-accounts-2026-v1";
const profiles = [
  { taxId: "tax_iptu", receivable: "1.1.2.1.1.01.05.00.00.00.00.00", revenue: "4.1.1.2.1.02.00.00.00.00.00.00", deduction: "4.1.1.2.1.97.02.00.00.00.00.00" },
  { taxId: "tax_itbi", receivable: "1.1.2.1.1.01.06.00.00.00.00.00", revenue: "4.1.1.2.1.04.00.00.00.00.00.00", deduction: "4.1.1.2.1.97.04.00.00.00.00.00" },
  { taxId: "tax_issqn", receivable: "1.1.2.1.1.01.07.00.00.00.00.00", revenue: "4.1.1.3.1.02.00.00.00.00.00.00", deduction: "4.1.1.3.1.97.02.00.00.00.00.00" },
];
const loss = "3.6.5.1.1.03.00.00.00.00.00.00";
const codes = [...new Set([...profiles.flatMap(row => [row.receivable, row.revenue, row.deduction]), loss])].sort();
const decision = "Aurora das Veredas — reconhecimento patrimonial inicial de IPTU/ISS/ITBI na constituição, arrecadação como baixa do direito, deduções em revisão/benefícios e desincorporação na extinção; procedimento municipal estimado autorizado, sem atribuição de lei municipal presumida.";
const hash = createHash("sha256").update(JSON.stringify({ sourceHash, codes, profiles, loss, decision })).digest("hex");
const accountType = (code: string) => code.startsWith("1.") ? "Ativo" : code.startsWith("3.") ? "VPD" : "VPA";
function sameJson(left: Prisma.JsonValue, right: Prisma.JsonValue): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => sameJson(value, right[index]));
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${versionId}))`;
      const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: sourceVersionId } });
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Origem oficial divergente.");
      const entries = await tx.planningCatalogEntry.findMany({ where: { versionId: sourceVersionId, kind: "ACCOUNT", code: { in: codes } }, orderBy: { code: "asc" } });
      if (entries.length !== codes.length) throw new Error("Subconjunto tributário oficial incompleto.");
      const ids = new Map<string, string>();
      for (const entry of entries) {
        const attributes = entry.attributes as Prisma.JsonObject;
        const expected = entry.code.startsWith("4.") && !profiles.some(profile => profile.deduction === entry.code) ? "C" : "D";
        if (attributes.postingAllowed !== true || attributes.informationNature !== "P" || attributes.balanceNature !== expected || attributes.effectiveFrom !== "2026-01-01" || attributes.effectiveUntil !== "2026-12-31") throw new Error(`Classificação patrimonial divergente ${entry.code}.`);
        const account = await tx.accountingPlan.findUnique({ where: { code: entry.code } });
        if (account && (account.name !== entry.name || account.type !== accountType(entry.code))) throw new Error(`Conta existente divergente ${entry.code}; preservar e conciliar.`);
        ids.set(entry.code, account?.id ?? `aurora-account:${entry.code}`);
      }
      const existing = await tx.planningCatalogVersion.findUnique({ where: { id: versionId }, include: { entries: true } });
      const adoptedAttributes = (entry: typeof entries[number]): Prisma.JsonObject => ({ ...(entry.attributes as Prisma.JsonObject), mapped: true, operational: true, pocOnly: false, sourceEntryId: entry.id, sourceVersionId, decision });
      if (existing && (existing.sourceHash !== hash || existing.status !== "PUBLISHED" || existing.year !== 2026 || existing.normativeReference !== decision || existing.entries.length !== codes.length || existing.entries.some(entry => {
        const original = entries.find(row => row.code === entry.code);
        return !original || entry.kind !== "ACCOUNT" || entry.name !== original.name || entry.degree !== original.degree || entry.canonicalId !== ids.get(entry.code) || !sameJson(entry.attributes, adoptedAttributes(original));
      }))) throw new Error("Edição tributária publicada divergente.");
      if (apply && !existing) {
        const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        for (const entry of entries) await tx.accountingPlan.upsert({ where: { code: entry.code }, create: { id: ids.get(entry.code)!, code: entry.code, name: entry.name, type: accountType(entry.code) }, update: {} });
        await tx.planningCatalogVersion.create({ data: { id: versionId, year: 2026, label: "Aurora das Veredas — direitos tributários e variações patrimoniais 2026 v1", sourceHash: hash, status: "DRAFT", normativeReference: decision, createdById: actor.id, entries: { create: entries.map(entry => ({ kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: ids.get(entry.code), attributes: { ...(entry.attributes as Prisma.JsonObject), mapped: true, operational: true, pocOnly: false, sourceEntryId: entry.id, sourceVersionId, decision } })) } } });
        await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
        await tx.financialAuditLog.create({ data: { action: "ADOPT_MUNICIPAL_TAX_ACCRUAL_ACCOUNTS", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { hash, sourceHash, profiles, loss, decision } } });
      }
      const audits = await tx.financialAuditLog.findMany({ where: { action: "ADOPT_MUNICIPAL_TAX_ACCRUAL_ACCOUNTS", entityType: "PlanningCatalogVersion", entityId: versionId }, select: { payload: true } });
      if ((existing || apply) && (audits.length !== 1 || !sameJson(audits[0].payload, { hash, sourceHash, profiles, loss, decision }))) throw new Error("Auditoria da adoção tributária divergente.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, hash, auditCount: audits.length, accounts: entries.map(entry => ({ code: entry.code, name: entry.name, id: ids.get(entry.code) })), profiles: profiles.map(profile => ({ taxId: profile.taxId, receivableAccountId: ids.get(profile.receivable), revenueAccountId: ids.get(profile.revenue), deductionAccountId: ids.get(profile.deduction), lossAccountId: ids.get(loss) })), decision };
    }, { timeout: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
