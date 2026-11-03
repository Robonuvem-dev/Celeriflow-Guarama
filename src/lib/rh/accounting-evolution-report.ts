import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import type { SQL } from "drizzle-orm";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { buildAccountingHrReport } from "./accounting-reports";

/** Compares the same canonical allocated totals; global and unit views are explicitly non-additive. */
export async function buildAccountingEvolutionReport(db: DatabaseExecutor, input: OperationalReportInput, payrollScope?: SQL, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const reference = input.referenceDate ?? new Date().toISOString().slice(0, 10), compare = input.compareDate ?? input.from ?? `${input.year ?? reference.slice(0, 4)}-01-01`;
  const reports: PersonnelReport[] = [];
  for (const date of [compare, reference]) reports.push(await buildAccountingHrReport(db, { ...input, kind: "CONTABIL_DOTACAO_FONTE_DESPESA", from: `${date.slice(0, 7)}-01`, until: new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).toISOString().slice(0, 10), competence: `${date.slice(5, 7)}/${date.slice(0, 4)}`, totalizers: "BRUTO,ENCARGOS" }, payrollScope, budgetUnitIds));
  const totals = new Map<string, { labels: string[]; base: Decimal; compared: Decimal; sources: Set<string> }>();
  for (const [period, report] of reports.entries()) {
    const index = (header: string) => { const position = report.headers.indexOf(header); if (position < 0) throw new Error(`A fonte de evolução não contém ${header}.`); return position; };
    const line = index("Tipo da linha"), code = index("Rubrica / totalizador"), unit = index("Unidade gestora ID"), nature = index("Natureza da despesa"), type = index("Tipo de folha"), scope = index("Escopo"), origin = index("Origem da classificação"), amount = index("Valor rateado BRL");
    for (const row of report.rows) {
      if (row[line] !== "TOTAL_NAO_ADITIVO" || !["BRUTO", "ENCARGOS"].includes(row[code])) continue;
      for (const level of ["GLOBAL", "UNIDADE"]) {
        const labels = [level, level === "GLOBAL" ? "Todas as unidades autorizadas do filtro" : row[unit], row[nature], row[type], row[scope], row[code]];
        const key = JSON.stringify(labels), group = totals.get(key) ?? { labels, base: new Decimal(0), compared: new Decimal(0), sources: new Set<string>() };
        if (period === 0) group.base = group.base.add(row[amount]); else group.compared = group.compared.add(row[amount]);
        group.sources.add(row[origin]); totals.set(key, group);
      }
    }
  }
  return { title: "Evolução por natureza da despesa — visões global e por unidade; níveis não aditivos", headers: ["Nível da visão", "Unidade gestora", "Natureza da despesa", "Tipo de folha", "Escopo", "Componente totalizado", "Competência-base", "Competência comparada", "Valor-base BRL", "Valor comparado BRL", "Variação BRL", "Variação %", "Situação da base", "Fontes preservadas"], rows: [...totals.values()].sort((a, b) => JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels))).map(group => {
    const difference = group.compared.sub(group.base);
    return [...group.labels, `${compare.slice(5, 7)}/${compare.slice(0, 4)}`, `${reference.slice(5, 7)}/${reference.slice(0, 4)}`, group.base.toFixed(2), group.compared.toFixed(2), difference.toFixed(2), group.base.isZero() ? "" : difference.div(group.base).mul(100).toFixed(4), group.base.isZero() ? "Base zero ou sem movimentos nos critérios; percentual não definido" : "Percentual sobre o valor-base", [...group.sources].sort().join("; ")];
  }) };
}
