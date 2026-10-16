import { config } from "dotenv";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Prisma } from "@prisma/client";

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

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  try {
    const report = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`;
      const source = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: sourceVersionId } });
      if (source.sourceHash !== sourceHash || source.year !== 2026) throw new Error("Origem oficial divergente.");
      const entries = await tx.planningCatalogEntry.findMany({ where: { versionId: sourceVersionId, kind: "ACCOUNT", code: { in: Object.values(codes) } } });
      if (entries.length !== Object.keys(codes).length) throw new Error("Contas oficiais da matriz não encontradas.");
      const accounts = new Map<string, string>();
      for (const entry of entries) {
        const attr = entry.attributes as Prisma.JsonObject;
        if (attr.postingAllowed !== true || attr.informationNature !== "P" || attr.balanceNature !== (entry.code.startsWith("1.") ? "D" : "C")) throw new Error(`Classificação incompatível: ${entry.code}`);
        const existing = await tx.accountingPlan.findUnique({ where: { code: entry.code } });
        const type = entry.code.startsWith("1.") ? "Ativo" : "Passivo";
        if (existing && (existing.name !== entry.name || existing.type !== type)) throw new Error(`De-para conflitante; preservar conta ${existing.id}.`);
        accounts.set(entry.code, existing?.id ?? `p1-poc-account:${entry.code}`);
      }
      const prior = await tx.planningCatalogVersion.findUnique({ where: { id: versionId } });
      if (prior && (prior.sourceHash !== hash || prior.status !== "PUBLISHED" || prior.year !== 2026)) throw new Error("Versão POC existente divergente.");
      // Never replace a local event or deactivate a local posting rule.
      for (const event of events) {
        const existing = await tx.accountingEventCatalog.findUnique({ where: { code: event.code }, include: { rules: true } });
        if (existing && (!existing.isActive || existing.name !== event.name || existing.rules.length !== 1 || !existing.rules[0].isActive || !existing.rules[0].isReference || existing.rules[0].debitAccountId !== accounts.get(event.debit) || existing.rules[0].creditAccountId !== accounts.get(event.credit))) throw new Error(`Evento local conflitante: ${event.code}. Não sobrescrever.`);
      }
      if (apply) {
        const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        if (!prior) {
          for (const entry of entries) await tx.accountingPlan.upsert({ where: { code: entry.code }, create: { id: accounts.get(entry.code), code: entry.code, name: entry.name, type: entry.code.startsWith("1.") ? "Ativo" : "Passivo" }, update: {} });
          await tx.planningCatalogVersion.create({ data: {
            id: versionId, year: 2026, sourceHash: hash, status: "DRAFT", label: "POC — matriz tributária de ensaio 2026 v1",
            normativeReference: "Autorização do usuário para matriz de ensaio. Subconjunto PCASP TCE-PR; homologação municipal pendente. Publicação restrita ao modo POC.", createdById: actor.id,
            entries: { create: entries.map((entry) => ({ kind: "ACCOUNT", code: entry.code, name: entry.name, degree: entry.degree, canonicalId: accounts.get(entry.code)!, attributes: { ...(entry.attributes as Prisma.JsonObject), pocOnly: true, mapped: true, homologated: false, sourceVersionId, sourceEntryId: entry.id, matrixHash: hash } })) },
          } });
          await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
          await tx.financialAuditLog.create({ data: { action: "CONFIGURE_POC_TAX_MATRIX", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { matrixHash: hash, sourceHash, pocOnly: true, homologated: false, events } } });
        } else {
          const bindings = await tx.planningCatalogEntry.findMany({ where: { versionId } });
          if (bindings.length !== entries.length || bindings.some((entry) => entry.canonicalId !== accounts.get(entry.code) || (entry.attributes as Prisma.JsonObject).pocOnly !== true || (entry.attributes as Prisma.JsonObject).matrixHash !== hash)) throw new Error("Vínculos POC existentes divergentes.");
        }
        for (const event of events) await tx.accountingEventCatalog.upsert({ where: { code: event.code }, create: { code: event.code, name: event.name, description: `POC; matriz ${hash}; homologação municipal pendente.`, rules: { create: { debitAccountId: accounts.get(event.debit)!, creditAccountId: accounts.get(event.credit)!, isReference: true, description: "Ensaio tributário patrimonial; não substitui controles orçamentários/MSC." } } }, update: {} });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", versionId, matrixHash: hash, sourceVersionId, sourceHash, pocOnly: true, homologated: false, accounts: entries.map((entry) => ({ code: entry.code, name: entry.name, canonicalId: accounts.get(entry.code) })), events };
    }, { timeout: 60000 });
    if (apply) writeFileSync("docs/poc-p0/MATRIZ_TRIBUTARIA_POC_P1.json", `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
