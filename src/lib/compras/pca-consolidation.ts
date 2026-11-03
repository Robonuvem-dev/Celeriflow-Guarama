import Decimal from "decimal.js";

export type PcaDemand = {
  id: string;
  year: number;
  unitId: string | null;
  unitName: string | null;
  description: string;
  estimatedValue: string;
};

export function consolidatePca(demands: PcaDemand[], year: number, unit?: string) {
  const seen = new Set<string>();
  const groups = new Map<string, { name: string; total: Decimal; demands: PcaDemand[] }>();
  for (const demand of demands) {
    const key = demand.unitId ?? "";
    if (demand.year !== year || (unit !== undefined && unit !== key) || seen.has(demand.id)) continue;
    seen.add(demand.id);
    const group = groups.get(key) ?? { name: demand.unitName ?? "Sem unidade identificada", total: new Decimal(0), demands: [] };
    group.total = group.total.plus(demand.estimatedValue);
    group.demands.push(demand);
    groups.set(key, group);
  }
  return Array.from(groups, ([id, group]) => ({ id, ...group })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
