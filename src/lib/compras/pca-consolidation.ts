import Decimal from "decimal.js";

export type PcaDemand = {
  id: string;
  year: number;
  unitId: string | null;
  unitName: string | null;
  objectiveId?: string | null;
  description: string;
  estimatedValue: string;
};

export function consolidatePca(demands: PcaDemand[], year: number, unit?: string, objective?: string) {
  const seen = new Set<string>();
  const groups = new Map<string, { name: string; total: Decimal; demands: PcaDemand[] }>();
  for (const demand of demands) {
    const key = demand.unitId ?? "";
    if (demand.year !== year || (unit !== undefined && unit !== key) || (objective !== undefined && demand.objectiveId !== objective) || seen.has(demand.id)) continue;
    seen.add(demand.id);
    const group = groups.get(key) ?? { name: demand.unitName ?? "Sem unidade identificada", total: new Decimal(0), demands: [] };
    group.total = group.total.plus(demand.estimatedValue);
    group.demands.push(demand);
    groups.set(key, group);
  }
  return Array.from(groups, ([id, group]) => ({ id, ...group })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export type PcaBudgetRow = {
  itemId: string;
  quantity: number;
  estimatedUnitValue: number | null;
  allocationId: string | null;
  appropriationId: string | null;
  code: string | null;
  allocatedQuantity: number | null;
  allocatedValue: Decimal.Value | null;
};

export function summarizePcaBudget(rows: PcaBudgetRow[]) {
  const items = new Map<string, { quantity: number; expected: Decimal; allocatedQuantity: Decimal; allocatedValue: Decimal }>();
  const appropriations = new Map<string, { code: string; amount: Decimal }>();
  const seen = new Set<string>();
  for (const row of rows) {
    const item = items.get(row.itemId) ?? {
      quantity: row.quantity,
      expected: new Decimal(row.quantity).mul(row.estimatedUnitValue ?? 0).toDecimalPlaces(2),
      allocatedQuantity: new Decimal(0),
      allocatedValue: new Decimal(0),
    };
    items.set(row.itemId, item);
    if (!row.allocationId || !row.appropriationId || seen.has(row.allocationId)) continue;
    seen.add(row.allocationId);
    const value = new Decimal(row.allocatedValue ?? 0);
    item.allocatedValue = item.allocatedValue.plus(value);
    item.allocatedQuantity = item.allocatedQuantity.plus(row.allocatedQuantity ?? 0);
    const appropriation = appropriations.get(row.appropriationId) ?? { code: row.code ?? row.appropriationId, amount: new Decimal(0) };
    appropriation.amount = appropriation.amount.plus(value);
    appropriations.set(row.appropriationId, appropriation);
  }
  const complete = [...items.values()].every(item => item.allocatedQuantity.eq(item.quantity) && item.allocatedValue.eq(item.expected));
  return {
    status: !seen.size ? "Ausente" : complete ? "Completa" : "Parcial ou divergente",
    appropriations: [...appropriations.values()].sort((a, b) => a.code.localeCompare(b.code, "pt-BR", { numeric: true })),
  };
}
