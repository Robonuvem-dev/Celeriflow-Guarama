import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { listCostOptionUnits, listCostOptionMaterials, listCostOptionCategories, listCostOptionSubcategories, listCostOptionCenters, listCostOptionWarehouses, listCostOptionDepartments } from "@/db/repositories/finance/cost-options";
import { assertCostScope } from "./cost-ledger";
import type { CostActor } from "./cost-types";

export async function readStockCostOptions(db: DatabaseConnection, actor: CostActor, financialYearId: string) {
  return withDatabaseTransaction(db, async tx => {
    const year = await assertCostScope(tx, actor, financialYearId);
    const units = await listCostOptionUnits(tx, year.governmentEntityId!, actor.allowedBudgetUnitIds);
    const secretariats = [...new Set(units.map(unit => unit.budgetUnit.secretariatId))];
    const [materials, categories, subcategories, centers, warehouses, departments] = await Promise.all([
      listCostOptionMaterials(tx),
      listCostOptionCategories(tx),
      listCostOptionSubcategories(tx),
      listCostOptionCenters(tx, year.governmentEntityId!, secretariats),
      listCostOptionWarehouses(tx, year.governmentEntityId!, secretariats),
      listCostOptionDepartments(tx, secretariats),
    ]);
    const unitIds = (secretariatId: string | null) => units.filter(unit => unit.budgetUnit.secretariatId === secretariatId).map(unit => unit.budgetUnitId);
    return { materials, categories, subcategories, centers: centers.map(center => ({ ...center, budgetUnitIds: unitIds(center.secretariatId) })), warehouses: warehouses.map(warehouse => ({ id: warehouse.id, name: warehouse.name, costCenterId: warehouse.costCenterId, budgetUnitIds: unitIds(warehouse.costCenter!.secretariatId) })), departments: departments.map(department => ({ ...department, budgetUnitIds: unitIds(department.secretariatId) })) };
  }, { isolationLevel: "repeatable read" });
}
