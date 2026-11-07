import Link from "next/link";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { readSimplesDossier } from "@/lib/tributacao/simples-dossier";
import { PrintButton } from "./PrintButton";
import { SimplesDossierClient, type SerializedDossier } from "./SimplesDossierClient";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{
    taxpayerId?: string;
    year?: string;
    recordType?: string;
    cnpjBasico?: string;
    nameQuery?: string;
  }>;
}) {
  const context = await getTenantContextForModule("TRIBUTACAO"),
    database = context.database ?? db;
  const query = await searchParams,
    year = query.year ? Number(query.year) : new Date().getUTCFullYear();
  const taxpayers = await listPageTaxpayers(database, { companyOnly: true, order: "created-asc" });

  const cnpjBasicoClean = (query.cnpjBasico ?? "").replace(/\D/g, "");
  const nameQueryClean = (query.nameQuery ?? "").trim().toLowerCase();

  const matchingTaxpayers = taxpayers.filter((row) => {
    const rowCnpjDigits = (row.company?.cnpj ?? "").replace(/\D/g, "");
    const rowName = `${row.company?.corporateName ?? ""} ${row.company?.tradeName ?? ""}`.toLowerCase();
    if (cnpjBasicoClean && !rowCnpjDigits.includes(cnpjBasicoClean)) return false;
    if (nameQueryClean && !rowName.includes(nameQueryClean)) return false;
    return true;
  });

  const selectedTaxpayerId =
    query.taxpayerId || matchingTaxpayers[0]?.id || taxpayers[0]?.id || "";
  const dossier = selectedTaxpayerId
    ? await readSimplesDossier(database, selectedTaxpayerId, year, query.recordType?.trim()).catch(() => null)
    : null;

  const serializedDossier: SerializedDossier | null = dossier
    ? (JSON.parse(JSON.stringify(dossier)) as SerializedDossier)
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
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Simples Nacional — Consulta e Dossiê Fiscal Completo por Contribuinte
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              Dossiê consolidado (a partir de 2007): Cadastro Nacional de PJ, Sócios, Períodos de Opção, Eventos, Extratos PGDAS-D, DEFIS, DASNSIMEI/DASPGMEI, Fichas Financeiras de ISSQN e RPA, Parcelamentos, Dívida Ativa, DAS (Gerados, Pagos e Inconsistentes) e Gestão DTE.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PrintButton />
            <Link href="/tributacao/simples-nacional/arquivos" className="cf-portal-btn-secondary">
              Arquivos de Opção
            </Link>
            <Link href="/tributacao/simples-nacional" className="cf-portal-btn-secondary">
              ← Painel Simples Nacional
            </Link>
          </div>
        </div>
      </header>

      <form
        action="/tributacao/simples-nacional/consulta"
        method="get"
        className="cf-portal-form grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs print:hidden sm:grid-cols-6"
      >
        <label className="sm:col-span-2">
          Contribuinte (CNPJ — Razão Social)
          <select
            name="taxpayerId"
            defaultValue={selectedTaxpayerId}
            className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
          >
            <option value="">Selecione</option>
            {(matchingTaxpayers.length > 0 ? matchingTaxpayers : taxpayers).map((row) => (
              <option value={row.id} key={row.id}>
                {row.company?.cnpj} — {row.company?.corporateName}
              </option>
            ))}
          </select>
        </label>
        <label>
          CNPJ Básico (8 dígitos) / CNPJ
          <input
            name="cnpjBasico"
            defaultValue={query.cnpjBasico ?? ""}
            placeholder="Ex.: 12345678"
            className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
          />
        </label>
        <label>
          Nome / Razão Social (ou parte)
          <input
            name="nameQuery"
            defaultValue={query.nameQuery ?? ""}
            placeholder="Parte da Razão Social…"
            className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
          />
        </label>
        <label>
          Ano-calendário (≥ 2007)
          <input
            name="year"
            type="number"
            min={2007}
            max={new Date().getUTCFullYear() + 1}
            defaultValue={year}
            required
            className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
          />
        </label>
        <label>
          Tipo de registro
          <input
            name="recordType"
            defaultValue={query.recordType ?? ""}
            placeholder="Todos, PGDAS, DEFIS, DASNSIMEI, PGFN…"
            className="mt-1 block w-full rounded-lg border border-slate-300 p-2"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-6">
          <button className="cf-portal-btn">Consultar Dossiê Fiscal</button>
          {(query.cnpjBasico || query.nameQuery || query.recordType) && (
            <Link href="/tributacao/simples-nacional/consulta" className="cf-portal-btn-secondary">
              Limpar Filtros
            </Link>
          )}
        </div>
      </form>

      <p className="rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5 text-xs text-blue-950">
        Consulta consolidada do Dossiê Fiscal do contribuinte a partir do exercício de 2007 ou início da atividade. Exportação integral em PDF, XLSX, XLS, DOCX, DOC, TXT, CSV (incluindo Receita Bruta, RBT12, Fator R e Folha Salarial — Req. 27.153) e JSON.
      </p>

      {dossier && serializedDossier && (
        <>
          <div className="cf-portal-card flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {dossier.taxpayer.company?.corporateName} — {dossier.taxpayer.company?.cnpj} (Ano-Calendário {year})
              </h2>
              <p className="text-xs text-slate-500">
                Exporte o Relatório de Dossiê Fiscal e a Receita Bruta PGDAS-D nos formatos oficiais abaixo:
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["pdf", "xlsx", "xls", "docx", "doc", "txt", "csv", "json"].map((format) => (
                <a
                  key={format}
                  className="cf-portal-btn-secondary"
                  href={`/api/tributacao/simples/consulta?${download}&format=${format}`}
                >
                  Baixar {format.toUpperCase()}
                </a>
              ))}
            </div>
          </div>

          <SimplesDossierClient dossier={serializedDossier} downloadQuery={download.toString()} />

          <div className="grid gap-4 lg:grid-cols-2">
            <Evidence title="Cadastro municipal / CNPJ e endereços (Evidência Persistida)" rows={[dossier.taxpayer, ...dossier.addresses, ...dossier.registrations]} />
            <Evidence title="Rateios de pagamentos DAF607 (Evidência Persistida)" rows={dossier.payments} />
            <Evidence title="Malhas fiscais e regularização (Evidência Persistida)" rows={dossier.divergences} />
            <Evidence title="Preparações de exclusão e comunicações DTE (Evidência Persistida)" rows={[...dossier.exclusions, ...dossier.communications]} />
          </div>
        </>
      )}
    </main>
  );
}
