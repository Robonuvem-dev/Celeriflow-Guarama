import Link from "next/link";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { desifAdministrativeStatuses, readDesifManagement, type DesifReportFilter } from "@/lib/tributacao/desif-requirements";
import PrintReport from "../../relatorios-cadastrais/PrintReport";

export const dynamic = "force-dynamic";

const field =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600";

const reportCatalog: { id: string; title: string; req: string }[] = [
  { id: "declaracoes", title: "Relatório Gerencial das Declarações Recebidas", req: "Req. 28.70" },
  { id: "autos", title: "Relatório de Autos de Infração do ISS Bancário", req: "Req. 28.3" },
  { id: "iss", title: "Relatório de Valores do ISS por Competência / Faixa", req: "Req. 28.69" },
  { id: "contas", title: "Relatório de Contas Tributáveis Declaradas", req: "Req. 28.73" },
  { id: "omissos", title: "Relatório Gerencial dos Omissos de Declarações", req: "Req. 28.71" },
  { id: "debitos", title: "Relatório de Lançamento de Débito nas Declarações", req: "Req. 28.72" },
  { id: "estban", title: "Consulta / Relatório de Informações do ESTBAN (Mês/Ano)", req: "Req. 28.55 / 28.68" },
  { id: "comparativo-estban", title: "Relatório Comparativo Declarações DES-IF x ESTBAN", req: "Req. 28.67" },
];

const moduleOptions: { value: string; label: string }[] = [
  { value: "BALANCETE", label: "Módulo 1 — Demonstrativo Contábil (BALANCETE)" },
  { value: "APURACAO", label: "Módulo 2 — Apuração Mensal do ISSQN (APURACAO)" },
  { value: "INFORMACOES_COMUNS", label: "Módulo 3 — Informações Comuns aos Municípios (INFORMACOES_COMUNS)" },
  { value: "PARTIDAS_CONTABEIS", label: "Módulo 4 — Partidas dos Lançamentos Contábeis (PARTIDAS_CONTABEIS)" },
  { value: "TARIFAS", label: "Tarifas e Serviços Bancários (TARIFAS)" },
  { value: "APURACAO_BALANCETE_TARIFAS", label: "Lote Integrado (APURACAO_BALANCETE_TARIFAS)" },
];

const exportFormats = ["pdf", "xls", "xlsx", "doc", "docx", "txt", "csv"] as const;

