import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { configureMunicipalCosts, recordMunicipalCostSource, reduceMunicipalCostSource } from "../src/lib/financeiro/cost-ledger";
import { reduceStockMunicipalCosts } from "../src/lib/financeiro/cost-stock-bridge";
import { readMunicipalCosts } from "../src/lib/financeiro/cost-overview";
import { cancelSettlementMunicipalCosts } from "../src/lib/financeiro/cost-settlement-bridge";

const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug", "ug-restrita"] };
const date = new Date("2026-06-01T12:00:00Z");

test("materiais: devoluções sucessivas conservam os centavos do consumo e memória Decimal", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    await f.db.usuario.update({ where: { id: actor.usuarioId }, data: { ativo: true } });
    await f.db.usuarioUnidadeGestora.create({ data: { usuarioId: actor.usuarioId, budgetUnitId: "ug" } });
    await configureMunicipalCosts(f.db, actor, { financialYearId: "ano", enabled: true, sourceTypes: ["STOCK_CONSUMPTION"], effectiveFrom: new Date("2026-01-01"), reason: "Consumo conciliado da fixture" });
    const original = await f.db.materialMovement.create({ data: { id: "consumo", type: "Saída", operation: "REGULAR", warehouseId: "almoxarifado", materialId: "material", quantity: 3, quantityDecimal: "3", unitValue: 0.016667, unitValueDecimal: "0.016667", totalValueDecimal: "0.05", settlementId: "comprovacao", reason: "CONSUMO_ORCAMENTARIO:Consumo municipal", date } });
    const source = await f.db.$transaction(tx => recordMunicipalCostSource(tx, actor, { financialYearId: "ano", budgetUnitId: "ug", sourceType: "STOCK_CONSUMPTION", sourceId: original.id, expenseDate: date, amount: new Prisma.Decimal("0.05"), dimensions: {}, evidence: { movementId: original.id, settlementId: original.settlementId } }));
    assert.ok(source);
    await assert.rejects(f.db.$transaction(tx => cancelSettlementMunicipalCosts(tx, actor, "comprovacao")), /consumo.*material/);
    for (const n of [1, 2, 3]) await f.db.$transaction(async tx => {
      const correction = await tx.materialMovement.create({ data: { id: `return-${n}`, type: "Entrada", operation: "RETURN", warehouseId: "almoxarifado", materialId: "material", quantity: 1, quantityDecimal: "1", unitValueDecimal: "0.016667", totalValueDecimal: "0.02", returnedMovementId: original.id, reason: "Retorno parcial", date } });
      await reduceStockMunicipalCosts(tx, actor, original, correction);
    });
    const reductions = await f.db.municipalCostSourceReduction.findMany({ orderBy: { idempotencyKey: "asc" } });
    assert.deepEqual(reductions.map(reduction => reduction.amount.toFixed(2)), ["0.02", "0.01", "0.02"]);
    const view = await readMunicipalCosts(f.db, actor, "ano");
    assert.equal(view.sources[0].amount, "0.05"); assert.equal(view.sources[0].netAmount, "0.00"); assert.equal(view.sources[0].pending, "0.00");
    assert.equal((await f.db.materialMovement.findUniqueOrThrow({ where: { id: original.id } })).quantityDecimal?.toFixed(6), "3.000000");
    await assert.rejects(f.db.$transaction(async tx => {
      const excess = await tx.materialMovement.create({ data: { id: "excess", type: "Entrada", operation: "RETURN", warehouseId: "almoxarifado", materialId: "material", quantity: 1, quantityDecimal: "1", returnedMovementId: original.id, reason: "Excesso", date } });
      await reduceStockMunicipalCosts(tx, actor, original, excess);
    }), /supera/);
    assert.equal(await f.db.materialMovement.count({ where: { id: "excess" } }), 0);
    await f.db.$transaction(tx => cancelSettlementMunicipalCosts(tx, actor, "comprovacao"));
    assert.equal((await f.db.municipalCostSource.findUniqueOrThrow({ where: { id: source.id } })).status, "CANCELLED");
  } finally { await f.close(); }
});

test("materiais: devolução em exercício posterior conserva a origem encerrada e exige período corrente aberto do mesmo ente", async () => {
  const f = await createPlanningAccountingFixture();
  try {
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    await configureMunicipalCosts(f.db, actor, { financialYearId: "ano", enabled: true, sourceTypes: ["STOCK_CONSUMPTION"], effectiveFrom: new Date("2026-01-01"), reason: "Reconhecimento do consumo original" });
    const source = await f.db.$transaction(tx => recordMunicipalCostSource(tx, actor, { financialYearId: "ano", budgetUnitId: "ug", sourceType: "STOCK_CONSUMPTION", sourceId: "prior-year-consumption", expenseDate: date, amount: new Prisma.Decimal("10.01"), dimensions: {}, evidence: { settlementId: "prior-settlement" } }));
    assert.ok(source);
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Encerrado" } });
    const input = { sourceId: source.id, date: new Date("2027-02-01T12:00:00Z"), amount: new Prisma.Decimal("3.34"), reason: "Devolução documental no exercício corrente", idempotencyKey: "cross-year-return", evidence: { originalMovementId: "prior-year-consumption" } };
    await assert.rejects(f.db.$transaction(tx => reduceMunicipalCostSource(tx, actor, input)), /mesma entidade/);
    await f.db.financialYear.create({ data: { id: "ano-2027", governmentEntityId: "ente", year: 2027, status: "Aberto", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31T23:59:59.999Z") } });
    await f.db.monthlyAccountingClose.create({ data: { financialYearId: "ano-2027", competence: new Date("2027-02-01"), status: "ENCERRADO" } });
    await assert.rejects(f.db.$transaction(tx => reduceMunicipalCostSource(tx, actor, input)), /competencia contabil nao esta aberta/);
    await f.db.monthlyAccountingClose.update({ where: { financialYearId_competence: { financialYearId: "ano-2027", competence: new Date("2027-02-01") } }, data: { status: "ABERTO" } });
    const reduction = await f.db.$transaction(tx => reduceMunicipalCostSource(tx, actor, input));
    const memory = reduction.snapshot as Prisma.JsonObject;
    assert.equal(memory.originFinancialYearId, "ano");
    assert.equal(memory.recognitionFinancialYearId, "ano-2027");
    const original = await f.db.municipalCostSource.findUniqueOrThrow({ where: { id: source.id } });
    assert.equal(original.financialYearId, "ano");
    assert.equal(original.amount.toFixed(2), "10.01");
    const current = await readMunicipalCosts(f.db, actor, "ano-2027");
    assert.equal(current.sources.length, 0);
    assert.equal(current.priorYearCorrections.length, 1);
    assert.equal(current.priorYearCorrections[0].amount, "-3.34");
    assert.equal(current.priorYearCorrections[0].originFinancialYearId, "ano");
    await f.db.financialYear.update({ where: { id: "ano-2027" }, data: { status: "Encerrado" } });
    assert.equal((await f.db.$transaction(tx => reduceMunicipalCostSource(tx, actor, input))).id, reduction.id);
  } finally { await f.close(); }
});
