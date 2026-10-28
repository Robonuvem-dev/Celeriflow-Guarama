import assert from "node:assert/strict";
import test from "node:test";
import { createPlanningAccountingFixture } from "./helpers/planning-accounting-fixture";
import { configureMunicipalCosts, recordMunicipalCostSource, reduceMunicipalCostSource } from "../src/lib/financeiro/cost-ledger";
import { reduceStockMunicipalCosts } from "../src/lib/financeiro/cost-stock-bridge";
import { readMunicipalCosts } from "../src/lib/financeiro/cost-overview";
import { cancelSettlementMunicipalCosts } from "../src/lib/financeiro/cost-settlement-bridge";
import { connectFinanceDrizzleFixture } from "./helpers/finance-drizzle-connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { Decimal } from "../src/db/decimal";
import { materialMovements } from "../src/db/schema/assets-stock";
import { monthlyAccountingCloses } from "../src/db/schema/finance-accounting";
import { municipalCostSources, municipalCostSourceReductions } from "../src/db/schema/finance-costs";
import { financialYears } from "../src/db/schema/finance-years";
import { users, userBudgetUnits } from "../src/db/schema/identity";
import { and, asc, count, eq } from "drizzle-orm";

const actor = { usuarioId: "ana", allowedBudgetUnitIds: ["ug", "ug-restrita"] };
const date = new Date("2026-06-01T12:00:00Z");

test("materiais: devoluções sucessivas conservam os centavos do consumo e memória Decimal", async () => {
  const f = await createPlanningAccountingFixture();
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    transport = await connectFinanceDrizzleFixture(f.pg);
    const connection = transport.connection;
    const db = connection.db;
    await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await db.update(users).set({ ativo: true }).where(eq(users.id, actor.usuarioId));
    await db.insert(userBudgetUnits).values({ usuarioId: actor.usuarioId, budgetUnitId: "ug" });
    await configureMunicipalCosts(connection, actor, { financialYearId: "ano", enabled: true, sourceTypes: ["STOCK_CONSUMPTION"], effectiveFrom: new Date("2026-01-01"), reason: "Consumo conciliado da fixture" });
    const [original] = await db.insert(materialMovements).values({ id: "consumo", type: "Saída", operation: "REGULAR", warehouseId: "almoxarifado", materialId: "material", quantity: 3, quantityDecimal: new Decimal("3"), unitValue: 0.016667, unitValueDecimal: new Decimal("0.016667"), totalValueDecimal: new Decimal("0.05"), settlementId: "comprovacao", reason: "CONSUMO_ORCAMENTARIO:Consumo municipal", date }).returning();
    const source = await withDatabaseTransaction(connection, tx => recordMunicipalCostSource(tx, actor, { financialYearId: "ano", budgetUnitId: "ug", sourceType: "STOCK_CONSUMPTION", sourceId: original.id, expenseDate: date, amount: new Decimal("0.05"), dimensions: {}, evidence: { movementId: original.id, settlementId: original.settlementId } }));
    assert.ok(source);
    await assert.rejects(withDatabaseTransaction(connection, tx => cancelSettlementMunicipalCosts(tx, actor, "comprovacao")), /consumo.*material/);
    for (const n of [1, 2, 3]) await withDatabaseTransaction(connection, async tx => {
      const [correction] = await tx.insert(materialMovements).values({ id: `return-${n}`, type: "Entrada", operation: "RETURN", warehouseId: "almoxarifado", materialId: "material", quantity: 1, quantityDecimal: new Decimal("1"), unitValueDecimal: new Decimal("0.016667"), totalValueDecimal: new Decimal("0.02"), returnedMovementId: original.id, reason: "Retorno parcial", date }).returning();
      await reduceStockMunicipalCosts(tx, actor, original, correction);
    });
    const reductions = await db.select().from(municipalCostSourceReductions).orderBy(asc(municipalCostSourceReductions.idempotencyKey));
    assert.deepEqual(reductions.map(reduction => reduction.amount.toFixed(2)), ["0.02", "0.01", "0.02"]);
    const view = await readMunicipalCosts(transport.connection, actor, "ano");
    assert.equal(view.sources[0].amount, "0.05"); assert.equal(view.sources[0].netAmount, "0.00"); assert.equal(view.sources[0].pending, "0.00");
    assert.equal((await db.select().from(materialMovements).where(eq(materialMovements.id, original.id)))[0].quantityDecimal?.toFixed(6), "3.000000");
    await assert.rejects(withDatabaseTransaction(connection, async tx => {
      const [excess] = await tx.insert(materialMovements).values({ id: "excess", type: "Entrada", operation: "RETURN", warehouseId: "almoxarifado", materialId: "material", quantity: 1, quantityDecimal: new Decimal("1"), returnedMovementId: original.id, reason: "Excesso", date }).returning();
      await reduceStockMunicipalCosts(tx, actor, original, excess);
    }), /supera/);
    assert.equal((await db.select({ total: count() }).from(materialMovements).where(eq(materialMovements.id, "excess")))[0].total, 0);
    await withDatabaseTransaction(connection, tx => cancelSettlementMunicipalCosts(tx, actor, "comprovacao"));
    assert.equal((await db.select().from(municipalCostSources).where(eq(municipalCostSources.id, source.id)))[0].status, "CANCELLED");
  } finally { try { await transport?.close(); } finally { await f.close(); } }
});

