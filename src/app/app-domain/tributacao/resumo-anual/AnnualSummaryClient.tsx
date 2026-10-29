"use client";

import type { readAnnualTaxSummary } from "@/lib/tributacao/annual-tax-summary";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { TaxOperationalTable } from "../TaxOperationalTable";

type Summary = Awaited<ReturnType<typeof readAnnualTaxSummary>>;
const columns = [ ["name", "Tributo"], ["assessed", "Lançado R$"], ["net", "Líquido R$"], ["discounts", "Descontos R$"], ["exemptions", "Isenções R$"], ["immunities", "Imunidades R$"], ["otherBenefits", "Outros benefícios R$"], ["paid", "Pago R$"], ["compensated", "Compensado R$"], ["balance", "Saldo R$"], ["overdue", "Vencido R$"], ["delinquencyPercent", "Inadimplência %"], ["assessments", "Lançamentos"], ["cancelled", "Lançamentos cancelados"], ["singleAssessments", "Lançamentos com cota única"], ["installmentAssessments", "Lançamentos com parcelas"], ["unclassifiedAssessments", "Lançamentos sem modalidade integralmente conciliada"], ["guides", "Guias válidas"], ["singleGuides", "Guias cota única"], ["installmentGuides", "Guias parcelas"], ["unclassifiedGuides", "Guias sem modalidade conciliada"], ["cancelledGuides", "Guias canceladas"], ["overdueAssessments", "Lançamentos inadimplentes"] ] as const;
export default function AnnualSummaryClient({ summary }: { summary: Summary }) {
  function download() {
    const escape = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [columns.map(([, label]) => escape(label)).join(";"), ...summary.rows.map(row => columns.map(([key]) => escape(row[key])).join(";"))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `resumo-tributario-${summary.year}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  const description = "Inadimplência monetária = saldo vencido e exigível ÷ valor líquido vigente × 100. Pagamentos confirmados incluem guias posteriormente canceladas e excluem estornos. Compensações são demonstradas separadamente. Guias sem classificação explícita não são presumidas como cota única ou parcela. Benefícios sem classificação fiscal conciliada constam em outros benefícios.";
  const actions = <><button type="button" onClick={() => window.print()} className="h-7 rounded border px-2 text-xs">Imprimir / salvar PDF</button><button type="button" onClick={download} className="h-7 rounded border px-2 text-xs">Baixar CSV</button></>;
  return <section className="space-y-3">
    <header><h2 className="font-semibold">{summary.governmentEntity} · UG {summary.budgetUnit} · {summary.year}</h2><p className="text-xs">Posição de {new Date(summary.issuedAt).toLocaleString("pt-BR")}</p></header>
    <nav className="flex gap-3 text-xs print:hidden">{actions}</nav>
    <OperationalTablePanel title={`Resumo anual dos tributos — ${summary.year}`} triggerLabel="Abrir resumo completo — 23 colunas" description="Todos os campos fiscais em uma única tabela, com larguras ajustáveis e acesso integral por célula. Os filtros e a classificação de benefícios permanecem na página de origem.">
      <TaxOperationalTable id="resumo-anual" resetKey={`${summary.year}:${summary.budgetUnit}:${summary.issuedAt}`} actions={<button type="button" onClick={download} className="h-7 rounded border px-2 text-xs">Baixar CSV</button>}
        toolbar={<OperationalFilters label="Contexto fiscal"><p>{summary.governmentEntity} · UG {summary.budgetUnit} · {summary.year}</p><p>{description}</p></OperationalFilters>}
        columns={columns.map(([key, label]) => [key, label, key === "name" ? 80 : 40, key === "name" ? 160 : 80, "text", key === "name" ? "left" : "right"] as const)}
        rows={summary.rows.map(row => ({ id: row.taxId, label: row.name, values: Object.fromEntries(columns.map(([key]) => [key, String(row[key] ?? "—")])) }))} />
    </OperationalTablePanel>
    <div className="hidden print:block"><table className="w-full border-collapse text-left text-xs"><thead><tr>{columns.map(([key, label]) => <th key={key} className="whitespace-nowrap border p-2">{label}</th>)}</tr></thead><tbody>{summary.rows.map(row => <tr key={row.taxId}>{columns.map(([key]) => <td key={key} className="whitespace-nowrap border p-2">{row[key]}</td>)}</tr>)}</tbody></table></div>
    <p className="text-xs">{description}</p>
  </section>;
}
