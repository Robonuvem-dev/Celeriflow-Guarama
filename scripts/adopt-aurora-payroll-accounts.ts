import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

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

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`;
      const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: sourceVersionId } });
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Catálogo oficial diverge da origem registrada.");
      const entries = await tx.planningCatalogEntry.findMany({ where: { versionId: sourceVersionId, kind: "ACCOUNT", code: { in: codes } }, orderBy: { code: "asc" } });
      if (entries.length !== codes.length) throw new Error("Subconjunto oficial incompleto.");
      const accounts: Array<{ source: typeof entries[number]; canonicalId: string; type: string }> = [];
      for (const entry of entries) {
        const attributes = entry.attributes as Prisma.JsonObject;
        const debit = entry.code.startsWith("3.");
        if (attributes.postingAllowed !== true || attributes.informationNature !== "P" || attributes.balanceNature !== (debit ? "D" : "C") || attributes.effectiveFrom !== "2026-01-01" || attributes.effectiveUntil !== "2026-12-31") throw new Error(`Classificação não conciliada: ${entry.code}.`);
        const type = debit ? "Despesa" : "Passivo";
        const existing = await tx.accountingPlan.findUnique({ where: { code: entry.code } });
        if (existing && (existing.name !== entry.name || existing.type !== type)) throw new Error(`Conta local conflitante ${entry.code}; preservar cadastro e conciliar o de-para.`);
        accounts.push({ source: entry, canonicalId: existing?.id ?? `aurora-account:${entry.code}`, type });
      }
      const prior = await tx.planningCatalogVersion.findUnique({ where: { id: versionId }, include: { entries: true } });
      if (prior && (prior.sourceHash !== hash || prior.status !== "PUBLISHED" || prior.entries.length !== accounts.length || prior.entries.some((entry) => !accounts.some((account) => account.source.code === entry.code && account.canonicalId === entry.canonicalId) || (entry.attributes as Prisma.JsonObject).operational !== true))) throw new Error("Adoção publicada divergente; criar nova edição em vez de sobrescrever.");
      if (apply && !prior) {
        const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        for (const account of accounts) await tx.accountingPlan.upsert({ where: { code: account.source.code }, create: { id: account.canonicalId, code: account.source.code, name: account.source.name, type: account.type }, update: {} });
        await tx.planningCatalogVersion.create({ data: { id: versionId, year: 2026, label: "Aurora das Veredas — contas de pessoal 2026 v1", sourceHash: hash, status: "DRAFT", normativeReference: decision, createdById: actor.id, entries: { create: accounts.map((account) => ({ kind: "ACCOUNT", code: account.source.code, name: account.source.name, degree: account.source.degree, canonicalId: account.canonicalId, attributes: { ...(account.source.attributes as Prisma.JsonObject), operational: true, mapped: true, homologated: true, pocOnly: false, sourceVersionId, sourceEntryId: account.source.id, decision, estimatedMunicipalPolicy: true } })) } } });
        await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
        await tx.financialAuditLog.create({ data: { action: "ADOPT_MUNICIPAL_PAYROLL_ACCOUNTS", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { sourceVersionId, sourceHash, hash, decision, codes } } });
      }
      if (apply) {
        const { assertPublishedAccountClassification } = await import("../src/lib/financeiro/account-catalog");
        await assertPublishedAccountClassification(tx, accounts.map((account) => ({ id: account.canonicalId })), new Date("2026-10-12"));
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, hash, sourceVersionId, accounts: accounts.map((account) => ({ code: account.source.code, name: account.source.name, canonicalId: account.canonicalId })), decision };
    }, { timeout: 60000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
