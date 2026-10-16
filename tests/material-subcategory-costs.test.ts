import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { createCommitment, createSettlement } from "../src/lib/financeiro";
import { createMunicipalCostObject, saveMunicipalCostItem, linkMunicipalCostItems, createMunicipalCostRule } from "../src/lib/financeiro/cost-catalog";
import { configureMunicipalCosts } from "../src/lib/financeiro/cost-ledger";
import { applyStockMovement } from "../src/lib/patrimonio/stock-service";

test("P6: consumo congela subclasse canônica, seleciona regra e recusa classe/produto incompatíveis", async () => {
  const mode = process.env.CELERIFLOW_ACCOUNTING_MODE;
  process.env.CELERIFLOW_ACCOUNTING_MODE = "POC";
  const f = await createPlanningExecutionFixture(2026, 2, "EXECUTIVE", { expenseLineAmount: "600.00" });
  try {
    await f.db.usuario.update({ where: { id: "ana" }, data: { ativo: true } });
    await f.pg.exec('ALTER TABLE "Material" DROP COLUMN "subcategoryId"; DROP TABLE "MaterialSubcategory";');
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261014130000_material_subcategories/migration.sql", "utf8"));
    await f.db.financialYear.update({ where: { id: "ano" }, data: { status: "Aberto" } });
    const appropriation = await f.db.budgetAppropriation.findUniqueOrThrow({ where: { id: f.appropriationId } });
    await f.db.expenseNature.update({ where: { id: appropriation.expenseNatureId }, data: { code: "3.3.90.30" } });
    await f.db.usuarioUnidadeGestora.create({ data: { usuarioId: "ana", budgetUnitId: "ug" } });
    await f.db.costCenter.create({ data: { id: "subclass-center", code: "SUBCLASS", name: "Centro de consumo", governmentEntityId: "ente", secretariatId: "secretaria" } });
    await f.db.warehouse.create({ data: { id: "subclass-warehouse", name: "Almoxarifado", costCenterId: "subclass-center" } });
    await f.db.materialCategory.createMany({ data: [{ id: "class-1", code: "C1", name: "Classe 1" }, { id: "class-2", code: "C2", name: "Classe 2" }] });
    await f.db.materialSubcategory.create({ data: { id: "subclass-1", categoryId: "class-1", code: "S1", name: "Subclasse original" } });
    await f.db.material.create({ data: { id: "subclass-material", code: "MAT-SUB", name: "Material", categoryId: "class-1", subcategoryId: "subclass-1" } });
    await f.db.materialStock.create({ data: { warehouseId: "subclass-warehouse", materialId: "subclass-material", quantity: 10, unitCost: 2 } });
    const date = new Date("2026-09-01T12:00:00Z");
    const reservation = await f.reserve("subclass-res", "20.00", date);
    const commitment = await createCommitment(f.db, f.financeReviewer, { date, number: "SUBCLASS-EMP", value: "20.00", type: "Ordinário", history: "Aquisição de material", appropriationId: f.appropriationId, supplierId: "fornecedor", reservationId: reservation.id });
    const settlement = await createSettlement(f.db, f.financeReviewer, { date, value: "20.00", commitmentId: commitment.id, documentId: "documento-fiscal", documentRef: "Material recebido", authorId: "servidora-ana" });
    const object = await createMunicipalCostObject(f.db, f.actor, { financialYearId: "ano", budgetUnitId: "ug", description: "Serviços", detailedDescription: "Serviços municipais" });
    const costActor = { ...f.actor, allowedBudgetUnitIds: ["ug", "ug-restrita"] };
    const item = await saveMunicipalCostItem(f.db, costActor, { financialYearId: "ano", identifier: "MATERIAL-SUB", description: "Material", detailedDescription: "Material por subclasse", identificationClass: "TEXTO", behavior: "VARIABLE", isActive: true });
    await linkMunicipalCostItems(f.db, f.actor, { objectIds: [object.id], itemIds: [item.id] });
    const rule = { financialYearId: "ano", budgetUnitId: "ug", title: "Consumo por subclasse", sourceType: "STOCK_CONSUMPTION" as const, selector: { subcategoryId: "subclass-1" }, shares: [{ objectId: object.id, itemId: item.id, percentage: "100" }], priority: 1, effectiveFrom: new Date("2026-01-01") };
    await assert.rejects(createMunicipalCostRule(f.db, f.actor, { ...rule, selector: { subcategoryId: "subclass-1", categoryId: "class-2" } }), /Subclasse/);
    await createMunicipalCostRule(f.db, f.actor, rule);
    await configureMunicipalCosts(f.db, costActor, { financialYearId: "ano", enabled: true, sourceTypes: ["STOCK_CONSUMPTION"], effectiveFrom: new Date("2026-01-01"), reason: "Apropriação de consumo por subclasse" });
    const result = await f.db.$transaction(tx => applyStockMovement(tx, { kind: "EXIT", warehouseId: "subclass-warehouse", materialId: "subclass-material", quantity: 2, settlementId: settlement.id, reason: "CONSUMO_ORCAMENTARIO:Consumo municipal", actor: f.actor }));
    const source = await f.db.municipalCostSource.findUniqueOrThrow({ where: { sourceType_sourceId: { sourceType: "STOCK_CONSUMPTION", sourceId: result.movement.id } }, include: { movements: true } });
    assert.equal(source.amount.toFixed(2), "4.00");
    assert.equal(source.movements.length, 1);
    const memory = source.snapshot as Prisma.JsonObject;
    assert.equal((memory.dimensions as Prisma.JsonObject).subcategoryId, "subclass-1");
    assert.equal(((memory.evidence as Prisma.JsonObject).materialSubcategory as Prisma.JsonObject).name, "Subclasse original");
    await f.db.materialSubcategory.update({ where: { id: "subclass-1" }, data: { name: "Nome atual", isActive: false } });
    assert.deepEqual((await f.db.municipalCostSource.findUniqueOrThrow({ where: { id: source.id } })).snapshot, source.snapshot);
    await assert.rejects(createMunicipalCostRule(f.db, f.actor, rule), /Subclasse/);
  } finally {
    await f.close();
    if (mode === undefined) delete process.env.CELERIFLOW_ACCOUNTING_MODE; else process.env.CELERIFLOW_ACCOUNTING_MODE = mode;
  }
});
