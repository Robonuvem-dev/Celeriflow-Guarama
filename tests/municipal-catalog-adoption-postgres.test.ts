import assert from "node:assert/strict";
import test from "node:test";
import { adoptMunicipalCatalog } from "../src/lib/planejamento/catalog-adoption";
import { postAccountingTransaction } from "../src/lib/financeiro";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { planningLookup } from "../src/lib/planejamento/lookups";
import { and, count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { financialYears } from "../src/db/schema/finance-years";
import { accountingEntries, accountingPlans, accountingTransactions } from "../src/db/schema/finance-accounting";
import { planningCatalogEntries, planningCatalogVersions } from "../src/db/schema/planning-legal";
import { revenues, revenueRedistributions } from "../src/db/schema/finance-revenues";

test("Adoção municipal aditiva: de-para, replay, vigência, snapshot imutável e recusa de conflitos", async () => {
  const f = await createPlanningAccountingFixture();
  const previousMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "MUNICIPAL";
  try {
    await f.rules();
    await f.db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await f.db.insert(planningCatalogVersions).values({ id: "official", year: 2026, label: "Fonte preservada", sourceHash: "f".repeat(64), normativeReference: "Origem oficial da fixture isolada", createdById: "ana" });
    await f.db.insert(planningCatalogEntries).values([
      { id: "official-debit", kind: "ACCOUNT", code: "1.1.1", name: "Ativo", canonicalId: "UNMAPPED:D", degree: 3, attributes: { postingAllowed: true, balanceNature: "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } },
      { id: "official-credit", kind: "ACCOUNT", code: "2.1.1", name: "Passivo", canonicalId: "UNMAPPED:C", degree: 3, attributes: { postingAllowed: true, balanceNature: "C", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } },
    ].map(entry => ({ ...entry, versionId: "official" })));
    const mappings = [{ sourceEntryId: "official-debit", canonicalId: "debito" }, { sourceEntryId: "official-credit", canonicalId: "credito" }];
    const input = { sourceVersionId: "official", governmentEntityId: "ente", budgetUnitId: "", label: "Adoção municipal", reason: "Decisão parametrizada na base isolada", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", mappings: JSON.stringify(mappings) };
    const adopted = await adoptMunicipalCatalog(f.context, input);
    assert.equal(await adoptMunicipalCatalog(f.context, { ...input, mappings: JSON.stringify(mappings.reverse(), null, 2) }), adopted);
    assert.equal((await f.db.select().from(planningCatalogVersions).where(eq(planningCatalogVersions.id, "official")))[0].status, "DRAFT");
    assert.equal((await f.db.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.id, "official-debit")))[0].canonicalId, "UNMAPPED:D");
    assert.equal((await f.db.select({ value: count() }).from(accountingPlans))[0].value, 2);
    await assert.rejects(adoptMunicipalCatalog(f.context, { ...input, label: "Conflito sobreposto" }), /sobreposta/);
    await assert.rejects(adoptMunicipalCatalog(f.context, { ...input, governmentEntityId: "ente-ausente" }));
    await assert.rejects(adoptMunicipalCatalog(f.context, { ...input, mappings: JSON.stringify([{ sourceEntryId: "official-debit", canonicalId: "inexistente" }]) }), /inexistente/);
    const actor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
    const posting = { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-04-01"), history: "Partida com classificação congelada", lines: [{ accountId: "debito", type: "Débito" as const, value: "10.01" }, { accountId: "credito", type: "Crédito" as const, value: "10.01" }] };
    const transaction = await postAccountingTransaction(f.connection, actor, posting);
    const [persisted] = await f.db.select().from(accountingEntries).where(and(eq(accountingEntries.transactionId, transaction.id), eq(accountingEntries.accountId, "debito"))).limit(1);
    assert.equal((persisted.classificationSnapshot as { versionId: string }).versionId, adopted);
    await assert.rejects(f.pg.query('UPDATE "AccountingEntry" SET "classificationSnapshot"=$1 WHERE id=$2', [JSON.stringify({ versionId: "other" }), persisted.id]), /immutable/);
    await assert.rejects(f.pg.query('UPDATE "PlanningCatalogEntry" SET "canonicalId"=$1 WHERE "versionId"=$2', ["other", adopted]), /immutable/);
    const entries = await f.db.select().from(planningCatalogEntries).where(eq(planningCatalogEntries.versionId, adopted));
    const targets = await planningLookup(f.context, { field: "canonicalCatalogId", catalogKind: "ACCOUNT", q: "ISOLATED.D" });
    assert.equal(targets.options[0].id, "debito");
    const predecessors = await planningLookup(f.context, { field: "predecessorEntryId", catalogKind: "ACCOUNT", canonicalId: "debito" });
    assert.equal(predecessors.options[0].id, entries.find(entry => entry.canonicalId === "debito")!.id);
    const successors = mappings.map(row => ({ ...row, predecessorEntryId: entries.find(entry => entry.canonicalId === row.canonicalId)!.id }));
    const next = await adoptMunicipalCatalog(f.context, { ...input, label: "Revisão julho", effectiveFrom: "2026-07-01", mappings: JSON.stringify(successors) });
    const newer = await postAccountingTransaction(f.connection, actor, { ...posting, date: new Date("2026-08-01") });
    assert.equal(((await f.db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, newer.id)).limit(1))[0].classificationSnapshot as { versionId: string }).versionId, next);
    assert.equal(((await f.db.select().from(accountingEntries).where(eq(accountingEntries.id, persisted.id)))[0].classificationSnapshot as { versionId: string }).versionId, adopted);
  } finally {
    if (previousMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE;
    else process.env.CELERIFLOW_ACCOUNTING_MODE = previousMode;
    await f.close();
  }
});

test("Redistribuição: memória de fontes distintas por linha, decisão publicada e rollback sem configuração", async () => {
  const f = await createPlanningAccountingFixture();
  const previousMode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "MUNICIPAL";
  try {
    await f.rules();
    await f.db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await f.db.insert(planningCatalogVersions).values({ id: "line-reference", year: 2026, label: "Referência de linhas", normativeReference: "Referência sintética documentada para teste isolado", sourceHash: "a".repeat(64), createdById: "ana" });
    await f.db.insert(planningCatalogEntries).values([
      { id: "line-debit", kind: "ACCOUNT", code: "1.1.1", name: "Débito documentado", canonicalId: "UNMAPPED:D", degree: 3, attributes: { postingAllowed: true, balanceNature: "D" } },
      { id: "line-credit", kind: "ACCOUNT", code: "2.1.1", name: "Crédito documentado", canonicalId: "UNMAPPED:C", degree: 3, attributes: { postingAllowed: true, balanceNature: "C" } },
      { id: "line-source", kind: "SOURCE", code: "000", name: "Origem", canonicalId: "UNMAPPED:S", degree: 1, attributes: {} as Record<string, string | boolean> },
      { id: "line-destination", kind: "SOURCE", code: "303", name: "Destino", canonicalId: "UNMAPPED:T", degree: 1, attributes: {} as Record<string, string | boolean> },
    ].map(entry => ({ ...entry, versionId: "line-reference" })));
    const input = { sourceVersionId: "line-reference", governmentEntityId: "ente", label: "Adoção das fontes por linha", reason: "Decisão de fonte de débito preservada", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31", mappings: JSON.stringify([
      { sourceEntryId: "line-debit", canonicalId: "debito" }, { sourceEntryId: "line-credit", canonicalId: "credito" },
      { sourceEntryId: "line-source", canonicalId: "livre" }, { sourceEntryId: "line-destination", canonicalId: "vinculada" },
    ]) };
    const adopted = await adoptMunicipalCatalog(f.context, input);
    await f.db.insert(revenues).values({ id: "dimension-revenue", value: 10.01, valueDecimal: new Decimal("10.01"), financialYearId: "ano", budgetUnitId: "ug", revenueNatureId: "receita", resourceSourceId: "livre", sourceModule: "TRIBUTARIO", sourceType: "TAX_PAYMENT", sourceId: "sector-payment-id" });
    await f.db.insert(revenueRedistributions).values({ id: "dimension-redistribution", revenueId: "dimension-revenue", date: new Date("2026-08-01"), valueDecimal: new Decimal("10.01"), sourceResourceSourceId: "livre", destinationResourceSourceId: "vinculada", financialYearId: "ano", history: "Redistribuição documentada" });
    const actor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
    const posting = { financialYearId: "ano", governmentEntityId: "ente", budgetUnitId: "ug", date: new Date("2026-08-01"), history: "Redistribuição por linha", sourceModule: "FINANCEIRO", sourceType: "REVENUE_RESOURCE_REDISTRIBUTION", sourceId: "dimension-redistribution", lines: [{ accountId: "debito", type: "Débito" as const, value: "10.01" }, { accountId: "credito", type: "Crédito" as const, value: "10.01" }] };
    const revenuePosting = { ...posting, sourceModule: "TRIBUTARIO", sourceType: "TAX_PAYMENT", sourceId: "dimension-revenue" };
    await assert.rejects(postAccountingTransaction(f.connection, actor, { ...revenuePosting, budgetUnitId: "ug-restrita" }), /origem canônica/);
    const collected = await postAccountingTransaction(f.connection, actor, revenuePosting);
    const collectedMemory = (await f.db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, collected.id)).limit(1))[0].classificationSnapshot as { dimensions: { resourceSourceId: string; budgetDimensions: { revenueNatureId: string } } };
    assert.equal(collectedMemory.dimensions.resourceSourceId, "livre");
    assert.equal(collectedMemory.dimensions.budgetDimensions.revenueNatureId, "receita");
    await assert.rejects(postAccountingTransaction(f.connection, actor, posting), /configuração publicada/);
    assert.equal((await f.db.select({ value: count() }).from(accountingTransactions).where(eq(accountingTransactions.sourceId, posting.sourceId)))[0].value, 0);
    const predecessors = await f.db.select().from(planningCatalogEntries).where(and(eq(planningCatalogEntries.versionId, adopted), eq(planningCatalogEntries.kind, "ACCOUNT")));
    await adoptMunicipalCatalog(f.context, { ...input, label: "Decisão de redistribuição", effectiveFrom: "2026-07-01", mappings: JSON.stringify(predecessors.map(entry => ({ sourceEntryId: entry.canonicalId === "debito" ? "line-debit" : "line-credit", canonicalId: entry.canonicalId, predecessorEntryId: entry.id, redistributionDebitSource: "DESTINATION" }))) });
    const transaction = await postAccountingTransaction(f.connection, actor, posting);
    const lines = await f.db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, transaction.id));
    for (const line of lines) {
      const memory = line.classificationSnapshot as { dimensions: { resourceSourceId: string; sourceRole: string; sourceClassification: { externalCode: string } } };
      assert.equal(memory.dimensions.resourceSourceId, line.type === "Débito" ? "vinculada" : "livre");
      assert.equal(memory.dimensions.sourceRole, line.type === "Débito" ? "DESTINATION" : "ORIGIN");
      assert.equal(memory.dimensions.sourceClassification.externalCode, line.type === "Débito" ? "303" : "000");
    }
    const reversalInput = { ...posting, sourceType: "REVENUE_RESOURCE_REDISTRIBUTION_REVERSAL", date: new Date("2026-08-02"), reversalOfId: transaction.id, idempotencyKey: "dimension-reversal-explicit", lines: lines.map(line => ({ originalEntryId: line.id, accountId: line.accountId, value: line.valueDecimal!, type: line.type === "Débito" ? "Crédito" as const : "Débito" as const })) };
    const reversal = await postAccountingTransaction(f.connection, actor, reversalInput);
    assert.equal((await postAccountingTransaction(f.connection, actor, reversalInput)).id, reversal.id);
    await assert.rejects(postAccountingTransaction(f.connection, actor, { ...reversalInput, lines: reversalInput.lines.map((line, index) => ({ ...line, originalEntryId: reversalInput.lines[(index + 1) % reversalInput.lines.length].originalEntryId })) }), /contraparte/);
    const reversedLines = await f.db.select().from(accountingEntries).where(eq(accountingEntries.transactionId, reversal.id));
    for (const line of reversedLines) {
      const dimensions = (line.classificationSnapshot as { dimensions: { resourceSourceId: string; originalTransactionId: string } }).dimensions;
      assert.equal(dimensions.resourceSourceId, line.accountId === "debito" ? "vinculada" : "livre");
      assert.equal(dimensions.originalTransactionId, transaction.id);
    }
  } finally {
    if (previousMode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = previousMode;
    await f.close();
  }
});
