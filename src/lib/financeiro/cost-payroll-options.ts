import type { PrismaClient } from "@prisma/client";
import { assertCostScope } from "./cost-ledger";
import type { CostActor } from "./cost-types";

export async function readPayrollCostOptions(db: PrismaClient, actor: CostActor, yearId: string) {
  return db.$transaction(async tx => {
    const year = await assertCostScope(tx, actor, yearId);
    const units = await tx.planningEntityUnit.findMany({ where: { governmentEntityId: year.governmentEntityId!, ...(actor.allowedBudgetUnitIds ? { budgetUnitId: { in: actor.allowedBudgetUnitIds } } : {}) }, include: { budgetUnit: true } });
    const centers = await tx.costCenter.findMany({ where: { governmentEntityId: year.governmentEntityId, secretariatId: { in: units.map(unit => unit.budgetUnit.secretariatId) }, isActive: true }, select: { id: true, name: true, secretariatId: true }, orderBy: { name: "asc" } });
    const contracts = await tx.hrEmploymentContract.findMany({ where: { costCenterId: { in: centers.map(center => center.id) } }, select: { id: true, employeeId: true, registration: true, workLocation: true, costCenterId: true, employee: { select: { name: true } } }, orderBy: { registration: "asc" } });
    const rubrics = await tx.hrPayrollRubric.findMany({ where: { type: "PROVENTO", isActive: true, ruleSet: { scope: "PRODUCAO", isDemo: false } }, select: { code: true, name: true }, orderBy: [{ code: "asc" }, { id: "asc" }] });
    return { centers: centers.map(center => ({ id: center.id, name: center.name, budgetUnitIds: units.filter(unit => unit.budgetUnit.secretariatId === center.secretariatId).map(unit => unit.budgetUnitId) })), contracts: contracts.map(contract => ({ id: contract.id, employeeId: contract.employeeId, name: `${contract.registration} — ${contract.employee.name}`, employeeName: contract.employee.name, workLocation: contract.workLocation, costCenterId: contract.costCenterId, budgetUnitIds: units.filter(unit => unit.budgetUnit.secretariatId === centers.find(center => center.id === contract.costCenterId)?.secretariatId).map(unit => unit.budgetUnitId) })), rubrics: [...new Map(rubrics.map(rubric => [rubric.code, rubric])).values()] };
  }, { isolationLevel: "RepeatableRead" });
}
