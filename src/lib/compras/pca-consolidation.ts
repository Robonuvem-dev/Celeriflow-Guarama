import Decimal from "decimal.js";

export type PcaDemand = {
  id: string;
  year: number;
  unitId: string | null;
  unitName: string | null;
  objectiveId?: string | null;
  catalogItemId?: string | null;
  unit?: string | null;
  quantity?: number | null;
  status?: string | null;
  expectedPeriodStart?: string | null;
  expectedPeriodEnd?: string | null;
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

export type CollectivePurchaseUnitSummary = {
  unitId: string;
  unitName: string;
  demandCount: number;
  quantity: Decimal;
  estimatedValue: Decimal;
};

export type CollectivePurchaseOpportunity = {
  key: string;
  label: string;
  unit: string;
  totalQuantity: Decimal;
  totalEstimatedValue: Decimal;
  unitCount: number;
  demandCount: number;
  units: CollectivePurchaseUnitSummary[];
  demandIds: string[];
};

function normalizeItemKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function identifyCollectivePurchaseOpportunities(
  demands: PcaDemand[],
  year: number,
): CollectivePurchaseOpportunity[] {
  const seen = new Set<string>();
  const byItem = new Map<string, {
    label: string;
    unit: string;
    totalQuantity: Decimal;
    totalEstimatedValue: Decimal;
    demandIds: string[];
    units: Map<string, CollectivePurchaseUnitSummary>;
  }>();

  for (const demand of demands) {
    if (demand.year !== year || seen.has(demand.id) || demand.status === "Cancelado") continue;
    seen.add(demand.id);
    const unitMeasure = (demand.unit ?? "un").trim().toLowerCase() || "un";
    const itemKey = demand.catalogItemId
      ? `catalog:${demand.catalogItemId}|${unitMeasure}`
      : `desc:${normalizeItemKey(demand.description)}|${unitMeasure}`;

    const entry = byItem.get(itemKey) ?? {
      label: demand.description,
      unit: demand.unit ?? "un",
      totalQuantity: new Decimal(0),
      totalEstimatedValue: new Decimal(0),
      demandIds: [],
      units: new Map<string, CollectivePurchaseUnitSummary>(),
    };

    const qty = new Decimal(demand.quantity ?? 1);
    const val = new Decimal(demand.estimatedValue ?? 0);
    entry.totalQuantity = entry.totalQuantity.plus(qty);
    entry.totalEstimatedValue = entry.totalEstimatedValue.plus(val);
    entry.demandIds.push(demand.id);

    const unitKey = demand.unitId ?? "sem-unidade";
    const unitName = demand.unitName ?? "Sem unidade identificada";
    const unitSummary = entry.units.get(unitKey) ?? {
      unitId: unitKey,
      unitName,
      demandCount: 0,
      quantity: new Decimal(0),
      estimatedValue: new Decimal(0),
    };
    unitSummary.demandCount += 1;
    unitSummary.quantity = unitSummary.quantity.plus(qty);
    unitSummary.estimatedValue = unitSummary.estimatedValue.plus(val);
    entry.units.set(unitKey, unitSummary);

    byItem.set(itemKey, entry);
  }

  const opportunities: CollectivePurchaseOpportunity[] = [];
  for (const [key, entry] of byItem.entries()) {
    if (entry.demandIds.length < 2) continue;
    const units = [...entry.units.values()].sort((a, b) => a.unitName.localeCompare(b.unitName, "pt-BR"));
    opportunities.push({
      key,
      label: entry.label,
      unit: entry.unit,
      totalQuantity: entry.totalQuantity,
      totalEstimatedValue: entry.totalEstimatedValue,
      unitCount: units.length,
      demandCount: entry.demandIds.length,
      units,
      demandIds: entry.demandIds,
    });
  }

  return opportunities.sort((a, b) => {
    const byUnits = b.unitCount - a.unitCount;
    if (byUnits !== 0) return byUnits;
    return b.totalEstimatedValue.comparedTo(a.totalEstimatedValue);
  });
}

export type InternalPhaseMonitoringItem = {
  planningId: string;
  description: string;
  unitName: string;
  status: string;
  expectedPeriodStart: Date | string;
  expectedPeriodEnd: Date | string;
  estimatedValue: Decimal.Value;
  hasDfd: boolean;
  dfdApproved: boolean;
  pcaStatus: string | null;
  etpStatus: string | null;
  trStatus: string | null;
  gedLinkedCount: number;
  coherent: boolean;
};

export type InternalPhaseMonitoringSummary = {
  totalDemands: number;
  totalEstimatedValue: Decimal;
  byPlanningStatus: { rascunho: number; planejado: number; cancelado: number };
  documentsProgress: {
    withDfd: number;
    dfdApproved: number;
    withPcaDoc: number;
    withEtp: number;
    etpApproved: number;
    withTr: number;
    trApproved: number;
    gedLinkedTotal: number;
    coherentCount: number;
    inconsistentCount: number;
  };
  deadlines: {
    overdueCount: number;
    dueSoonCount: number;
    onTrackCount: number;
    itemsWithAlert: {
      planningId: string;
      description: string;
      unitName: string;
      expectedPeriodStart: string;
      alertLevel: "ATRASADO" | "PROXIMO_VENCIMENTO";
      currentStage: string;
    }[];
  };
};

function toDateOnlyUtc(value: Date | string): number {
  const iso = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y || 1970, (m || 1) - 1, d || 1);
}

