import Link from "next/link";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { readSimplesDossier } from "@/lib/tributacao/simples-dossier";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
const currency = (value: unknown) => String(value ?? "—");
function Evidence({ title, rows }: { title: string; rows: unknown[] }) {
  return <section className="space-y-2 rounded border p-4"><h2 className="font-semibold">{title} ({rows.length})</h2>{rows.length ? rows.map((row, index) => <details className="border-t py-2 print:break-inside-avoid" key={index}><summary>Registro {index + 1}</summary><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(row, null, 2)}</pre></details>) : <p className="text-sm text-slate-600">Nenhum registro persistido para a seleção.</p>}</section>;
}
export default async function SimplesDossierPage({ searchParams }: { searchParams: Promise<{ taxpayerId?: string; year?: string; recordType?: string }> }) {
  const context = await getTenantContextForModule("TRIBUTACAO"), database = context.database ?? db;
  const query = await searchParams, year = query.year ? Number(query.year) : new Date().getUTCFullYear();
  const taxpayers = await listPageTaxpayers(database, { companyOnly: true, order: "created-asc" });
  const dossier = query.taxpayerId ? await readSimplesDossier(database, query.taxpayerId, year, query.recordType?.trim()) : null;
  const download = new URLSearchParams({ taxpayerId: query.taxpayerId ?? "", year: String(year), recordType: query.recordType ?? "" });
  return <main className="space-y-4 p-4"><div className="flex flex-wrap items-center gap-3"><h1 className="text-xl font-bold">Simples Nacional — consulta fiscal por contribuinte</h1><Link href="/tributacao/simples-nacional" className="underline print:hidden">Voltar</Link><PrintButton /></div>
    <form className="flex flex-wrap items-end gap-3 rounded border p-3 print:hidden"><label>Contribuinte<select name="taxpayerId" required defaultValue={query.taxpayerId ?? ""} className="block rounded border p-2"><option value="">Selecione</option>{taxpayers.map(row => <option value={row.id} key={row.id}>{row.company?.cnpj} — {row.company?.corporateName}</option>)}</select></label><label>Ano-calendário<input name="year" type="number" min={2007} max={new Date().getUTCFullYear()} defaultValue={year} required className="block rounded border p-2" /></label><label>Tipo de registro<input name="recordType" defaultValue={query.recordType ?? ""} placeholder="Todos, PGDAS, DEFIS, PGFN…" className="block rounded border p-2" /></label><button className="rounded border px-3 py-2">Consultar</button></form>
    <p className="text-sm text-slate-600">Consulta dos dados efetivamente cadastrados/importados. Campos federais ausentes não são calculados ou preenchidos artificialmente. Exportação dos registros em PDF, XLSX, DOCX, TXT e CSV; dossiê completo em JSON. XLSX/DOCX são formatos atuais e não arquivos legados XLS/DOC.</p>
    {dossier && <><div className="flex flex-wrap gap-3 print:hidden">{["pdf", "xlsx", "docx", "txt", "csv", "json"].map(format => <a key={format} className="underline" href={`/api/tributacao/simples/consulta?${download}&format=${format}`}>Baixar {format.toUpperCase()}</a>)}</div>
      <h2 className="font-semibold">{dossier.taxpayer.company?.corporateName} — {dossier.taxpayer.company?.cnpj} — {year}</h2>
      <Evidence title="Cadastro municipal / CNPJ e endereços" rows={[dossier.taxpayer, ...dossier.addresses, ...dossier.registrations]} />
      <section className="overflow-auto rounded border p-4"><h2 className="font-semibold">Períodos de opção</h2><table className="w-full text-left text-sm"><thead><tr><th>Número</th><th>Regime</th><th>Início</th><th>Fim</th><th>Situação</th></tr></thead><tbody>{dossier.periods.map(row => <tr key={row.id}><td>{row.id}</td><td>{row.regime}</td><td>{row.startDate.toISOString().slice(0, 10)}</td><td>{row.endDate?.toISOString().slice(0, 10) ?? "—"}</td><td>{row.status}</td></tr>)}</tbody></table></section>
      <section className="overflow-auto rounded border p-4"><h2 className="font-semibold">Declarações e registros importados ({dossier.records.length})</h2><table className="w-full text-left text-xs"><thead><tr><th>Competência / tipo / situação</th><th>Receita nacional</th><th>Serviços declarados</th><th>ISS municipal</th><th>Pagamento confirmado</th><th>Dados recebidos</th></tr></thead><tbody>{dossier.records.map(row => <tr className="border-t align-top" key={row.id}><td>{row.competence}<br />{row.recordType}<br />{row.status}</td><td>{currency(row.nationalRevenueDecimal)}</td><td>{currency(row.declaredServiceDecimal)}</td><td>{currency(row.municipalIssDecimal)}</td><td>{currency(row.confirmedPaymentDecimal)}</td><td><details><summary>Conteúdo original normalizado</summary><pre className="max-w-lg whitespace-pre-wrap">{JSON.stringify(row.rawData, null, 2)}</pre></details></td></tr>)}</tbody></table></section>
      <Evidence title="Rateios de pagamentos" rows={dossier.payments} /><Evidence title="Malhas e regularização" rows={dossier.divergences} /><Evidence title="Preparações de exclusão" rows={dossier.exclusions} /><Evidence title="Comunicações municipais DTE / ciência" rows={dossier.communications} />
      <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Rastreabilidade das importações</h2>{dossier.imports.map(batch => <article className="border-t pt-2 text-sm" key={batch.id}><p>{batch.sourceType} — {batch.fileName} — {batch.status}</p><p>{batch.createdAt.toISOString()} · Usuário: {batch.createdByUsuarioId ?? "Não informado"} · Aceitos: {batch.acceptedRows}/{batch.totalRows} · Rejeitados: {batch.rejectedRows}</p><details><summary>Resumo de erros</summary><pre className="whitespace-pre-wrap">{JSON.stringify(batch.errorSummary, null, 2)}</pre></details></article>)}</section>
    </>}
  </main>;
}
