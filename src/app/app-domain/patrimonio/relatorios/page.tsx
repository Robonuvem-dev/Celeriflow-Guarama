import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { assetReportTitles } from "@/lib/patrimonio/report-options";
export default async function Page() {
  await getTenantContextForModule("PATRIMONIO");
  return <main className="space-y-5 p-6"><h1 className="text-2xl font-semibold">Relatórios patrimoniais</h1><form action="/api/patrimonio/relatorios" className="grid max-w-2xl gap-4 sm:grid-cols-2">
    <label>Relatório<select className="block w-full border p-2" name="report">{Object.entries(assetReportTitles).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
    <label>Formato<select className="block w-full border p-2" name="format"><option value="html">Impressão / PDF pelo navegador</option><option value="csv">Planilha CSV</option></select></label>
    <label>Pesquisa por placa ou nome<input className="block w-full border p-2" name="q" maxLength={200} /></label><label>Situação<input className="block w-full border p-2" name="status" maxLength={80} /></label>
    {[["unit", "Identificador da unidade administrativa"], ["department", "Identificador do setor"], ["responsible", "Identificador do responsável"], ["category", "Identificador da categoria / tipo de bem"], ["account", "Conta PCASP"], ["session", "Identificador do inventário"]].map(([name, label]) => <label key={name}>{label}<input className="block w-full border p-2" name={name} maxLength={100} /></label>)}
    <label>Exercício dos cadastros<input className="block w-full border p-2" type="number" name="year" min={1900} max={2200} defaultValue={new Date().getUTCFullYear()} /></label>
    <label>Agrupamento da movimentação<select className="block w-full border p-2" name="period"><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label>
    <label>Início do período<input className="block w-full border p-2" type="date" name="from" /></label><label>Fim do período<input className="block w-full border p-2" type="date" name="to" /></label>
    <button className="rounded bg-blue-700 p-3 text-white">Emitir relatório</button>
  </form><p>Assinaturas: configure o identificador do relatório em Cadastros auxiliares → Assinaturas. O termo de responsabilidade usa os filtros de placa, setor e responsável.</p></main>;
}
