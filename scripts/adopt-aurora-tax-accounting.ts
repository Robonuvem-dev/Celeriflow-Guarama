import { config } from "dotenv";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const previousVersionId = "p1-poc-tax-matrix-2026-v1";
const versionId = "aurora-tax-accounting-2026-v1";
const decision = "Parametrização inicial de Aurora das Veredas autorizada pelo responsável em 12/10/2026; procedimentos municipais estimados e ajustáveis na implantação, sem atribuição de lei municipal presumida.";
const events = [
  { code: "TAX_COLLECTION_EXCESS", name: "Excedente tributário a restituir" },
  { code: "TAX_CREDIT_REFUNDED", name: "Restituição tributária paga" },
  { code: "TAX_CREDIT_COMPENSATED", name: "Compensação de crédito tributário" },
];

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { assertPublishedAccountClassification } = await import("../src/lib/financeiro/account-catalog");
  try {
    const report = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${versionId}, 0))::text`;
      const previous = await tx.planningCatalogVersion.findUniqueOrThrow({ where: { id: previousVersionId }, include: { entries: true } });
      if (previous.year !== 2026 || previous.entries.length !== 3 || previous.entries.some((entry) => entry.kind !== "ACCOUNT" || (entry.attributes as Prisma.JsonObject).mapped !== true)) throw new Error("Matriz anterior sem de-para conciliado.");
      const hash = createHash("sha256").update(JSON.stringify({ municipality: "Aurora das Veredas", previousSourceHash: previous.sourceHash, decision, events, year: 2026 })).digest("hex");
      const existing = await tx.planningCatalogVersion.findUnique({ where: { id: versionId } });
      if (existing && (existing.sourceHash !== hash || existing.status !== "PUBLISHED")) throw new Error("Versão municipal existente divergente.");
      const configured = await tx.accountingEventCatalog.findMany({ where: { code: { in: events.map((event) => event.code) } }, include: { rules: true } });
      if (configured.length !== events.length || configured.some((event) => !event.isActive || event.rules.length !== 1 || !event.rules[0].isActive || !previous.entries.some((entry) => entry.canonicalId === event.rules[0].debitAccountId) || !previous.entries.some((entry) => entry.canonicalId === event.rules[0].creditAccountId))) throw new Error("Eventos municipais sem contas conciliadas; preservar configurações existentes.");
      if (existing) {
        const bindings = await tx.planningCatalogEntry.findMany({ where: { versionId } });
        if (bindings.length !== previous.entries.length || bindings.some((entry) => (entry.attributes as Prisma.JsonObject).matrixHash !== hash || (entry.attributes as Prisma.JsonObject).pocOnly !== false || !previous.entries.some((origin) => origin.code === entry.code && origin.canonicalId === entry.canonicalId)) || configured.some((event) => event.rules[0].isReference || event.name !== events.find((item) => item.code === event.code)?.name)) throw new Error("Adoção municipal alterada após publicação; concilie antes de reaplicar.");
      }
      if (apply && !existing) {
        const actor = await tx.usuario.findFirstOrThrow({ where: { ativo: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
        await tx.planningCatalogVersion.create({ data: {
          id: versionId, year: 2026, label: "Aurora das Veredas — matriz tributária 2026 v1", normativeReference: decision, sourceHash: hash, status: "DRAFT", createdById: actor.id,
          entries: { create: previous.entries.map((entry) => ({ kind: entry.kind, code: entry.code, name: entry.name, degree: entry.degree, canonicalId: entry.canonicalId, parentCode: entry.parentCode, attributes: { ...(entry.attributes as Prisma.JsonObject), pocOnly: false, operational: true, homologated: false, parameterOrigin: "OWNER_ESTIMATE", municipality: "Aurora das Veredas", predecessorEntryId: entry.id, matrixHash: hash } })) },
        } });
        await tx.planningCatalogVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
        for (const event of events) {
          await tx.accountingEventCatalog.update({ where: { code: event.code }, data: { name: event.name, description: decision } });
          const configuredEvent = configured.find((item) => item.code === event.code)!;
          await tx.accountingPostingRule.update({ where: { id: configuredEvent.rules[0].id }, data: { isReference: false, description: `Matriz municipal ${versionId}; ${decision}` } });
        }
        await tx.financialAuditLog.create({ data: { action: "ADOPT_MUNICIPAL_TAX_MATRIX", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { municipality: "Aurora das Veredas", parameterOrigin: "OWNER_ESTIMATE", decision, previousVersionId, previousSourceHash: previous.sourceHash, matrixHash: hash, previousEvents: configured.map((event) => ({ id: event.id, code: event.code, name: event.name, description: event.description, ruleId: event.rules[0].id, isReference: event.rules[0].isReference })) } } });
      }
      if (apply || existing) await assertPublishedAccountClassification(tx, previous.entries.map((entry) => ({ id: entry.canonicalId })), new Date("2026-10-12"));
      return { mode: apply ? "APPLIED" : "READ_ONLY", municipality: "Aurora das Veredas", versionId, matrixHash: hash, predecessor: previousVersionId, preservedAccountIds: previous.entries.map((entry) => entry.canonicalId), events, parameterOrigin: "OWNER_ESTIMATE", replay: Boolean(existing) };
    }, { timeout: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