export function summarizeInternalPhaseMonitoring(
  items: InternalPhaseMonitoringItem[],
  now = new Date(),
): InternalPhaseMonitoringSummary {
  const todayUtc = toDateOnlyUtc(now);
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  let totalEstimatedValue = new Decimal(0);
  const byPlanningStatus = { rascunho: 0, planejado: 0, cancelado: 0 };
  const documentsProgress = {
    withDfd: 0,
    dfdApproved: 0,
    withPcaDoc: 0,
    withEtp: 0,
    etpApproved: 0,
    withTr: 0,
    trApproved: 0,
    gedLinkedTotal: 0,
    coherentCount: 0,
    inconsistentCount: 0,
  };
  const deadlines = {
    overdueCount: 0,
    dueSoonCount: 0,
    onTrackCount: 0,
    itemsWithAlert: [] as InternalPhaseMonitoringSummary["deadlines"]["itemsWithAlert"],
  };

  for (const item of items) {
    totalEstimatedValue = totalEstimatedValue.plus(item.estimatedValue ?? 0);
    if (item.status === "Planejado") byPlanningStatus.planejado += 1;
    else if (item.status === "Cancelado") byPlanningStatus.cancelado += 1;
    else byPlanningStatus.rascunho += 1;

    if (item.hasDfd) documentsProgress.withDfd += 1;
    if (item.dfdApproved) documentsProgress.dfdApproved += 1;
    if (item.pcaStatus) documentsProgress.withPcaDoc += 1;
    if (item.etpStatus) documentsProgress.withEtp += 1;
    if (item.etpStatus === "APROVADO") documentsProgress.etpApproved += 1;
    if (item.trStatus) documentsProgress.withTr += 1;
    if (item.trStatus === "APROVADO") documentsProgress.trApproved += 1;
    documentsProgress.gedLinkedTotal += item.gedLinkedCount;

    if (item.coherent) documentsProgress.coherentCount += 1;
    else documentsProgress.inconsistentCount += 1;

    if (item.status === "Cancelado") continue;

    const isCompleted = item.trStatus === "APROVADO";
    const startUtc = toDateOnlyUtc(item.expectedPeriodStart);
    const startIso = typeof item.expectedPeriodStart === "string"
      ? item.expectedPeriodStart.slice(0, 10)
      : item.expectedPeriodStart.toISOString().slice(0, 10);

    const currentStage = item.trStatus === "APROVADO"
      ? "Fase interna concluída (TR aprovado)"
      : item.trStatus
        ? `TR (${item.trStatus})`
        : item.etpStatus
          ? `ETP (${item.etpStatus})`
          : item.hasDfd
            ? `DFD (${item.dfdApproved ? "APROVADO" : "EM ELABORAÇÃO"})`
            : "Planejamento inicial";

    if (!isCompleted && startUtc < todayUtc) {
      deadlines.overdueCount += 1;
      deadlines.itemsWithAlert.push({
        planningId: item.planningId,
        description: item.description,
        unitName: item.unitName,
        expectedPeriodStart: startIso,
        alertLevel: "ATRASADO",
        currentStage,
      });
    } else if (!isCompleted && startUtc - todayUtc <= thirtyDaysMs) {
      deadlines.dueSoonCount += 1;
      deadlines.itemsWithAlert.push({
        planningId: item.planningId,
        description: item.description,
        unitName: item.unitName,
        expectedPeriodStart: startIso,
        alertLevel: "PROXIMO_VENCIMENTO",
        currentStage,
      });
    } else {
      deadlines.onTrackCount += 1;
    }
  }

  return {
    totalDemands: items.length,
    totalEstimatedValue,
    byPlanningStatus,
    documentsProgress,
    deadlines,
  };
}

export function buildPcaManagerialReportCsv(
  year: number,
  groups: ReturnType<typeof consolidatePca>,
  opportunities: CollectivePurchaseOpportunity[],
): string {
  const escapeCsv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const lines = [
    ["Exercicio", "Unidade", "DemandaId", "Descricao", "UnidadeMedida", "Quantidade", "ValorEstimadoBRL", "CompraColetiva"].map(escapeCsv).join(";"),
  ];
  const collectiveDemandIds = new Set(opportunities.flatMap(op => op.demandIds));
  for (const group of groups) {
    for (const demand of group.demands) {
      lines.push([
        year,
        group.name,
        demand.id,
        demand.description,
        demand.unit ?? "un",
        demand.quantity ?? 1,
        new Decimal(demand.estimatedValue).toFixed(2),
        collectiveDemandIds.has(demand.id) ? "SIM" : "NAO",
      ].map(escapeCsv).join(";"));
    }
  }
  return lines.join("\n");
}
