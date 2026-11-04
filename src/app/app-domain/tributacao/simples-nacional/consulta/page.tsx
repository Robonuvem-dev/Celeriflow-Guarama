import Link from "next/link";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { readSimplesDossier } from "@/lib/tributacao/simples-dossier";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";
const currency = (value: unknown) => String(value ?? "—");

function Evidence({ title, rows }: { title: string; rows: unknown[] }) {
  return (
    <section className="cf-portal-card space-y-2">
      <h2 className="text-sm font-bold text-slate-900">
        {title} ({rows.length})
      </h2>
      {rows.length ? (
        rows.map((row, index) => (
          <details className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 print:break-inside-avoid" key={index}>
            <summary className="cursor-pointer text-xs font-semibold text-slate-800">Registro {index + 1}</summary>
            <pre className="mt-2 overflow-auto rounded border border-slate-200 bg-white p-2.5 text-xs whitespace-pre-wrap">
              {JSON.stringify(row, null, 2)}
            </pre>
          </details>
        ))
      ) : (
        <p className="text-xs text-slate-500">Nenhum registro persistido para a seleção.</p>
      )}
    </section>
  );
}

export default async function SimplesDossierPage({
  searchParams,
}: {
  searchParams: Promise<{ taxpayerId?: string; year?: string; recordType?: string }>;
}) {
  const context = await getTenantContextForModule("TRIBUTACAO"),
    database = context.database ?? db;
  const query = await searchParams,
    year = query.year ? Number(query.year) : new Date().getUTCFullYear();
  const taxpayers = await listPageTaxpayers(database, { companyOnly: true, order: "created-asc" });
  const selectedTaxpayerId = query.taxpayerId || taxpayers[0]?.id || "";
  const dossier = selectedTaxpayerId
    ? await readSimplesDossier(database, selectedTaxpayerId, year, query.recordType?.trim()).catch(() => null)
    : null;
  const download = new URLSearchParams({
    taxpayerId: selectedTaxpayerId,
    year: String(year),
    recordType: query.recordType ?? "",
  });

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Simples Nacional e MEI (CF27)</p>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Simples Nacional — Consulta Fiscal por Contribuinte</h1>
            <p className="mt-1 text-xs text-slate-600">
              Dossiê consolidado de períodos de opção, declarações PGDAS-D/DEFIS, rateios DAF607, malhas fiscais, exclusões e rastreabilidade de lotes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PrintButton />
            <Link href="/tributacao/simples-nacional/arquivos" className="cf-portal-btn-secondary">Arquivos de Opção</Link>
            <Link href="/tributacao/simples-nacional" className="cf-portal-btn-secondary">← Painel Simples Nacional</Link>
          </div>
        </div>
      </header>

      <form action="/tributacao/simples-nacional/consulta" method="get" className="cf-portal-form grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs print:hidden sm:grid-cols-4">
        <label className="sm:col-span-2">
          Contribuinte
          <select name="taxpayerId" required defaultValue={selectedTaxpayerId} className="mt-1 block w-full rounded-lg border border-slate-300 p-2">
            <option value="">Selecione</option>
            {taxpayers.map((row) => (
              <option value={row.id} key={row.id}>
                {row.company?.cnpj} — {row.company?.corporateName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ano-calendário
          <input name="year" type="number" min={2007} max={new Date().getUTCFullYear() + 1} defaultValue={year} required className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label>
          Tipo de registro
          <input name="recordType" defaultValue={query.recordType ?? ""} placeholder="Todos, PGDAS, DEFIS, PGFN…" className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <div className="sm:col-span-4">
          <button className="cf-portal-btn">Consultar dossiê</button>
        </div>
      </form>

      <p className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs text-blue-950">
        Consulta dos dados efetivamente cadastrados/importados. Campos federais ausentes não são calculados ou preenchidos artificialmente. Exportação dos registros em PDF, XLSX, XLS, DOCX, DOC, TXT, CSV e JSON.
      </p>

      {dossier && (
        <>
          <div className="cf-portal-card flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {dossier.taxpayer.company?.corporateName} — {dossier.taxpayer.company?.cnpj} ({year})
              </h2>
              <p className="text-xs text-slate-500">Exporte o dossiê e os registros fiscais nos formatos abaixo:</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["pdf", "xlsx", "xls", "docx", "doc", "txt", "csv", "json"].map((format) => (
                <a key={format} className="cf-portal-btn-secondary" href={`/api/tributacao/simples/consulta?${download}&format=${format}`}>
                  Baixar {format.toUpperCase()}
                </a>
              ))}
            </div>
          </div>

          <Evidence title="Cadastro municipal / CNPJ e endereços" rows={[dossier.taxpayer, ...dossier.addresses, ...dossier.registrations]} />

          <section className="cf-portal-card space-y-2 overflow-auto">
            <h2 className="text-sm font-bold text-slate-900">Períodos de opção ({dossier.periods.length})</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Regime</th>
                    <th>Início</th>
                    <th>Fim</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.periods.map((row) => (
                    <tr key={row.id}>
                      <td>{row.id}</td>
                      <td>{row.regime}</td>
                      <td>{row.startDate.toISOString().slice(0, 10)}</td>
                      <td>{row.endDate?.toISOString().slice(0, 10) ?? "—"}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                  {dossier.periods.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-500">Nenhum período de opção registrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="cf-portal-card space-y-2 overflow-auto">
            <h2 className="text-sm font-bold text-slate-900">Declarações e registros importados ({dossier.records.length})</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="cf-portal-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Competência / tipo / situação</th>
                    <th>Receita nacional</th>
                    <th>Serviços declarados</th>
                    <th>ISS municipal</th>
                    <th>Pagamento confirmado</th>
                    <th>Dados recebidos</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.records.map((row) => (
                    <tr className="border-t align-top" key={row.id}>
                      <td>
                        <strong>{row.competence}</strong>
                        <br />
                        {row.recordType} · {row.status}
                      </td>
                      <td className="tabular-nums">{currency(row.nationalRevenueDecimal)}</td>
                      <td className="tabular-nums">{currency(row.declaredServiceDecimal)}</td>
                      <td className="tabular-nums">{currency(row.municipalIssDecimal)}</td>
                      <td className="tabular-nums">{currency(row.confirmedPaymentDecimal)}</td>
                      <td>
                        <details>
                          <summary className="cursor-pointer font-semibold text-blue-700">Conteúdo original normalizado</summary>
                          <pre className="mt-1 max-w-lg rounded border border-slate-200 bg-slate-50 p-2 whitespace-pre-wrap">
                            {JSON.stringify(row.rawData, null, 2)}
                          </pre>
                        </details>
                      </td>
                    </tr>
                  ))}
                  {dossier.records.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-slate-500">Nenhuma declaração ou registro importado para o ano-calendário selecionado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Evidence title="Rateios de pagamentos" rows={dossier.payments} />
            <Evidence title="Malhas e regularização" rows={dossier.divergences} />
            <Evidence title="Preparações de exclusão" rows={dossier.exclusions} />
            <Evidence title="Comunicações municipais DTE / ciência" rows={dossier.communications} />
          </div>

          <section className="cf-portal-card space-y-3">
            <h2 className="text-sm font-bold text-slate-900">Rastreabilidade das importações ({dossier.imports.length})</h2>
            {dossier.imports.map((batch) => (
              <article className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs" key={batch.id}>
                <p className="font-bold text-slate-900">
                  {batch.sourceType} — {batch.fileName} — {batch.status}
                </p>
                <p className="mt-0.5 text-slate-600">
                  {batch.createdAt.toISOString()} · Usuário: {batch.createdByUsuarioId ?? "Não informado"} · Aceitos: {batch.acceptedRows}/{batch.totalRows} · Rejeitados: {batch.rejectedRows}
                </p>
                <details className="mt-1.5">
                  <summary className="cursor-pointer font-semibold text-blue-700">Resumo de erros</summary>
                  <pre className="mt-1 rounded border border-slate-200 bg-white p-2 whitespace-pre-wrap">
                    {JSON.stringify(batch.errorSummary, null, 2)}
                  </pre>
                </details>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
