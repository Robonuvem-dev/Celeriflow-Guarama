import { getTenantContextForModule } from "@/lib/platform/tenant-context";
export default async function Page() {
  await getTenantContextForModule("PATRIMONIO");
  return <main className="space-y-5 p-6"><h1 className="text-2xl font-semibold">Relatórios patrimoniais</h1><form action="/api/patrimonio/relatorios" className="grid max-w-2xl gap-4">
    <label>Relatório<select className="block w-full border p-2" name="report"><option value="bens">Cadastro de bens</option><option value="manutencoes">Manutenções preventivas e corretivas</option><option value="estoque">Materiais em estoque</option><option value="aquisicao">Materiais em aquisição</option></select></label>
    <label>Formato<select className="block w-full border p-2" name="format"><option value="html">Impressão / PDF pelo navegador</option><option value="csv">Planilha CSV</option></select></label>
    <label>Pesquisa<input className="block w-full border p-2" name="q" maxLength={200} /></label><label>Situação<input className="block w-full border p-2" name="status" maxLength={80} /></label>
    <label>Início do período<input className="block w-full border p-2" type="date" name="from" /></label><label>Fim do período<input className="block w-full border p-2" type="date" name="to" /></label>
    <button className="rounded bg-blue-700 p-3 text-white">Emitir relatório</button>
  </form><p>Assinaturas: configure o identificador bens, manutencoes ou estoque em Cadastros auxiliares → Assinaturas.</p></main>;
}
