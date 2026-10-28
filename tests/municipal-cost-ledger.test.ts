import assert from "node:assert/strict";
import test from "node:test";
import { count, eq } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { municipalCostAllocations, municipalCostSources, municipalCostSourceReductions } from "../src/db/schema/finance-costs";
import { financialYears } from "../src/db/schema/finance-years";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { configureMunicipalCosts, recordMunicipalCostSource, allocateMunicipalCost, correctMunicipalCost, cancelMunicipalCostSource, distributeCostPercentages, reduceMunicipalCostSource } from "../src/lib/financeiro/cost-ledger";
import { createMunicipalCostObject, saveMunicipalCostItem, linkMunicipalCostItems, createMunicipalCostRule, generateMunicipalCostObjectsFromLoa } from "../src/lib/financeiro/cost-catalog";
import { readMunicipalCosts } from "../src/lib/financeiro/cost-overview";
import { buildMunicipalCostReport } from "../src/lib/financeiro/cost-report";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { financeDatabaseError } from "./helpers/finance-database-error";

const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug", "ug-restrita"] };
const date = new Date("2026-06-01T12:00:00Z");
async function setup() {
  const fixture = await createPlanningAccountingFixture();
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    transport = await connectFinanceDrizzleFixture(fixture.pg);
    const financeTransport = transport;
    await financeTransport.connection.db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await configureMunicipalCosts(financeTransport.connection, actor, { financialYearId: "ano", enabled: true, sourceTypes: ["SETTLEMENT"], effectiveFrom: new Date("2026-01-01"), reason: "Apropriação municipal por competência" });
    const object = await createMunicipalCostObject(financeTransport.connection, actor, { financialYearId: "ano", budgetUnitId: "ug", description: "Serviços municipais", detailedDescription: "Serviços administrativos da UG" });
    const item = await saveMunicipalCostItem(financeTransport.connection, actor, { financialYearId: "ano", identifier: "ENERGIA", description: "Energia", detailedDescription: "Energia elétrica", identificationClass: "TEXTO", behavior: "VARIABLE", isActive: true });
    await linkMunicipalCostItems(financeTransport.connection, actor, { objectIds: [object.id], itemIds: [item.id] });
    const source = await withDatabaseTransaction(financeTransport.connection, tx => recordMunicipalCostSource(tx, actor, { financialYearId: "ano", budgetUnitId: "ug", sourceType: "SETTLEMENT", sourceId: "liquidacao", expenseDate: date, amount: new Decimal("100.00"), dimensions: {}, evidence: { settlementId: "liquidacao" } }));
    assert.ok(source);
    return { ...fixture, object, item, source, financeConnection: financeTransport.connection, async close() { try { await financeTransport.close(); } finally { await fixture.close(); } } };
  } catch (error) { try { await transport?.close(); } finally { await fixture.close(); } throw error; }
}