export default async function DesifManagementPage({ searchParams }: { searchParams: Promise<DesifReportFilter> }) {
  const context = await getTenantContextForModule("TRIBUTACAO");
  const filter = await searchParams;
  const data = await readDesifManagement(context.database ?? db, filter);
  const downloadQuery = new URLSearchParams(
    Object.entries(filter).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""),
  );

  const buildFilterHref = (patch: Partial<DesifReportFilter>) => {
    const next = new URLSearchParams(downloadQuery);
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `/tributacao/iss-bancario/gestao?${qs}` : "/tributacao/iss-bancario/gestao";
  };

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">ISS Bancário — DES-IF (CF28)</p>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              Gestão de Declarações dos Bancos, Autos de Infração, Anexos I–VI e Relatórios Gerenciais
            </h1>
            <p className="mt-1 text-xs text-slate-600">
              Pesquisa combinada por instituição financeira, módulo ABRASF, tipo de declaração (original/retificadora), número e situação do auto de infração e intervalo de datas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PrintReport />
            <Link href="/tributacao/iss-bancario" className="cf-portal-btn">
              Recepção, Apuração e Emissão de Guia
            </Link>
            <Link href="/tributacao/iss-bancario/gestao/downloads" className="cf-portal-btn-secondary">
              Downloads e Manual (28.18–28.27)
            </Link>
          </div>
        </div>

        <nav aria-label="Atalhos de Tabelas e Cadastros Auxiliares DES-IF" className="mt-3 flex flex-wrap gap-2 border-t border-slate-200/80 pt-3 text-xs print:hidden">
          <Link href="/tributacao/referencias?catalogo=orgao-configuracao" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
            Parâmetros do Município (28.31)
          </Link>
          <Link href="/tributacao/referencias?catalogo=codigo-tributacao-desif" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
            Códigos de Tributação DES-IF (28.32)
          </Link>
          <Link href="/tributacao/referencias?catalogo=codigo-tributacao-municipal" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
            Tributação Municipal (28.33)
          </Link>
          <Link href="/tributacao/referencias?catalogo=evento-contabil" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
            Eventos Contábeis (28.34)
          </Link>
          <Link href="/tributacao/referencias?catalogo=produto-servico" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
            Outros Produtos e Serviços (28.35)
          </Link>
          <Link href="/tributacao/referencias?catalogo=titulo-desif" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
            Tabela de Títulos (28.36)
          </Link>
          <Link href="/tributacao/referencias?catalogo=tarifa-bancaria" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
            Tarifas Bancárias (28.37)
          </Link>
          <Link href="/tributacao/referencias?catalogo=tipo-dependencia" className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
            Tipos de Dependência (28.38)
          </Link>
        </nav>
      </header>

      <section className="cf-portal-card space-y-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">
            Filtros Combinados de Pesquisa — Declarações (Reqs. 28.43–28.50) e Autos de Infração (Reqs. 28.3–28.5)
          </h2>
          <Link href="/tributacao/iss-bancario/gestao" className="text-xs font-semibold text-blue-700 hover:underline">
            Limpar todos os filtros
          </Link>
        </div>

        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-semibold text-slate-700">
            Instituição Financeira (28.4 / 28.43)
            <select className={field} name="institution" defaultValue={filter.institution ?? ""}>
              <option value="">Todas as instituições financeiras</option>
              {data.institutions.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Módulo da Declaração (28.44–28.47)
            <select name="module" defaultValue={filter.module ?? ""} className={field}>
              <option value="">Todos os módulos ABRASF</option>
              {moduleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Tipo de Declaração (Original / Retificadora)
            <select name="declarationType" defaultValue={filter.declarationType ?? ""} className={field}>
              <option value="">Todas (Original e Retificadora)</option>
              <option value="ORIGINAL">Original</option>
              <option value="RETIFICADORA">Retificadora</option>
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Situação do Auto de Infração (28.5)
            <select className={field} name="status" defaultValue={filter.status ?? ""}>
              <option value="">Qualquer tipo de situação (Todas)</option>
              {desifAdministrativeStatuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Número do Auto de Infração (28.4)
            <input
              className={field}
              name="number"
              placeholder="Ex.: AI-2026/001"
              defaultValue={filter.number ?? ""}
            />
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Ano-Calendário (28.1 / 28.69)
            <input
              className={field}
              type="number"
              name="year"
              min={1900}
              max={9999}
              placeholder="Ex.: 2026"
              defaultValue={filter.year ?? ""}
            />
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Data de Início (28.4 / 28.48)
            <input className={field} type="date" name="start" defaultValue={filter.start ?? ""} />
          </label>

          <label className="text-xs font-semibold text-slate-700">
            Data de Fim (28.4 / 28.49)
            <div className="flex gap-2">
              <input className={field} type="date" name="end" defaultValue={filter.end ?? ""} />
              <button type="submit" className="cf-portal-btn mt-1 shrink-0">
                Pesquisar
              </button>
            </div>
          </label>
        </form>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-3 text-xs">
          <span className="font-semibold text-slate-600">Filtro rápido por Situação do Auto (Req. 28.5):</span>
          <Link
            href={buildFilterHref({ status: "" })}
            className={!filter.status ? "rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white" : "rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"}
          >
            Todas
          </Link>
          {desifAdministrativeStatuses.map((status) => (
            <Link
              key={status}
              href={buildFilterHref({ status })}
              className={filter.status === status ? "rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white" : "rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"}
            >
              {status}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 pt-2.5 text-xs">
          <span className="font-semibold text-slate-600">Filtro rápido por Módulo ABRASF (Reqs. 28.44–28.47):</span>
          <Link
            href={buildFilterHref({ module: "" })}
            className={!filter.module ? "rounded-md bg-slate-800 px-2.5 py-1 font-semibold text-white" : "rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"}
          >
            Todos os Módulos
          </Link>
          {[
            ["BALANCETE", "Demonstrativo Contábil (28.44)"],
            ["APURACAO", "Apuração Mensal ISSQN (28.45)"],
            ["INFORMACOES_COMUNS", "Informações Comuns (28.46)"],
            ["PARTIDAS_CONTABEIS", "Partidas dos Lançamentos (28.47)"],
          ].map(([mod, label]) => (
            <Link
              key={mod}
              href={buildFilterHref({ module: mod })}
              className={filter.module === mod ? "rounded-md bg-slate-800 px-2.5 py-1 font-semibold text-white" : "rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-100"}
            >
              {label}
            </Link>
          ))}
        </div>
      </section>

      <section className="cf-portal-card space-y-4 print:hidden">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Relatórios Gerenciais e Exportações Multiformato (PDF, XLS, XLSX, DOC, DOCX, TXT e CSV — Reqs. 28.67 a 28.73)
          </h2>
          <p className="text-xs text-slate-600">
            Exporte qualquer um dos relatórios gerenciais abaixo aplicando os filtros atuais ou informe uma faixa de valores de ISSQN.
          </p>
        </div>

        <div className="grid gap-2.5 md:grid-cols-2">
          {reportCatalog.map((report) => (
            <div
              key={report.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs"
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">{report.req}</span>
                <p className="font-bold text-slate-900">{report.title}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                {exportFormats.map((format) => (
                  <a
                    key={format}
                    href={`/tributacao/iss-bancario/gestao/exportar?${downloadQuery.toString()}${downloadQuery.toString() ? "&" : ""}report=${report.id}&format=${format}`}
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:border-blue-600 hover:text-blue-700"
                  >
                    {format.toUpperCase()}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>

        <form action="/tributacao/iss-bancario/gestao/exportar" className="grid gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 sm:grid-cols-4">
          <input type="hidden" name="report" value="iss" />
          <input type="hidden" name="institution" value={filter.institution ?? ""} />
          <input type="hidden" name="year" value={filter.year ?? ""} />
          <label className="text-xs font-semibold text-slate-800">
            Valor mínimo do ISSQN (R$ — Req. 28.69)
            <input className={field} name="minimum" type="number" min={0} step="0.01" placeholder="0.00" />
          </label>
          <label className="text-xs font-semibold text-slate-800">
            Valor máximo do ISSQN (R$ — Req. 28.69)
            <input className={field} name="maximum" type="number" min={0} step="0.01" placeholder="999999.99" />
          </label>
          <label className="text-xs font-semibold text-slate-800">
            Formato do arquivo
            <select className={field} name="format" defaultValue="pdf">
              {exportFormats.map((format) => (
                <option key={format} value={format}>
                  {format.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="cf-portal-btn w-full">
              Exportar Relatório de Valores do ISS
            </button>
          </div>
        </form>
      </section>

      <section className="cf-portal-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Declarações Recebidas dos Bancos ({data.batches.length} registro(s) — Reqs. 28.43 a 28.52 e 28.65)
            </h2>
            <p className="text-xs text-slate-600">
              Consulta com Data da Importação, Instituição Financeira, Competência, Módulo, Tipo de Declaração (Original/Retificadora), Data do Processamento, Número do Protocolo e Situação do Processamento.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="cf-portal-table w-full text-left text-xs">
            <thead>
              <tr>
                {[
                  "Data da Importação",
                  "Instituição Financeira",
                  "Competência",
                  "Módulo",
                  "Tipo de Declaração",
                  "Data do Processamento",
                  "Número do Protocolo",
                  "Situação do Processamento",
                  "Ações",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.batches.map((row) => (
                <tr key={row.id}>
                  <td className="tabular-nums">{String(row.receivedAt)}</td>
                  <td className="font-semibold text-slate-900">{row.institution}</td>
                  <td className="tabular-nums">{row.competence}</td>
                  <td>{row.moduleType}</td>
                  <td>
                    <span
                      className={
                        row.declarationType === "RETIFICADORA"
                          ? "rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900"
                          : "rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800"
                      }
                    >
                      {row.declarationType} ({row.version})
                    </span>
                  </td>
                  <td className="tabular-nums">{String(row.processedAt ?? "Não processada")}</td>
                  <td className="font-mono">{row.receipt ?? "Não emitido"}</td>
                  <td>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-800">
                      {row.status}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/tributacao/iss-bancario/gestao/declaracoes/${row.id}`}
                      className="cf-portal-btn-secondary text-xs"
                    >
                      Visualizar Declaração / Guia
                    </Link>
                  </td>
                </tr>
              ))}
              {data.batches.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-xs text-slate-500">
                    Nenhuma declaração localizada para os filtros informados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cf-portal-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Gestão de Autos de Infração Cadastrados ({data.cases.length} registro(s) — Reqs. 28.3 a 28.14)
            </h2>
            <p className="text-xs text-slate-600">
              Apresenta Número do Auto de Infração, Data do Auto de Infração, Nome da Instituição Financeira, Ano-Calendário, Valor do Auto e Situação do Auto, permitindo Visualizar, Editar, Imprimir, Alterar Situação e emitir os Anexos I a VI.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="cf-portal-table w-full text-left text-xs">
            <thead>
              <tr>
                {[
                  "Número do Auto de Infração",
                  "Data do Auto de Infração",
                  "Nome da Instituição Financeira",
                  "Ano-Calendário",
                  "Valor do Auto (R$)",
                  "Situação do Auto",
                  "Ações (Visualizar, Editar, Imprimir, Situação e Anexos I–VI)",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cases.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono font-bold text-slate-900">
                    {row.metadata.autoNumber || row.autoId || `AI-${row.id.slice(0, 8).toUpperCase()}`}
                  </td>
                  <td className="tabular-nums">{row.metadata.autoDate || String(row.createdAt).slice(0, 10)}</td>
                  <td className="font-semibold text-slate-900">{row.institution}</td>
                  <td className="tabular-nums">{row.metadata.calendarYear || row.competence.slice(0, 4)}</td>
                  <td className="font-semibold tabular-nums">R$ {row.amount ?? "0.00"}</td>
                  <td>
                    <span className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-0.5 font-bold text-blue-900">
                      {row.metadata.status || row.nativeStatus || "Início"}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/tributacao/iss-bancario/fiscalizacoes/${row.id}/auto`}
                        className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Visualizar / Imprimir Auto
                      </Link>
                      <Link
                        href={`/tributacao/iss-bancario/gestao/autos/${row.id}`}
                        className="rounded border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-800 hover:bg-blue-100"
                      >
                        Editar Auto / Contas COSIF
                      </Link>
                      <Link
                        href={`/tributacao/iss-bancario/gestao/autos/${row.id}`}
                        className="rounded border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-900 hover:bg-amber-100"
                      >
                        Alterar Situação
                      </Link>
                      <Link
                        href={`/tributacao/iss-bancario/gestao/anexos/${row.id}`}
                        className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-900 hover:bg-emerald-100"
                      >
                        Anexos I a VI
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {data.cases.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-xs text-slate-500">
                    Nenhum auto de infração localizado para os filtros informados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
