export type SimulationUnitDraft = { id: string; inscription: string; mode: string; area: string };

/** Complete GET payload, independent of the table's current page or mounted cells. */
export function simulationUnitEntries(units: SimulationUnitDraft[], selected: string[], areas: Record<string, string>): [string, string][] {
  return [
    ...units.filter(unit => selected.includes(unit.id)).map(unit => ["unitIds", unit.id] as [string, string]),
    ...units.map(unit => [`area.${unit.id}`, areas[unit.id] ?? ""] as [string, string]),
  ];
}

export function invalidSimulationArea(units: SimulationUnitDraft[], areas: Record<string, string>): SimulationUnitDraft | undefined {
  return units.find(unit => {
    const text = areas[unit.id] ?? "";
    if (!text) return false;
    const number = Number(text); const scaled = number * 1_000_000;
    return !Number.isFinite(number) || number < 0 || Math.abs(scaled - Math.round(scaled)) > 0.000001;
  });
}