test("custos: concorrência respeita teto, replay e correções conservam posição/histórico", async () => {
  const f = await setup();
  try {
    const input = { sourceId: f.source.id, date, reason: "Consumo administrativo", allocations: [{ objectId: f.object.id, itemId: f.item.id, amount: "70.00" }] };
    const results = await Promise.allSettled([allocateMunicipalCost(f.financeConnection, actor, { ...input, idempotencyKey: "distribuicao-1" }), allocateMunicipalCost(f.financeConnection, actor, { ...input, idempotencyKey: "distribuicao-2" })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const success = results.find(result => result.status === "fulfilled"); assert.ok(success?.status === "fulfilled");
    const original = success.value;
    assert.equal((await allocateMunicipalCost(f.financeConnection, actor, { ...input, idempotencyKey: original.idempotencyKey })).id, original.id);
    await assert.rejects(allocateMunicipalCost(f.financeConnection, actor, { ...input, reason: "Conteúdo divergente", idempotencyKey: original.idempotencyKey }));
    await assert.rejects(withDatabaseTransaction(f.financeConnection, tx => cancelMunicipalCostSource(tx, actor, "SETTLEMENT", "liquidacao")));
    const reversal = await correctMunicipalCost(f.financeConnection, actor, { movementId: original.id, date, reason: "Correção da apropriação", kind: "REVERSAL", idempotencyKey: "estorno" });
    const restored = await correctMunicipalCost(f.financeConnection, actor, { movementId: reversal.id, date, reason: "Recomposição da posição", kind: "RESTORATION", idempotencyKey: "restauracao" });
    const view = await readMunicipalCosts(f.financeConnection, actor, "ano");
    assert.equal(view.sources[0].allocated, "70.00"); assert.equal(view.sources[0].pending, "30.00");
    await assert.rejects(f.financeConnection.db.update(municipalCostAllocations).set({ amount: new Decimal("1.00") }).where(eq(municipalCostAllocations.movementId, original.id)));
    await correctMunicipalCost(f.financeConnection, actor, { movementId: restored.id, date, reason: "Anulação definitiva", kind: "REVERSAL", idempotencyKey: "estorno-final" });
    await withDatabaseTransaction(f.financeConnection, tx => cancelMunicipalCostSource(tx, actor, "SETTLEMENT", "liquidacao"));
    assert.equal((await readMunicipalCosts(f.financeConnection, actor, "ano")).sources[0].status, "CANCELLED");
  } finally { await f.close(); }
});

test("custos: replay da origem recusa mudança de dimensão/evidência mesmo com valor idêntico", async () => {
  const f = await setup();
  try {
    const input = { financialYearId: "ano", budgetUnitId: "ug", sourceType: "SETTLEMENT" as const, sourceId: "liquidacao", expenseDate: date, amount: new Decimal("100.00"), dimensions: {}, evidence: { settlementId: "liquidacao" } };
    const replay = await withDatabaseTransaction(f.financeConnection, tx => recordMunicipalCostSource(tx, actor, input));
    assert.equal(replay?.id, f.source.id);
    await assert.rejects(withDatabaseTransaction(f.financeConnection, tx => recordMunicipalCostSource(tx, actor, { ...input, dimensions: { contractId: "outro-vinculo" } })), /dimensões ou evidências/);
    await assert.rejects(withDatabaseTransaction(f.financeConnection, tx => recordMunicipalCostSource(tx, actor, { ...input, evidence: { settlementId: "outra-liquidacao" } })), /dimensões ou evidências/);
    assert.equal((await f.financeConnection.db.select({ total: count() }).from(municipalCostSources))[0].total, 1);
  } finally { await f.close(); }
});

test("custos: outro ente/UG não distribui nem consulta nota; descrição histórica fica congelada", async () => {
  const f = await setup();
  try {
    const input = { sourceId: f.source.id, date, reason: "Consumo administrativo", idempotencyKey: "nota", allocations: [{ objectId: f.object.id, itemId: f.item.id, amount: "50.00" }] };
    await assert.rejects(allocateMunicipalCost(f.financeConnection, { usuarioId: "beatriz", allowedBudgetUnitIds: ["ug-restrita"] }, input));
    const note = await allocateMunicipalCost(f.financeConnection, actor, input);
    await saveMunicipalCostItem(f.financeConnection, actor, { financialYearId: "ano", id: f.item.id, identifier: "ENERGIA", description: "Descrição atualizada", detailedDescription: "Catálogo atual", identificationClass: "TEXTO", behavior: "VARIABLE", isActive: true });
    const report = await buildMunicipalCostReport(f.financeConnection, actor, { yearId: "ano", movementId: note.id, format: "PDF" });
    assert.ok(report.rows[0][6].includes("Energia")); assert.ok(!report.rows[0][6].includes("Descrição atualizada"));
    await assert.rejects(buildMunicipalCostReport(f.financeConnection, { usuarioId: "beatriz", allowedBudgetUnitIds: ["ug-restrita"] }, { yearId: "ano", movementId: note.id, format: "PDF" }));
    const view = await readMunicipalCosts(f.financeConnection, { usuarioId: "beatriz", allowedBudgetUnitIds: ["ug-restrita"] }, "ano"); assert.equal(view.sources.length, 0);
  } finally { await f.close(); }
});

test("custos: regras ambíguas revertem origem e geração LOA repetida preserva árvore", async () => {
  const f = await setup();
  try {
    const input = { financialYearId: "ano", budgetUnitId: "ug", title: "Rateio geral", sourceType: "SETTLEMENT" as const, selector: {}, shares: [{ objectId: f.object.id, itemId: f.item.id, percentage: "100" }], priority: 1, effectiveFrom: new Date("2026-01-01") };
    await createMunicipalCostRule(f.financeConnection, actor, input); await createMunicipalCostRule(f.financeConnection, actor, { ...input, title: "Regra concorrente" });
    await assert.rejects(withDatabaseTransaction(f.financeConnection, tx => recordMunicipalCostSource(tx, actor, { financialYearId: "ano", budgetUnitId: "ug", sourceType: "SETTLEMENT", sourceId: "conflitante", expenseDate: date, amount: new Decimal("10.00"), dimensions: {}, evidence: {} })));
    assert.equal((await f.financeConnection.db.select({ total: count() }).from(municipalCostSources).where(eq(municipalCostSources.sourceId, "conflitante")))[0].total, 0);
    const generated = await generateMunicipalCostObjectsFromLoa(f.financeConnection, actor, { financialYearId: "ano", instrumentId: f.loa, level: 6 });
    const replay = await generateMunicipalCostObjectsFromLoa(f.financeConnection, actor, { financialYearId: "ano", instrumentId: f.loa, level: 6 });
    assert.deepEqual(replay, generated); assert.equal(generated.length, 6);
  } finally { await f.close(); }
});

test("custos: rateio de centavos é determinístico e 101% é recusado", () => {
  const shares = [{ objectId: "a", itemId: "i", percentage: "33.3333" }, { objectId: "b", itemId: "i", percentage: "33.3333" }, { objectId: "c", itemId: "i", percentage: "33.3334" }];
  const rows = distributeCostPercentages(new Decimal("0.05"), shares);
  assert.equal(rows.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toFixed(2), "0.05");
  assert.deepEqual(rows.map(row => row.amount), ["0.02", "0.01", "0.02"]);
  assert.throws(() => distributeCostPercentages(new Decimal("100"), [{ objectId: "a", itemId: "i", percentage: "101" }]));
});

test("custos: devolução preserva origem, reduz teto, recusa excesso apropriado e conserva replay", async () => {
  const f = await setup();
  try {
    const allocation = await allocateMunicipalCost(f.financeConnection, actor, { sourceId: f.source.id, date, reason: "Consumo distribuído", allocations: [{ objectId: f.object.id, itemId: f.item.id, amount: "70.00" }], idempotencyKey: "consumo-70" });
    const input = { sourceId: f.source.id, date, amount: new Decimal("40.00"), reason: "Devolução parcial de material", idempotencyKey: "retorno-40", evidence: { movementId: "return-1" } };
    await assert.rejects(withDatabaseTransaction(f.financeConnection, tx => reduceMunicipalCostSource(tx, actor, input)), /apropriações excedentes/);
    assert.equal((await f.financeConnection.db.select({ total: count() }).from(municipalCostSourceReductions))[0].total, 0);
    const reversal = await correctMunicipalCost(f.financeConnection, actor, { movementId: allocation.id, date, reason: "Liberar saldo devolvido", kind: "REVERSAL", idempotencyKey: "consumo-estornado" });
    const reduction = await withDatabaseTransaction(f.financeConnection, tx => reduceMunicipalCostSource(tx, actor, input));
    assert.equal((await withDatabaseTransaction(f.financeConnection, tx => reduceMunicipalCostSource(tx, actor, input))).id, reduction.id);
    await assert.rejects(withDatabaseTransaction(f.financeConnection, tx => reduceMunicipalCostSource(tx, actor, { ...input, amount: new Decimal("41.00") })), /Chave/);
    assert.equal((await f.financeConnection.db.select().from(municipalCostSources).where(eq(municipalCostSources.id, f.source.id)))[0].amount.toFixed(2), "100.00");
    await assert.rejects(correctMunicipalCost(f.financeConnection, actor, { movementId: reversal.id, date, reason: "Restauração excessiva", kind: "RESTORATION", idempotencyKey: "restore-70" }), /teto/);
    await assert.rejects(allocateMunicipalCost(f.financeConnection, actor, { sourceId: f.source.id, date, reason: "Distribuição excessiva", allocations: [{ objectId: f.object.id, itemId: f.item.id, amount: "61.00" }], idempotencyKey: "excesso-61" }), /saldo/);
    const view = await readMunicipalCosts(f.financeConnection, actor, "ano");
    assert.equal(view.sources[0].amount, "100.00"); assert.equal(view.sources[0].netAmount, "60.00"); assert.equal(view.sources[0].pending, "60.00"); assert.equal(view.byType[0].expense, "60.00");
    await assert.rejects(f.financeConnection.db.update(municipalCostSourceReductions).set({ amount: new Decimal("1.00") }).where(eq(municipalCostSourceReductions.id, reduction.id)));
    const report = await buildMunicipalCostReport(f.financeConnection, actor, { yearId: "ano", format: "CSV" });
    assert.ok(report.rows.some(row => row[0] === "DEVOLUÇÃO DA ORIGEM" && row[3] === "-40.00"));
  } finally { await f.close(); }
});

test("custos: devoluções concorrentes não ultrapassam origem e falha de evidência reverte redução", async () => {
  const f = await setup();
  try {
    const input = { sourceId: f.source.id, date, amount: new Decimal("60.00"), reason: "Retorno", evidence: {} };
    const results = await Promise.allSettled([withDatabaseTransaction(f.financeConnection, tx => reduceMunicipalCostSource(tx, actor, { ...input, idempotencyKey: "return-A" })), withDatabaseTransaction(f.financeConnection, tx => reduceMunicipalCostSource(tx, actor, { ...input, idempotencyKey: "return-B" }))]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await readMunicipalCosts(f.financeConnection, actor, "ano")).sources[0].netAmount, "40.00");
    await f.pg.exec(`CREATE FUNCTION reject_cost_reduction_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."targetType"='MUNICIPAL_COST_SOURCE_REDUCTION' THEN RAISE EXCEPTION 'reduction evidence rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_cost_reduction_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_cost_reduction_audit();`);
    await assert.rejects(withDatabaseTransaction(f.financeConnection, tx => reduceMunicipalCostSource(tx, actor, { ...input, amount: new Decimal("10.00"), idempotencyKey: "return-audit-failure" })), financeDatabaseError(/reduction evidence rollback/));
    assert.equal((await f.financeConnection.db.select({ total: count() }).from(municipalCostSourceReductions))[0].total, 1);
    assert.equal((await readMunicipalCosts(f.financeConnection, actor, "ano")).sources[0].netAmount, "40.00");
  } finally { await f.close(); }
});
