import type { InternalReportDataset, ReportRow } from "@/lib/financeiro/report-delivery";
import { recyclingReportViews, type RecyclingReportData } from "./recycling-reports";

export function recyclingReportDataset(data: RecyclingReportData): InternalReportDataset {
  const { filters: f } = data;
  const result: InternalReportDataset = {
    title: `Recicláveis — ${recyclingReportViews[f.view]}`, year: Number(f.to.slice(0, 4)), warnings: [],
    metadata: { status: "INTERNAL_REVIEW", scope: "Gestão de resíduos — instância autorizada", referencePeriod: `${f.from} a ${f.to}`, statutoryCompleteness: "NOT_STATUTORY", publicSnapshotEligible: false, publicSnapshotCondition: "Relatório operacional privado" },
    sections: [{ title: "Filtros aplicados", rows: [{ "Período inicial": f.from, "Período final": f.to, "Tipo de material": f.typeCode || "Todos", Material: f.materialCode || "Todos", Depósito: f.depotCode || "Todos", Ordenação: f.view === "monthly" ? "Cronológica" : f.order === "description" ? "Descrição" : "Código" }] }],
  };
  const rows = data.rows.map((row): ReportRow => f.view === "sales" || f.view === "monthly" ? { Código: row.code, [f.view === "monthly" ? "Mês" : "Tipo de material"]: row.name, "Saídas registradas": row.movements, "Valor obtido (R$)": row.revenue }
    : { Código: row.code, Material: row.name, Tipo: row.type, Unidade: row.unit, "Depósito": `${row.depotCode} ${row.depot}`.trim(), "Saldo inicial": row.opening, Entradas: row.incoming, Saídas: row.outgoing, "Saldo final": row.balance, "Valor obtido (R$)": row.revenue });
  if (f.view === "depots") {
    const depots = new Map<string, { title: string; rows: ReportRow[] }>();
    data.rows.forEach((row, i) => { const section = depots.get(row.depotCode) ?? { title: `${row.depotCode} — ${row.depot}`, rows: [] }; section.rows.push(rows[i]); depots.set(row.depotCode, section); });
    result.sections.push(...depots.values());
    if (!depots.size) result.sections.push({ title: "Depósitos — sem movimentos no recorte", rows: [] });
  } else result.sections.push({ title: recyclingReportViews[f.view], rows });
  result.sections.push({ title: "Totais do filtro completo", rows: [{ Registros: data.total, "Valor obtido (R$)": data.revenue, Observação: "Saldos por material e unidade. Quantidades de unidades diferentes não são somadas." }] });
  return result;
}
