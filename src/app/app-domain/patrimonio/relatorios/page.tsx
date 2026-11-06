import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { assetReportTitles } from "@/lib/patrimonio/report-options";

export default async function Page() {
  await getTenantContextForModule("PATRIMONIO");
  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Relatórios Patrimoniais</h1>
          <p className="text-sm text-slate-500">Emissão e consulta de relatórios consolidados, inventários, termos e fichas contábeis.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/patrimonio/bens" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">Bens patrimoniais</Link>
          <Link href="/patrimonio/inventario-bens" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">Inventário</Link>
          <Link href="/patrimonio/ciclo-vida" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">Ciclo de vida</Link>
          <Link href="/patrimonio/cadastros" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">Cadastros auxiliares</Link>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-800">Parâmetros de Emissão</h2>
        <form action="/api/patrimonio/relatorios" method="GET" target="_blank" className="grid max-w-4xl gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-700">
            Tipo de Relatório
            <select className="mt-1 block h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none" name="report">
              {Object.entries(assetReportTitles).map(([value, title]) => (
                <option key={value} value={value}>{title}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Formato de Saída
            <select className="mt-1 block h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none" name="format">
              <option value="html">Visualização e Impressão (PDF)</option>
              <option value="csv">Planilha Eletrônica (CSV)</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Pesquisa por placa ou nome
            <input className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none" name="q" maxLength={200} placeholder="Ex: NOT-001 ou Mesa" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Situação patrimonial
            <input className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none" name="status" maxLength={80} placeholder="Ex: Ativo, Baixado..." />
          </label>
          {[
            ["unit", "Identificador da unidade administrativa"],
            ["department", "Identificador do setor"],
            ["responsible", "Identificador do responsável"],
            ["category", "Identificador da categoria / tipo de bem"],
            ["account", "Conta contábil PCASP"],
            ["session", "Identificador do inventário"],
          ].map(([name, label]) => (
            <label key={name} className="text-xs font-semibold text-slate-700">
              {label}
              <input key={name} className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none" name={name} maxLength={100} />
            </label>
          ))}
          <label className="text-xs font-semibold text-slate-700">
            Exercício dos cadastros
            <input className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none" type="number" name="year" min={1900} max={2200} defaultValue={new Date().getUTCFullYear()} />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Agrupamento da movimentação
            <select className="mt-1 block h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none" name="period">
              <option value="monthly">Mensal</option>
              <option value="annual">Anual</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Início do período
            <input className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none" type="date" name="from" />
          </label>
          <label className="text-xs font-semibold text-slate-700">
            Fim do período
            <input className="mt-1 block h-9 w-full rounded border border-slate-300 px-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none" type="date" name="to" />
          </label>
          <div className="col-span-full pt-2">
            <button type="submit" className="inline-flex items-center rounded-md bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
              Emitir Relatório
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">Instruções e parametrizações:</p>
        <ul className="mt-1.5 list-inside list-disc space-y-1">
          <li>Assinaturas: configure o identificador do relatório em <strong>Cadastros auxiliares → Assinaturas</strong> para inclusão automática nos rodapés.</li>
          <li>Termo de responsabilidade: utiliza os filtros de placa, setor e responsável informados acima.</li>
          <li>Etiquetas com QRCode: geradas no formato HTML pronto para impressão com link direto de conferência física.</li>
        </ul>
      </div>
    </main>
  );
}
