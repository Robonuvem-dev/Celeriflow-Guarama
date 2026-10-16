import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const sourceId = "p1-tce-pr-account-2026-1.0d";
const sourceHash = "824d3dc03ad3f2d40abdbb10b2e2c5a30b590854af974be0a403fb12349d851a";
const versionId = "aurora-asset-depreciation-accounts-2026-v1";
const decision = "Aurora das Veredas — contas patrimoniais oficiais para depreciação de bens móveis/imóveis, com classificação da categoria e vida útil ajustáveis na implantação; sem alteração retroativa dos bens e históricos existentes.";

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`;
      const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: sourceId } });
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Origem patrimonial oficial divergente.");
      const entries = await tx.planningCatalogEntry.findMany({ where: { versionId: sourceId, kind: "ACCOUNT", OR: [{ code: { startsWith: "1.2.3.8.1." }, name: { contains: "DEPRECIAÇÃO", mode: "insensitive" } }, { code: { in: ["3.3.3.1.1.01.01.00.00.00.00.00", "3.3.3.1.1.01.02.00.00.00.00.00"] } }] }, orderBy: { code: "asc" } });
      const selected = entries.filter(entry => (entry.attributes as Prisma.JsonObject).postingAllowed === true);
      if (selected.length !== 20) throw new Error("Subconjunto oficial de depreciação incompleto ou alterado.");
      const hash = createHash("sha256").update(JSON.stringify({ sourceHash, decision, entries: selected.map(entry => ({ code: entry.code, name: entry.name, attributes: entry.attributes })) })).digest("hex");
      const ids = new Map<string, string>();
      for (const entry of selected) {
        const attributes = entry.attributes as Prisma.JsonObject;
        if (attributes.informationNature !== "P" || attributes.balanceNature !== (entry.code.startsWith("1.") ? "C" : "D") || attributes.effectiveFrom !== "2026-01-01" || attributes.effectiveUntil !== "2026-12-31") throw new Error(`Classificação divergente: ${entry.code}.`);
        const account = await tx.accountingPlan.findUnique({ where: { code: entry.code } });
        const type = entry.code.startsWith("1.") ? "Ativo" : "VPD";
        if (account && (account.name !== entry.name || account.type !== type)) throw new Error(`Preservar e conciliar conta existente divergente: ${entry.code}.`);
        ids.set(entry.code, account?.id ?? `aurora-account:${entry.code}`);
      }
      const existing = await tx.planningCatalogVersion.findUnique({ where: { id: versionId }, include: { entries: true } });
      if (existing && (existing.status !== "PUBLISHED" || existing.sourceHash !== hash || existing.entries.length !== selected.length || existing.entries.some(entry => { const origin = selected.find(row => row.code === entry.code); const attributes = entry.attributes as Prisma.JsonObject; return !origin || entry.canonicalId !== ids.get(entry.code) || entry.name !== origin.name || entry.degree !== origin.degree || attributes.sourceEntryId !== origin.id || attributes.operational !== true || attributes.pocOnly !== false; }))) throw new Error("Edição patrimonial publicada divergente.");
      if (apply && !existing) {
        const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        for (const entry of selected) await tx.accountingPlan.upsert({ where: { code: entry.code }, update: {}, create: { id: ids.get(entry.code)!, code: entry.code, name: entry.name, type: entry.code.startsWith("1.") ? "Ativo" : "VPD" } });
        await tx.planningCatalogVersion.create({ data: { id: versionId, year: 2026, label: "Aurora das Veredas — depreciação patrimonial 2026 v1", sourceHash: hash, normativeReference: decision, status: "DRAFT", createdById: actor.id, entries: { create: selected.map(entry => ({ kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: ids.get(entry.code)!, attributes: { ...(entry.attributes as Prisma.JsonObject), mapped: true, operational: true, pocOnly: false, sourceEntryId: entry.id, sourceVersionId: sourceId, decision } })) } } });
        await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
        await tx.financialAuditLog.create({ data: { action: "ADOPT_ASSET_DEPRECIATION_ACCOUNTS", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { hash, sourceHash, decision, codes: selected.map(entry => entry.code) } } });
      }
      const auditCount = await tx.financialAuditLog.count({ where: { action: "ADOPT_ASSET_DEPRECIATION_ACCOUNTS", entityId: versionId } });
      if ((existing || apply) && auditCount !== 1) throw new Error("Auditoria da adoção patrimonial divergente.");
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, hash, auditCount, accounts: selected.map(entry => ({ code: entry.code, name: entry.name, id: ids.get(entry.code) })) };
    }, { timeout: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
