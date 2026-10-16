import type { PrismaClient } from "@prisma/client";
import { assertCostScope } from "./cost-ledger";
import type { CostActor } from "./cost-types";

export async function readStockCostOptions(db: PrismaClient, actor: CostActor, financialYearId: string) {
  return db.$transaction(async tx => {
    const year = await assertCostScope(tx, actor, financialYearId);
    const units = await tx.planningEntityUnit.findMany({ where: { governmentEntityId: year.governmentEntityId!, ...(actor.allowedBudgetUnitIds ? { budgetUnitId: { in: actor.allowedBudgetUnitIds } } : {}) }, select: { budgetUnitId: true, budgetUnit: { select: { secretariatId: true } } } });
    const secretariats = [...new Set(units.map(unit => unit.budgetUnit.secretariatId))];
    const [materials, categories, subcategories, centers, warehouses, departments] = await Promise.all([
      tx.material.findMany({ where: { isActive: true, type: "MATERIAL" }, select: { id: true, code: true, name: true, categoryId: true, subcategoryId: true }, orderBy: { name: "asc" } }),
      tx.materialCategory.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
      tx.materialSubcategory.findMany({ where: { isActive: true, category: { isActive: true } }, select: { id: true, categoryId: true, code: true, name: true }, orderBy: [{ categoryId: "asc" }, { code: "asc" }] }),
      tx.costCenter.findMany({ where: { isActive: true, governmentEntityId: year.governmentEntityId, secretariatId: { in: secretariats } }, select: { id: true, name: true, secretariatId: true }, orderBy: { name: "asc" } }),
      tx.warehouse.findMany({ where: { isActive: true, costCenter: { governmentEntityId: year.governmentEntityId, secretariatId: { in: secretariats } } }, select: { id: true, name: true, costCenterId: true, costCenter: { select: { secretariatId: true } } }, orderBy: { name: "asc" } }),
      tx.department.findMany({ where: { secretariatId: { in: secretariats } }, select: { id: true, name: true, secretariatId: true }, orderBy: { name: "asc" } }),
    ]);
    const unitIds = (secretariatId: string | null) => units.filter(unit => unit.budgetUnit.secretariatId === secretariatId).map(unit => unit.budgetUnitId);
    return { materials, categories, subcategories, centers: centers.map(center => ({ ...center, budgetUnitIds: unitIds(center.secretariatId) })), warehouses: warehouses.map(warehouse => ({ id: warehouse.id, name: warehouse.name, costCenterId: warehouse.costCenterId, budgetUnitIds: unitIds(warehouse.costCenter!.secretariatId) })), departments: departments.map(department => ({ ...department, budgetUnitIds: unitIds(department.secretariatId) })) };
  }, { isolationLevel: "RepeatableRead" });
}