test("materiais: devolução em exercício posterior conserva a origem encerrada e exige período corrente aberto do mesmo ente", async () => {
  const f = await createPlanningAccountingFixture();
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    transport = await connectFinanceDrizzleFixture(f.pg);
    const connection = transport.connection;
    const db = connection.db;
    await db.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, "ano"));
    await configureMunicipalCosts(connection, actor, { financialYearId: "ano", enabled: true, sourceTypes: ["STOCK_CONSUMPTION"], effectiveFrom: new Date("2026-01-01"), reason: "Reconhecimento do consumo original" });
    const source = await withDatabaseTransaction(connection, tx => recordMunicipalCostSource(tx, actor, { financialYearId: "ano", budgetUnitId: "ug", sourceType: "STOCK_CONSUMPTION", sourceId: "prior-year-consumption", expenseDate: date, amount: new Decimal("10.01"), dimensions: {}, evidence: { settlementId: "prior-settlement" } }));
    assert.ok(source);
    await db.update(financialYears).set({ status: "Encerrado" }).where(eq(financialYears.id, "ano"));
    const input = { sourceId: source.id, date: new Date("2027-02-01T12:00:00Z"), amount: new Decimal("3.34"), reason: "Devolução documental no exercício corrente", idempotencyKey: "cross-year-return", evidence: { originalMovementId: "prior-year-consumption" } };
    await assert.rejects(withDatabaseTransaction(connection, tx => reduceMunicipalCostSource(tx, actor, input)), /mesma entidade/);
    await db.insert(financialYears).values({ id: "ano-2027", governmentEntityId: "ente", year: 2027, status: "Aberto", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31T23:59:59.999Z") });
    await db.insert(monthlyAccountingCloses).values({ financialYearId: "ano-2027", competence: new Date("2027-02-01"), status: "ENCERRADO" });
    await assert.rejects(withDatabaseTransaction(connection, tx => reduceMunicipalCostSource(tx, actor, input)), /competencia contabil nao esta aberta/);
    await db.update(monthlyAccountingCloses).set({ status: "ABERTO" }).where(and(eq(monthlyAccountingCloses.financialYearId, "ano-2027"), eq(monthlyAccountingCloses.competence, new Date("2027-02-01"))));
    const reduction = await withDatabaseTransaction(connection, tx => reduceMunicipalCostSource(tx, actor, input));
    const memory = reduction.snapshot;
    assert.ok(memory && typeof memory === "object" && !Array.isArray(memory));
    assert.equal(memory.originFinancialYearId, "ano");
    assert.equal(memory.recognitionFinancialYearId, "ano-2027");
    const [original] = await db.select().from(municipalCostSources).where(eq(municipalCostSources.id, source.id));
    assert.ok(original);
    assert.equal(original.financialYearId, "ano");
    assert.equal(original.amount.toFixed(2), "10.01");
    const current = await readMunicipalCosts(transport.connection, actor, "ano-2027");
    assert.equal(current.sources.length, 0);
    assert.equal(current.priorYearCorrections.length, 1);
    assert.equal(current.priorYearCorrections[0].amount, "-3.34");
    assert.equal(current.priorYearCorrections[0].originFinancialYearId, "ano");
    await db.update(financialYears).set({ status: "Encerrado" }).where(eq(financialYears.id, "ano-2027"));
    assert.equal((await withDatabaseTransaction(connection, tx => reduceMunicipalCostSource(tx, actor, input))).id, reduction.id);
  } finally { try { await transport?.close(); } finally { await f.close(); } }
});
