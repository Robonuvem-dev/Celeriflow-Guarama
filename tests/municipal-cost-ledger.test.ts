import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { configureMunicipalCosts, recordMunicipalCostSource, allocateMunicipalCost, correctMunicipalCost, cancelMunicipalCostSource, distributeCostPercentages, reduceMunicipalCostSource } from "../src/lib/financeiro/cost-ledger";
import { createMunicipalCostObject, saveMunicipalCostItem, linkMunicipalCostItems, createMunicipalCostRule, generateMunicipalCostObjectsFromLoa } from "../src/lib/financeiro/cost-catalog";
import { readMunicipalCosts } from "../src/lib/financeiro/cost-overview";
import { buildMunicipalCostReport } from "../src/lib/financeiro/cost-report";

const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug", "ug-restrita"] };
const date = new Date("2026-06-01T12:00:00Z");
async function setup() {
  const fixture = await createPlanningAccountingFixture();
  try {
    await fixture.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    await configureMunicipalCosts(fixture.db, actor, { financialYearId: "ano", enabled: true, sourceTypes: ["SETTLEMENT"], effectiveFrom: new Date("2026-01-01"), reason: "Apropriação municipal por competência" });
    const object = await createMunicipalCostObject(fixture.db, actor, { financialYearId: "ano", budgetUnitId: "ug", description: "Serviços municipais", detailedDescription: "Serviços administrativos da UG" });
    const item = await saveMunicipalCostItem(fixture.db, actor, { financialYearId: "ano", identifier: "ENERGIA", description: "Energia", detailedDescription: "Energia elétrica", identificationClass: "TEXTO", behavior: "VARIABLE", isActive: true });
    await linkMunicipalCostItems(fixture.db, actor, { objectIds: [object.id], itemIds: [item.id] });
    const source = await fixture.db.$transaction(tx => recordMunicipalCostSource(tx, actor, { financialYearId: "ano", budgetUnitId: "ug", sourceType: "SETTLEMENT", sourceId: "liquidacao", expenseDate: date, amount: new Prisma.Decimal("100.00"), dimensions: {}, evidence: { settlementId: "liquidacao" } }));
    assert.ok(source);
    return { ...fixture, object, item, source };
  } catch (error) { await fixture.close(); throw error; }
}

