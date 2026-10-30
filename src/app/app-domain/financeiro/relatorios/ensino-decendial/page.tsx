import Link from "next/link";
import { db } from "@/db/client";
import { listFinancePageYears } from "@/db/repositories/finance-pages/catalog";
import { canIssueFinancialReports, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readMunicipalFiscalIndex } from "@/lib/financeiro/fiscal-indices";
import { decennialEducationSummary, validateDecennialCut } from "@/lib/financeiro/education-decennial";

export const dynamic = "force-dynamic";
export default async function EducationDecennialPage({ searchParams }: { searchParams: Promise<{ yearId?: string; through?: string }> }) {
  const context = await getTenantContextForModule("FINANCEIRO");
  if (!canIssueFinancialReports(context.user)) return <p className="p-5">Emissão consolidada exige acesso autorizado às unidades gestoras do ente.</p>;
  const query = await searchParams;
  const database = context.database ?? db;
  const years = await listFinancePageYears(database, { allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });
  const year = years.find(year => year.id === query.yearId);
  const form = <form className="flex flex-wrap gap-3"><label>Exercício<select name="yearId" required className="m-2 rounded border p-2" defaultValue={year?.id ?? ""}><option value="" disabled>Selecione</option>{years.map(year => <option key={year.id} value={year.id}>{year.governmentEntity?.name} · {year.year}</option>)}</select></label><label>Fim do decêndio<input type="date" name="through" required className="m-2 rounded border p-2" defaultValue={query.through} /></label><button className="rounded border p-2">Emitir demonstrativo</button></form>;
  let report: Awaited<ReturnType<typeof readMunicipalFiscalIndex>> | undefined;
  let error = "";
  if (query.through && year) {
    try { report = await readMunicipalFiscalIndex(database, { usuarioId: context.user.id, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, { financialYearId: year.id, code: "EDUCATION_MINIMUM", through: validateDecennialCut(query.through) }); }
    catch (cause) { error = cause instanceof Error ? cause.message : "Falha na apuração."; }
  }
  const summary = report ? decennialEducationSummary(report) : null;
  const escape = (value: string) => `"${(/^[=+\-@]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  const csv = report && summary ? [["Demonstrativo", "Corte", "Aplicação", "Base", "Percentual preliminar", "Mínimo configurado"], ["MDE — acompanhamento decendial", query.through ?? "", summary.applied ?? "Não apurada", summary.base ?? "Não apurada", summary.preliminaryPercentage ?? "Não apurado", summary.minimum ?? "Não configurado"], ["Componente", "Seção", "Valor", "Partidas"], ...report.rows.map(row => [row.label, row.section, row.value, row.entryIds.join(" | ")]), ["Observação", "Documento de acompanhamento: não certifica fechamento nem atendimento do mínimo constitucional."], ...report.issues.map(issue => ["Pendência", issue])].map(row => row.map(escape).join(",")).join("\r\n") : "";
  return <main className="space-y-4 p-5"><h1 className="text-xl font-semibold">Ensino 25% — acompanhamento decendial</h1><p>Aplicação acumulada no exercício até o dia 10, 20 ou último dia do mês, segundo a composição fiscal configurada.</p>{form}{error && <p role="alert">{error}</p>}{report && summary && <section className="space-y-3"><h2>{year?.governmentEntity?.name} · Corte: {query.through}</h2><p>Aplicação: {summary.applied ?? "Não apurada"} · Base: {summary.base ?? "Não apurada"} · Percentual preliminar: {summary.preliminaryPercentage ?? "Não apurado"}% · Mínimo configurado: {summary.minimum ?? "Não configurado"}%</p><p>Documento de acompanhamento; não certifica fechamento contábil nem atendimento do mínimo constitucional. A composição deve ser revisada pela contabilidade.</p><Link className="underline" href="/financeiro/relatorios/indices-constitucionais">Configurar e revisar composição</Link>{report.issues.map(issue => <p key={issue}>{issue}</p>)}<a className="block underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent("\uFEFF" + csv)}`} download="ensino-decendial.csv">Baixar demonstrativo CSV</a><table><thead><tr><th>Componente</th><th>Seção</th><th>Valor</th></tr></thead><tbody>{report.rows.map((row, i) => <tr key={i}><td>{row.label}</td><td>{row.section}</td><td>{row.value}</td></tr>)}</tbody></table><p>Memória SHA-256: {report.sourceHash ?? "Indisponível"}</p></section>}</main>;
}
