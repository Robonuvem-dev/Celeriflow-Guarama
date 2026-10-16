import { Prisma, type PrismaClient } from "@prisma/client";
import { assertCostScope } from "./cost-ledger";
import type { CostActor } from "./cost-types";

export async function readMunicipalCosts(db: PrismaClient, actor: CostActor, financialYearId: string, filters: { expenseFrom?: Date; expenseUntil?: Date; appropriationFrom?: Date; appropriationUntil?: Date; sourceType?: string; itemId?: string } = {}) {
  return db.$transaction(async tx => {
    const year = await assertCostScope(tx, actor, financialYearId);
    const units = await tx.planningEntityUnit.findMany({ where: { governmentEntityId: year.governmentEntityId!, ...(actor.allowedBudgetUnitIds ? { budgetUnitId: { in: actor.allowedBudgetUnitIds } } : {}) }, include: { budgetUnit: true } });
    const unitIds = units.map(unit => unit.budgetUnitId);
    const yearStart = new Date(Date.UTC(year.year, 0, 1)), yearEnd = new Date(Date.UTC(year.year + 1, 0, 1) - 1);
    const correctionPeriod = { gte: filters.appropriationFrom && filters.appropriationFrom > yearStart ? filters.appropriationFrom : yearStart, lte: filters.appropriationUntil && filters.appropriationUntil < yearEnd ? filters.appropriationUntil : yearEnd };
    const historicalSource = { financialYearId: { not: financialYearId }, financialYear: { governmentEntityId: year.governmentEntityId! }, budgetUnitId: { in: unitIds }, ...(filters.sourceType ? { sourceType: filters.sourceType } : {}), ...(filters.expenseFrom || filters.expenseUntil ? { expenseDate: { gte: filters.expenseFrom, lte: filters.expenseUntil } } : {}) };
    const [priorReductions, priorMovements] = await Promise.all([
      tx.municipalCostSourceReduction.findMany({ where: { date: correctionPeriod, source: historicalSource }, include: { source: { select: { financialYearId: true, sourceType: true, sourceId: true, expenseDate: true, budgetUnitId: true } } }, orderBy: [{ date: "asc" }, { id: "asc" }] }),
      tx.municipalCostMovement.findMany({ where: { date: correctionPeriod, kind: { in: ["REVERSAL", "RESTORATION"] }, source: historicalSource }, include: { allocations: { ...(filters.itemId ? { where: { itemId: filters.itemId } } : {}) }, source: { select: { financialYearId: true, sourceType: true, sourceId: true, expenseDate: true, budgetUnitId: true } } }, orderBy: [{ date: "asc" }, { id: "asc" }] }),
    ]);
    const priorYearCorrections = [
      ...priorReductions.map(row => ({ id: row.id, kind: "SOURCE_REDUCTION", originFinancialYearId: row.source.financialYearId, recognitionFinancialYearId: financialYearId, sourceType: row.source.sourceType, sourceId: row.source.sourceId, budgetUnitId: row.source.budgetUnitId, expenseDate: row.source.expenseDate.toISOString(), date: row.date.toISOString(), amount: row.amount.negated().toFixed(2), reason: row.reason })),
      ...priorMovements.filter(row => row.allocations.length > 0).map(row => ({ id: row.id, kind: row.kind, originFinancialYearId: row.source.financialYearId, recognitionFinancialYearId: financialYearId, sourceType: row.source.sourceType, sourceId: row.source.sourceId, budgetUnitId: row.source.budgetUnitId, expenseDate: row.source.expenseDate.toISOString(), date: row.date.toISOString(), amount: row.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0)).toFixed(2), reason: row.reason })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const [objects, items, rules, sources, policies] = await Promise.all([
      tx.municipalCostObject.findMany({ where: { financialYearId, OR: [{ budgetUnitId: null }, { budgetUnitId: { in: unitIds } }] }, include: { links: true }, orderBy: { code: "asc" } }),
      tx.municipalCostItem.findMany({ where: { financialYearId }, orderBy: { identifier: "asc" } }),
      tx.municipalCostRule.findMany({ where: { financialYearId, budgetUnitId: { in: unitIds } }, orderBy: [{ priority: "desc" }, { createdAt: "desc" }] }),
      tx.municipalCostSource.findMany({ where: { financialYearId, budgetUnitId: { in: unitIds }, ...(filters.sourceType ? { sourceType: filters.sourceType } : {}), ...(filters.expenseFrom || filters.expenseUntil ? { expenseDate: { gte: filters.expenseFrom, lte: filters.expenseUntil } } : {}) }, include: { reductions: { orderBy: [{ date: "asc" }, { id: "asc" }] }, movements: { include: { allocations: true, correction: { select: { id: true } } }, orderBy: [{ date: "asc" }, { id: "asc" }] } }, orderBy: [{ expenseDate: "desc" }, { id: "asc" }] }),
      tx.municipalCostPolicy.findMany({ where: { governmentEntityId: year.governmentEntityId! }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }] }),
    ]);
    const byObject = new Map<string, Prisma.Decimal>();
    const byItem = new Map<string, Prisma.Decimal>();
    const byType = new Map<string, { expense: Prisma.Decimal; allocated: Prisma.Decimal; pending: Prisma.Decimal }>();
    const rows = sources.map(source => {
      const snapshot = source.snapshot as Prisma.JsonObject;
      const evidence = snapshot.evidence && typeof snapshot.evidence === "object" && !Array.isArray(snapshot.evidence) ? snapshot.evidence : {};
      const settlementId = typeof evidence.settlementId === "string" ? evidence.settlementId : null;
      const allocated = source.movements.flatMap(movement => movement.allocations).reduce((sum, allocation) => sum.plus(allocation.amount), new Prisma.Decimal(0));
      let inPeriod = new Prisma.Decimal(0);
      for (const movement of source.movements) {
        if ((filters.appropriationFrom && movement.date < filters.appropriationFrom) || (filters.appropriationUntil && movement.date > filters.appropriationUntil)) continue;
        for (const allocation of movement.allocations) {
          if (filters.itemId && allocation.itemId !== filters.itemId) continue;
          inPeriod = inPeriod.plus(allocation.amount);
          byObject.set(allocation.objectId, (byObject.get(allocation.objectId) ?? new Prisma.Decimal(0)).plus(allocation.amount));
          byItem.set(allocation.itemId, (byItem.get(allocation.itemId) ?? new Prisma.Decimal(0)).plus(allocation.amount));
        }
      }
      const reduced = source.reductions.reduce((sum, reduction) => sum.plus(reduction.amount), new Prisma.Decimal(0));
      const netAmount = source.amount.minus(reduced);
      const pending = source.status === "ACTIVE" ? netAmount.minus(allocated) : new Prisma.Decimal(0);
      const group = byType.get(source.sourceType) ?? { expense: new Prisma.Decimal(0), allocated: new Prisma.Decimal(0), pending: new Prisma.Decimal(0) };
      if (source.status === "ACTIVE") group.expense = group.expense.plus(netAmount);
      group.allocated = group.allocated.plus(inPeriod); group.pending = group.pending.plus(pending); byType.set(source.sourceType, group);
      return { id: source.id, budgetUnitId: source.budgetUnitId, sourceType: source.sourceType, sourceId: source.sourceId, settlementId, expenseDate: source.expenseDate.toISOString(), amount: source.amount.toFixed(2), reduced: reduced.toFixed(2), netAmount: netAmount.toFixed(2), reductions: source.reductions.map(reduction => ({ id: reduction.id, date: reduction.date.toISOString(), amount: reduction.amount.toFixed(2), reason: reduction.reason, snapshot: reduction.snapshot })), allocated: allocated.toFixed(2), inPeriod: inPeriod.toFixed(2), pending: pending.toFixed(2), status: source.status, movements: source.movements.map(movement => ({ id: movement.id, kind: movement.kind, date: movement.date.toISOString(), reason: movement.reason, correctionId: movement.correction?.id ?? null, amount: movement.allocations.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)).toFixed(2) })) };
    });
    return { year: { id: year.id, year: year.year, governmentEntityId: year.governmentEntityId! }, units: units.map(unit => ({ id: unit.budgetUnitId, name: unit.budgetUnit.name })), objects, items, rules, policies, sources: rows, priorYearCorrections, byObject: [...byObject].map(([id, value]) => ({ id, label: objects.find(object => object.id === id)?.description ?? id, value: value.toFixed(2) })), byItem: [...byItem].map(([id, value]) => ({ id, label: items.find(item => item.id === id)?.description ?? id, value: value.toFixed(2) })), byType: [...byType].map(([type, values]) => ({ type, expense: values.expense.toFixed(2), allocated: values.allocated.toFixed(2), pending: values.pending.toFixed(2) })) };
  }, { isolationLevel: "RepeatableRead" });
}
