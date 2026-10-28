import { config } from "dotenv";
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { planningCatalogEntries, planningCatalogVersions } from "../src/db/schema/planning-catalog";
import { accountingEvents, accountingRules } from "../src/db/schema/finance-accounting";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { findTaxAccountingEvent, lockTaxAccountingKey, readTaxAccountingCatalog, taxAccountingObject } from "../src/db/repositories/tax-accounting/records";
import { readTaxAccountingAdoptionActor } from "../src/db/repositories/tax-accounting/script-records";

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
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(url);
  const { assertPublishedAccountClassification } = await import("../src/lib/financeiro/account-catalog");
  try {
    const report = await withDatabaseTransaction(connection, async (tx) => {
      await lockTaxAccountingKey(tx, versionId);
      const previous = await readTaxAccountingCatalog(tx, previousVersionId);
      if (previous.year !== 2026 || previous.entries.length !== 3 || previous.entries.some((entry) => entry.kind !== "ACCOUNT" || taxAccountingObject(entry.attributes).mapped !== true)) throw new Error("Matriz anterior sem de-para conciliado.");
      const hash = createHash("sha256").update(JSON.stringify({ municipality: "Aurora das Veredas", previousSourceHash: previous.sourceHash, decision, events, year: 2026 })).digest("hex");
      const existing = (await tx.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, versionId)).limit(1))[0];
      if (existing && (existing.sourceHash !== hash || existing.status !== "PUBLISHED")) throw new Error("Versão municipal existente divergente.");
      const configuredEvents = await tx.select().from(accountingEvents).where(inArray(accountingEvents.code, events.map(event => event.code)));
      const configured = [];
      for (const event of configuredEvents) configured.push((await findTaxAccountingEvent(tx, event.code, false))!);
      if (configured.length !== events.length || configured.some((event) => !event.isActive || event.rules.length !== 1 || !event.rules[0].isActive || !previous.entries.some((entry) => entry.canonicalId === event.rules[0].debitAccountId) || !previous.entries.some((entry) => entry.canonicalId === event.rules[0].creditAccountId))) throw new Error("Eventos municipais sem contas conciliadas; preservar configurações existentes.");
      if (existing) {
        const bindings = await tx.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, versionId));
        if (bindings.length !== previous.entries.length || bindings.some((entry) => taxAccountingObject(entry.attributes).matrixHash !== hash || taxAccountingObject(entry.attributes).pocOnly !== false || !previous.entries.some((origin) => origin.code === entry.code && origin.canonicalId === entry.canonicalId)) || configured.some((event) => event.rules[0].isReference || event.name !== events.find((item) => item.code === event.code)?.name)) throw new Error("Adoção municipal alterada após publicação; concilie antes de reaplicar.");
      }
      if (apply && !existing) {
        const actor = await readTaxAccountingAdoptionActor(tx);
        await tx.insert(planningCatalogVersions).values({
          id: versionId, year: 2026, label: "Aurora das Veredas — matriz tributária 2026 v1", normativeReference: decision, sourceHash: hash, status: "DRAFT", createdById: actor.id,
        });
        await tx.insert(planningCatalogEntries).values(previous.entries.map((entry) => ({ versionId, kind: entry.kind, code: entry.code, name: entry.name, degree: entry.degree, canonicalId: entry.canonicalId, parentCode: entry.parentCode, attributes: { ...taxAccountingObject(entry.attributes), pocOnly: false, operational: true, homologated: false, parameterOrigin: "OWNER_ESTIMATE", municipality: "Aurora das Veredas", predecessorEntryId: entry.id, matrixHash: hash } })));
        await tx.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, versionId));
        for (const event of events) {
          await tx.update(accountingEvents).set({ name: event.name, description: decision }).where(eq(accountingEvents.code, event.code));
          const configuredEvent = configured.find((item) => item.code === event.code)!;
          await tx.update(accountingRules).set({ isReference: false, description: `Matriz municipal ${versionId}; ${decision}` }).where(eq(accountingRules.id, configuredEvent.rules[0].id));
        }
        await tx.insert(financialAuditLogs).values({ action: "ADOPT_MUNICIPAL_TAX_MATRIX", entityType: "PlanningCatalogVersion", entityId: versionId, authorUsuarioId: actor.id, payload: { municipality: "Aurora das Veredas", parameterOrigin: "OWNER_ESTIMATE", decision, previousVersionId, previousSourceHash: previous.sourceHash, matrixHash: hash, previousEvents: configured.map((event) => ({ id: event.id, code: event.code, name: event.name, description: event.description, ruleId: event.rules[0].id, isReference: event.rules[0].isReference })) } });
      }
      if (apply || existing) await assertPublishedAccountClassification(tx, previous.entries.map((entry) => ({ id: entry.canonicalId })), new Date("2026-10-12"));
      return { mode: apply ? "APPLIED" : "READ_ONLY", municipality: "Aurora das Veredas", versionId, matrixHash: hash, predecessor: previousVersionId, preservedAccountIds: previous.entries.map((entry) => entry.canonicalId), events, parameterOrigin: "OWNER_ESTIMATE", replay: Boolean(existing) };
    }, { timeoutMs: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
