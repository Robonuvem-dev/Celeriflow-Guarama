import { db } from "@/db/client";
import { findOperationalInstance } from "@/db/repositories/platform/instance-configuration";
import { listFinancePageYears } from "@/db/repositories/finance-pages/catalog";
import { canIssueFinancialReports, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { parseReportPresets, type ReportPreset } from "@/lib/financeiro/report-preset";
import { saveFinancialReportPreset } from "./actions";

export const dynamic = "force-dynamic";
const types = { BALANCETE: "Balancete contábil", CONCILIACAO_TESOURARIA: "Conciliação de tesouraria", BALANCO_FINANCEIRO: "Balanço financeiro", RGF: "Relatório de gestão fiscal" };
function PresetForm({ preset }: { preset?: ReportPreset }) {
  return <form action={saveFinancialReportPreset} className="grid gap-3 rounded border p-3 sm:grid-cols-2">
    <input type="hidden" name="id" value={preset?.id ?? ""} /><label>Nome<input className="block rounded border p-2" name="name" required minLength={2} maxLength={160} defaultValue={preset?.name} /></label>
    <label>Finalidade<textarea className="block rounded border p-2" name="purpose" maxLength={1500} defaultValue={preset?.purpose} /></label>
    <label>Relatório<select className="block rounded border p-2" name="reportType" defaultValue={preset?.reportType}>{Object.entries(types).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
    <label>Formato<select className="block rounded border p-2" name="format" defaultValue={preset?.format}>{["PDF", "CSV", "XLSX", "TXT", "print", "preview"].map(format => <option key={format}>{format}</option>)}</select></label>
    <label><input type="checkbox" name="active" defaultChecked={preset?.active ?? true} /> Ativo</label><button className="rounded bg-emerald-800 p-2 text-white">Salvar cadastro</button>
  </form>;
}
export default async function FinancialReportCatalog({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await getTenantContextForModule("FINANCEIRO");
  const query = await searchParams;
  const database = context.database ?? db;
  const [instance, years] = await Promise.all([findOperationalInstance(database), listFinancePageYears(database, { allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds })]);
  const presets = parseReportPresets(instance?.parametros.filter(p => p.chave.startsWith("FINANCIAL_REPORT_PRESET:")).map(p => p.valor) ?? []).filter(p => `${p.name} ${p.purpose}`.toLocaleLowerCase("pt-BR").includes((query.q ?? "").toLocaleLowerCase("pt-BR")));
  return <main className="space-y-4 p-5"><h1 className="text-xl font-semibold">Cadastro de relatórios gerenciais</h1><form><input aria-label="Buscar relatório" name="q" defaultValue={query.q} className="rounded border p-2" /><button className="p-2">Buscar</button></form>
    {instance ? <details><summary>Novo relatório</summary><PresetForm /></details> : <p>Configure a instância municipal para habilitar cadastros.</p>}
    {presets.map(preset => <article key={preset.id} className="space-y-3 rounded border p-3"><h2>{preset.name} · {preset.active ? "Ativo" : "Inativo"}</h2><p>{preset.purpose}</p><p>{types[preset.reportType]} · {preset.format}</p><details><summary>Editar cadastro</summary><PresetForm preset={preset} /></details>
      {preset.active && canIssueFinancialReports(context.user) && <form action="/api/financeiro/relatorios"><input type="hidden" name="reportType" value={preset.reportType} /><input type="hidden" name="format" value={preset.format} /><label>Exercício<select name="financialYearId" required className="m-2 rounded border p-2">{years.map(year => <option key={year.id} value={year.id}>{year.governmentEntity?.name} · {year.year}</option>)}</select></label>{preset.reportType === "BALANCETE" && <label>Mês<select name="month" required className="m-2 rounded border p-2">{Array.from({ length: 12 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label>}<button className="rounded border p-2">Emitir relatório</button></form>}
    </article>)}{!presets.length && <p>Nenhum relatório cadastrado no filtro.</p>}
  </main>;
}