test("custos: concorrência respeita teto, replay e correções conservam posição/histórico", async () => {
  const f = await setup();
  try {
    const input = { sourceId: f.source.id, date, reason: "Consumo administrativo", allocations: [{ objectId: f.object.id, itemId: f.item.id, amount: "70.00" }] };
    const results = await Promise.allSettled([allocateMunicipalCost(f.db, actor, { ...input, idempotencyKey: "distribuicao-1" }), allocateMunicipalCost(f.db, actor, { ...input, idempotencyKey: "distribuicao-2" })]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const success = results.find(result => result.status === "fulfilled"); assert.ok(success?.status === "fulfilled");
    const original = success.value;
    assert.equal((await allocateMunicipalCost(f.db, actor, { ...input, idempotencyKey: original.idempotencyKey })).id, original.id);
    await assert.rejects(allocateMunicipalCost(f.db, actor, { ...input, reason: "Conteúdo divergente", idempotencyKey: original.idempotencyKey }));
    await assert.rejects(f.db.$transaction(tx => cancelMunicipalCostSource(tx, actor, "SETTLEMENT", "liquidacao")));
    const reversal = await correctMunicipalCost(f.db, actor, { movementId: original.id, date, reason: "Correção da apropriação", kind: "REVERSAL", idempotencyKey: "estorno" });
    const restored = await correctMunicipalCost(f.db, actor, { movementId: reversal.id, date, reason: "Recomposição da posição", kind: "RESTORATION", idempotencyKey: "restauracao" });
    const view = await readMunicipalCosts(f.db, actor, "ano");
    assert.equal(view.sources[0].allocated, "70.00"); assert.equal(view.sources[0].pending, "30.00");
    await assert.rejects(f.db.municipalCostAllocation.updateMany({ where: { movementId: original.id }, data: { amount: "1.00" } }));
    await correctMunicipalCost(f.db, actor, { movementId: restored.id, date, reason: "Anulação definitiva", kind: "REVERSAL", idempotencyKey: "estorno-final" });
    await f.db.$transaction(tx => cancelMunicipalCostSource(tx, actor, "SETTLEMENT", "liquidacao"));
    assert.equal((await readMunicipalCosts(f.db, actor, "ano")).sources[0].status, "CANCELLED");
  } finally { await f.close(); }
});

test("custos: replay da origem recusa mudança de dimensão/evidência mesmo com valor idêntico", async () => {
  const f = await setup();
  try {
    const input = { financialYearId: "ano", budgetUnitId: "ug", sourceType: "SETTLEMENT" as const, sourceId: "liquidacao", expenseDate: date, amount: new Prisma.Decimal("100.00"), dimensions: {}, evidence: { settlementId: "liquidacao" } };
    const replay = await f.db.$transaction(tx => recordMunicipalCostSource(tx, actor, input));
    assert.equal(replay?.id, f.source.id);
    await assert.rejects(f.db.$transaction(tx => recordMunicipalCostSource(tx, actor, { ...input, dimensions: { contractId: "outro-vinculo" } })), /dimensões ou evidências/);
    await assert.rejects(f.db.$transaction(tx => recordMunicipalCostSource(tx, actor, { ...input, evidence: { settlementId: "outra-liquidacao" } })), /dimensões ou evidências/);
    assert.equal(await f.db.municipalCostSource.count(), 1);
  } finally { await f.close(); }
});

test("custos: outro ente/UG não distribui nem consulta nota; descrição histórica fica congelada", async () => {
  const f = await setup();
  try {
    const input = { sourceId: f.source.id, date, reason: "Consumo administrativo", idempotencyKey: "nota", allocations: [{ objectId: f.object.id, itemId: f.item.id, amount: "50.00" }] };
    await assert.rejects(allocateMunicipalCost(f.db, { usuarioId: "beatriz", allowedBudgetUnitIds: ["ug-restrita"] }, input));
    const note = await allocateMunicipalCost(f.db, actor, input);
    await saveMunicipalCostItem(f.db, actor, { financialYearId: "ano", id: f.item.id, identifier: "ENERGIA", description: "Descrição atualizada", detailedDescription: "Catálogo atual", identificationClass: "TEXTO", behavior: "VARIABLE", isActive: true });
    const report = await buildMunicipalCostReport(f.db, actor, { yearId: "ano", movementId: note.id, format: "PDF" });
    assert.ok(report.rows[0][6].includes("Energia")); assert.ok(!report.rows[0][6].includes("Descrição atualizada"));
    await assert.rejects(buildMunicipalCostReport(f.db, { usuarioId: "beatriz", allowedBudgetUnitIds: ["ug-restrita"] }, { yearId: "ano", movementId: note.id, format: "PDF" }));
    const view = await readMunicipalCosts(f.db, { usuarioId: "beatriz", allowedBudgetUnitIds: ["ug-restrita"] }, "ano"); assert.equal(view.sources.length, 0);
  } finally { await f.close(); }
});

test("custos: regras ambíguas revertem origem e geração LOA repetida preserva árvore", async () => {
  const f = await setup();
  try {
    const input = { financialYearId: "ano", budgetUnitId: "ug", title: "Rateio geral", sourceType: "SETTLEMENT" as const, selector: {}, shares: [{ objectId: f.object.id, itemId: f.item.id, percentage: "100" }], priority: 1, effectiveFrom: new Date("2026-01-01") };
    await createMunicipalCostRule(f.db, actor, input); await createMunicipalCostRule(f.db, actor, { ...input, title: "Regra concorrente" });
    await assert.rejects(f.db.$transaction(tx => recordMunicipalCostSource(tx, actor, { financialYearId: "ano", budgetUnitId: "ug", sourceType: "SETTLEMENT", sourceId: "conflitante", expenseDate: date, amount: new Prisma.Decimal("10.00"), dimensions: {}, evidence: {} })));
    assert.equal(await f.db.municipalCostSource.count({ where: { sourceId: "conflitante" } }), 0);
    const generated = await generateMunicipalCostObjectsFromLoa(f.db, actor, { financialYearId: "ano", instrumentId: f.loa, level: 6 });
    const replay = await generateMunicipalCostObjectsFromLoa(f.db, actor, { financialYearId: "ano", instrumentId: f.loa, level: 6 });
    assert.deepEqual(replay, generated); assert.equal(generated.length, 6);
  } finally { await f.close(); }
});

test("custos: rateio de centavos é determinístico e 101% é recusado", () => {
  const shares = [{ objectId: "a", itemId: "i", percentage: "33.3333" }, { objectId: "b", itemId: "i", percentage: "33.3333" }, { objectId: "c", itemId: "i", percentage: "33.3334" }];
  const rows = distributeCostPercentages(new Prisma.Decimal("0.05"), shares);
  assert.equal(rows.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)).toFixed(2), "0.05");
  assert.deepEqual(rows.map(row => row.amount), ["0.02", "0.01", "0.02"]);
  assert.throws(() => distributeCostPercentages(new Prisma.Decimal("100"), [{ objectId: "a", itemId: "i", percentage: "101" }]));
});

