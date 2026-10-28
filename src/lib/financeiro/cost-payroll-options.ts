import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { listCostOptionCenters, listCostOptionContracts, listCostOptionRubrics, listCostOptionUnits } from "@/db/repositories/finance/cost-options";
import { assertCostScope } from "./cost-ledger";
import type { CostActor } from "./cost-types";

export async function readPayrollCostOptions(db: DatabaseConnection, actor: CostActor, yearId: string) {
  return withDatabaseTransaction(db, async tx => {
    const year = await assertCostScope(tx, actor, yearId);
    const units = await listCostOptionUnits(tx, year.governmentEntityId!, actor.allowedBudgetUnitIds);
    const centers = await listCostOptionCenters(tx, year.governmentEntityId!, units.map(unit => unit.budgetUnit.secretariatId));
    const contracts = await listCostOptionContracts(tx, centers.map(center => center.id));
    const rubrics = await listCostOptionRubrics(tx);
    return { centers: centers.map(center => ({ id: center.id, name: center.name, budgetUnitIds: units.filter(unit => unit.budgetUnit.secretariatId === center.secretariatId).map(unit => unit.budgetUnitId) })), contracts: contracts.map(contract => ({ id: contract.id, employeeId: contract.employeeId, name: `${contract.registration} — ${contract.employee.name}`, employeeName: contract.employee.name, workLocation: contract.workLocation, costCenterId: contract.costCenterId, budgetUnitIds: units.filter(unit => unit.budgetUnit.secretariatId === centers.find(center => center.id === contract.costCenterId)?.secretariatId).map(unit => unit.budgetUnitId) })), rubrics: [...new Map(rubrics.map(rubric => [rubric.code, rubric])).values()] };
  }, { isolationLevel: "repeatable read" });
}
