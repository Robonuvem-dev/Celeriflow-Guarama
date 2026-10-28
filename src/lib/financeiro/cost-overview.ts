import { Decimal } from "@/db/decimal";
import type { JsonObject } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import type { MunicipalCostFilters } from "@/lib/contracts/finance-costs";
import { readCostAuthorizedUnits, readCostOverviewRecords, readCostPriorCorrections } from "@/db/repositories/finance/cost-overview";
import { assertCostScope } from "./cost-ledger";
import type { CostActor } from "./cost-types";

export async function readMunicipalCosts(db: DatabaseConnection, actor: CostActor, financialYearId: string, filters: MunicipalCostFilters = {}) {
  return withDatabaseTransaction(db, async tx => {
    const year = await assertCostScope(tx, actor, financialYearId);
    const units = await readCostAuthorizedUnits(tx, year.governmentEntityId!, actor.allowedBudgetUnitIds);
    const unitIds = units.map(unit => unit.budgetUnitId);
    const yearStart = new Date(Date.UTC(year.year, 0, 1)), yearEnd = new Date(Date.UTC(year.year + 1, 0, 1) - 1);
    const correctionPeriod = { gte: filters.appropriationFrom && filters.appropriationFrom > yearStart ? filters.appropriationFrom : yearStart, lte: filters.appropriationUntil && filters.appropriationUntil < yearEnd ? filters.appropriationUntil : yearEnd };
    const { priorReductions, priorMovements } = await readCostPriorCorrections(tx, financialYearId, year.governmentEntityId!, unitIds, correctionPeriod, filters);
    const priorYearCorrections = [
      ...priorReductions.map(row => ({ id: row.id, kind: "SOURCE_REDUCTION", originFinancialYearId: row.source.financialYearId, recognitionFinancialYearId: financialYearId, sourceType: row.source.sourceType, sourceId: row.source.sourceId, budgetUnitId: row.source.budgetUnitId, expenseDate: row.source.expenseDate.toISOString(), date: row.date.toISOString(), amount: row.amount.negated().toFixed(2), reason: row.reason })),
      ...priorMovements.filter(row => row.allocations.length > 0).map(row => ({ id: row.id, kind: row.kind, originFinancialYearId: row.source.financialYearId, recognitionFinancialYearId: financialYearId, sourceType: row.source.sourceType, sourceId: row.source.sourceId, budgetUnitId: row.source.budgetUnitId, expenseDate: row.source.expenseDate.toISOString(), date: row.date.toISOString(), amount: row.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0)).toFixed(2), reason: row.reason })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const { objects, items, rules, sources, policies } = await readCostOverviewRecords(tx, financialYearId, year.governmentEntityId!, unitIds, filters);
    const byObject = new Map<string, Decimal>();
    const byItem = new Map<string, Decimal>();
    const byType = new Map<string, { expense: Decimal; allocated: Decimal; pending: Decimal }>();
    const rows = sources.map(source => {
      const snapshot = source.snapshot as JsonObject;
      const evidence = snapshot.evidence && typeof snapshot.evidence === "object" && !Array.isArray(snapshot.evidence) ? snapshot.evidence : {};
      const settlementId = typeof evidence.settlementId === "string" ? evidence.settlementId : null;
      const allocated = source.movements.flatMap(movement => movement.allocations).reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0));
      let inPeriod = new Decimal(0);
      for (const movement of source.movements) {
        if ((filters.appropriationFrom && movement.date < filters.appropriationFrom) || (filters.appropriationUntil && movement.date > filters.appropriationUntil)) continue;
        for (const allocation of movement.allocations) {
          if (filters.itemId && allocation.itemId !== filters.itemId) continue;
          inPeriod = inPeriod.plus(allocation.amount);
          byObject.set(allocation.objectId, (byObject.get(allocation.objectId) ?? new Decimal(0)).plus(allocation.amount));
          byItem.set(allocation.itemId, (byItem.get(allocation.itemId) ?? new Decimal(0)).plus(allocation.amount));
        }
      }
      const reduced = source.reductions.reduce((sum, reduction) => sum.plus(reduction.amount), new Decimal(0));
      const netAmount = source.amount.minus(reduced);
      const pending = source.status === "ACTIVE" ? netAmount.minus(allocated) : new Decimal(0);
      const group = byType.get(source.sourceType) ?? { expense: new Decimal(0), allocated: new Decimal(0), pending: new Decimal(0) };
      if (source.status === "ACTIVE") group.expense = group.expense.plus(netAmount);
      group.allocated = group.allocated.plus(inPeriod); group.pending = group.pending.plus(pending); byType.set(source.sourceType, group);
      return { id: source.id, budgetUnitId: source.budgetUnitId, sourceType: source.sourceType, sourceId: source.sourceId, settlementId, expenseDate: source.expenseDate.toISOString(), amount: source.amount.toFixed(2), reduced: reduced.toFixed(2), netAmount: netAmount.toFixed(2), reductions: source.reductions.map(reduction => ({ id: reduction.id, date: reduction.date.toISOString(), amount: reduction.amount.toFixed(2), reason: reduction.reason, snapshot: reduction.snapshot })), allocated: allocated.toFixed(2), inPeriod: inPeriod.toFixed(2), pending: pending.toFixed(2), status: source.status, movements: source.movements.map(movement => ({ id: movement.id, kind: movement.kind, date: movement.date.toISOString(), reason: movement.reason, correctionId: movement.correction?.id ?? null, amount: movement.allocations.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)).toFixed(2) })) };
    });
    return { year: { id: year.id, year: year.year, governmentEntityId: year.governmentEntityId! }, units: units.map(unit => ({ id: unit.budgetUnitId, name: unit.budgetUnit.name })), objects, items, rules, policies, sources: rows, priorYearCorrections, byObject: [...byObject].map(([id, value]) => ({ id, label: objects.find(object => object.id === id)?.description ?? id, value: value.toFixed(2) })), byItem: [...byItem].map(([id, value]) => ({ id, label: items.find(item => item.id === id)?.description ?? id, value: value.toFixed(2) })), byType: [...byType].map(([type, values]) => ({ type, expense: values.expense.toFixed(2), allocated: values.allocated.toFixed(2), pending: values.pending.toFixed(2) })) };
  }, { isolationLevel: "repeatable read" });
}