test("custos: devolução preserva origem, reduz teto, recusa excesso apropriado e conserva replay", async () => {
  const f = await setup();
  try {
    const allocation = await allocateMunicipalCost(f.db, actor, { sourceId: f.source.id, date, reason: "Consumo distribuído", allocations: [{ objectId: f.object.id, itemId: f.item.id, amount: "70.00" }], idempotencyKey: "consumo-70" });
    const input = { sourceId: f.source.id, date, amount: new Prisma.Decimal("40.00"), reason: "Devolução parcial de material", idempotencyKey: "retorno-40", evidence: { movementId: "return-1" } };
    await assert.rejects(f.db.$transaction(tx => reduceMunicipalCostSource(tx, actor, input)), /apropriações excedentes/);
    assert.equal(await f.db.municipalCostSourceReduction.count(), 0);
    const reversal = await correctMunicipalCost(f.db, actor, { movementId: allocation.id, date, reason: "Liberar saldo devolvido", kind: "REVERSAL", idempotencyKey: "consumo-estornado" });
    const reduction = await f.db.$transaction(tx => reduceMunicipalCostSource(tx, actor, input));
    assert.equal((await f.db.$transaction(tx => reduceMunicipalCostSource(tx, actor, input))).id, reduction.id);
    await assert.rejects(f.db.$transaction(tx => reduceMunicipalCostSource(tx, actor, { ...input, amount: new Prisma.Decimal("41.00") })), /Chave/);
    assert.equal((await f.db.municipalCostSource.findUniqueOrThrow({ where: { id: f.source.id } })).amount.toFixed(2), "100.00");
    await assert.rejects(correctMunicipalCost(f.db, actor, { movementId: reversal.id, date, reason: "Restauração excessiva", kind: "RESTORATION", idempotencyKey: "restore-70" }), /teto/);
    await assert.rejects(allocateMunicipalCost(f.db, actor, { sourceId: f.source.id, date, reason: "Distribuição excessiva", allocations: [{ objectId: f.object.id, itemId: f.item.id, amount: "61.00" }], idempotencyKey: "excesso-61" }), /saldo/);
    const view = await readMunicipalCosts(f.db, actor, "ano");
    assert.equal(view.sources[0].amount, "100.00"); assert.equal(view.sources[0].netAmount, "60.00"); assert.equal(view.sources[0].pending, "60.00"); assert.equal(view.byType[0].expense, "60.00");
    await assert.rejects(f.db.municipalCostSourceReduction.update({ where: { id: reduction.id }, data: { amount: "1.00" } }));
    const report = await buildMunicipalCostReport(f.db, actor, { yearId: "ano", format: "CSV" });
    assert.ok(report.rows.some(row => row[0] === "DEVOLUÇÃO DA ORIGEM" && row[3] === "-40.00"));
  } finally { await f.close(); }
});

test("custos: devoluções concorrentes não ultrapassam origem e falha de evidência reverte redução", async () => {
  const f = await setup();
  try {
    const input = { sourceId: f.source.id, date, amount: new Prisma.Decimal("60.00"), reason: "Retorno", evidence: {} };
    const results = await Promise.allSettled([f.db.$transaction(tx => reduceMunicipalCostSource(tx, actor, { ...input, idempotencyKey: "return-A" })), f.db.$transaction(tx => reduceMunicipalCostSource(tx, actor, { ...input, idempotencyKey: "return-B" }))]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal((await readMunicipalCosts(f.db, actor, "ano")).sources[0].netAmount, "40.00");
    await f.pg.exec(`CREATE FUNCTION reject_cost_reduction_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."targetType"='MUNICIPAL_COST_SOURCE_REDUCTION' THEN RAISE EXCEPTION 'reduction evidence rollback'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_cost_reduction_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_cost_reduction_audit();`);
    await assert.rejects(f.db.$transaction(tx => reduceMunicipalCostSource(tx, actor, { ...input, amount: new Prisma.Decimal("10.00"), idempotencyKey: "return-audit-failure" })), /reduction evidence rollback/);
    assert.equal(await f.db.municipalCostSourceReduction.count(), 1);
    assert.equal((await readMunicipalCosts(f.db, actor, "ano")).sources[0].netAmount, "40.00");
  } finally { await f.close(); }
});
