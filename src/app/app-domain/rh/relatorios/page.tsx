import Link from "next/link";
import { db } from "@/db/client";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { buildHrReport, hrReportInputSchema } from "@/lib/rh/report-service";
import { personnelReportPresentation } from "@/lib/rh/personnel-presentation";
import { hrReportCatalog } from "@/lib/rh/report-catalog";
import { operationalReportKinds } from "@/lib/rh/operational-reports";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../_components/operational-columns";
import { ReferenceLookup } from "../operacoes/ReferenceLookup";

export const dynamic = "force-dynamic";
type Params = Record<string, string | undefined>;

export default async function PersonnelReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  const params: Params = Object.fromEntries(Object.entries(await searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const reportCode = params.report ?? params.poc;
  const selected = reportCode ? hrReportCatalog.find(item => item.id === Number(reportCode)) : hrReportCatalog.find(item => item.kind === params.kind);
  if (selected?.kind) { params.kind = selected.kind; params.report = String(selected.id); }
  if (params.kind === "INFORME_ANUAL_POC" && !params.year) params.year = String(new Date().getUTCFullYear() - 1);
  const extended = (operationalReportKinds as readonly string[]).includes(params.kind ?? "");
  const values = Object.fromEntries(Object.entries(params).filter(([key, entry]) => entry && key !== "page" && key !== "poc" && !(params.report && key === "kind"))) as Record<string, string>;
  let report: Awaited<ReturnType<typeof buildHrReport>> | null = null;
  let error = "";
  if (params.kind) {
    const parsed = hrReportInputSchema.safeParse({ ...Object.fromEntries(Object.entries(values).filter(([, entry]) => entry)), kind: params.kind, format: "PDF" });
    if (!parsed.success) error = "Confira a modalidade e os filtros informados.";
    else {
      try { report = personnelReportPresentation(await buildHrReport(context.database ?? db, parsed.data, accessiblePayrollWhere(context.user), isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds)); }
      catch (cause) { error = cause instanceof Error ? cause.message : "Não foi possível preparar o relatório."; }
    }
  }
  const catalog = hrReportCatalog.filter(item => !params.q || `${item.id} ${item.name}`.toLocaleLowerCase("pt-BR").includes(params.q.toLocaleLowerCase("pt-BR")));
  const total = params.kind ? report?.rows.length ?? 0 : catalog.length;
  const requestedPage = Number(params.page ?? 1);
  const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const offset = (page - 1) * OPERATIONAL_PAGE_SIZE;
  const catalogColumns = [rhColumn("number", "Código", 70, 55, "identifier"), rhColumn("name", "Relatório", 350, 180), rhColumn("phase", "Grupo", 70, 60), rhColumn("status", "Situação", 360, 170), rhColumn("actions", "Consulta", 100, 90, "actions")];
  // Composite content stays complete in the shared overflow detail, without hiding export columns.
  const reportColumns = [rhColumn("number", "Registro", 75, 60, "identifier"), rhColumn("first", report?.headers[0] ?? "Identificação", 230, 120), rhColumn("second", report?.headers[1] ?? "Contexto", 200, 110), rhColumn("contents", "Demais campos — conteúdo integral", 600, 200)];
  const rows = params.kind ? (report?.rows ?? []).slice(offset, offset + OPERATIONAL_PAGE_SIZE).map((row, index) => ({
    id: `${params.kind}:${offset + index}`, label: row.join(" · "), values: { number: String(offset + index + 1), first: row[0] ?? "", second: row[1] ?? "", contents: row.slice(2).map((entry, column) => `${report!.headers[column + 2]}: ${entry}`).join(" · ") },
  })) : catalog.slice(offset, offset + OPERATIONAL_PAGE_SIZE).map(item => ({
    id: `poc-${item.id}`, label: item.name,
    values: { number: String(item.id), name: item.name, phase: String(item.phase), status: item.kind ? "Disponível" : "Indisponível" },
    actions: item.kind ? <Link href={`/rh/relatorios?report=${item.id}`}>Consultar</Link> : <span>Pendente</span>,
  }));
  return <OperationalListFrame label={report?.title ?? "Relatórios de RH"}
    actions={<><Link href="/rh/relatorios">Catálogo dos 74 itens</Link>{report && ["PDF", "XLSX", "CSV", ...(report.print?.kind === "matrix132" ? ["TXT"] : [])].map(format => <a key={format} href={`/api/rh/relatorios?${new URLSearchParams({ ...values, format })}`}>{format} integral</a>)}</>}
    toolbar={<>
      <form className={styles.searchForm} action="/rh/relatorios">
        <select name="report" aria-label="Modalidade de relatório" defaultValue={params.report ?? ""} className={styles.searchInput}><option value="">Catálogo dos 74 itens</option>{hrReportCatalog.filter(item => item.kind).map(item => <option key={item.id} value={item.id}>{item.id}. {item.name}</option>)}</select>
        <button className={styles.filterButton}>Abrir</button>
      </form>
      {params.kind !== "INFORME_ANUAL_POC" && <form className={styles.searchForm} action="/rh/relatorios">
        {Object.entries(values).filter(([key]) => key !== "q").map(([key, entry]) => <input key={key} type="hidden" name={key} value={entry} />)}
        <input name="q" aria-label={params.kind ? "Buscar no relatório" : "Buscar relatório"} defaultValue={params.q} placeholder={params.kind ? "Nome, matrícula ou descrição" : "Nome ou código do relatório"} className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button>
      </form>}
      {params.kind && <OperationalFilters label="Período e critérios"><form action="/rh/relatorios" className={styles.filterFields}>
        {params.report ? <input type="hidden" name="report" value={params.report} /> : <input type="hidden" name="kind" value={params.kind} />}<input type="hidden" name="q" value={params.q ?? ""} />
        {extended ? <><label>De <input type="date" name="from" defaultValue={params.from} /></label><label>Até <input type="date" name="until" defaultValue={params.until} /></label><label>Referência cadastral <input type="date" name="referenceDate" defaultValue={params.referenceDate} /></label><label>Mês de aniversário <input type="number" min="1" max="12" name="month" defaultValue={params.month} /></label></> : params.kind === "INFORME_ANUAL_POC" ? <label>Ano de pagamento <input name="year" type="number" min="1900" max="2200" defaultValue={params.year ?? "2026"} /></label> : params.kind.startsWith("CADASTRO_") ? <label>Referência cadastral <input type="date" name="referenceDate" defaultValue={params.referenceDate} /></label> : params.kind !== "CONTRATOS" ? <label>Competência <input name="competence" placeholder="MM/AAAA" defaultValue={params.competence} /></label> : <p>Esta modalidade utiliza a última revisão contratual cadastrada.</p>}
        {extended && <><label>Competência (opcional) <input name="competence" placeholder="MM/AAAA" defaultValue={params.competence} /></label><label>Totalizadores contábeis <input name="totalizers" placeholder="BRUTO,DESCONTOS,LIQUIDO,ENCARGOS" defaultValue={params.totalizers} /></label></>}
        {params.kind === "INFORME_ANUAL_POC" && <label>Servidor (opcional)<ReferenceLookup kind="employee" name="employeeId" initialValue={params.employeeId} /></label>}
        {Object.entries(values).filter(([key]) => ["employeeId", "departmentId", "payrollId", "labelColumns", "labelHeight", "labelMargin", "labelFields"].includes(key) && !(params.kind === "INFORME_ANUAL_POC" && key === "employeeId")).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        <button className={styles.primaryButton}>Aplicar critérios</button><Link href={`/rh/relatorios?report=${params.report}`}>Limpar critérios</Link>
      </form></OperationalFilters>}
      {report?.print?.kind === "labels" && <OperationalFilters label="Modelo de etiquetas"><form action="/rh/relatorios" className={styles.filterFields}>
        {Object.entries(values).filter(([key]) => !["labelColumns", "labelHeight", "labelMargin", "labelFields"].includes(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        <label>Colunas por página <input name="labelColumns" type="number" min="1" max="3" defaultValue={params.labelColumns ?? "2"} /></label>
        <label>Altura em pontos <input name="labelHeight" type="number" min="70" max="300" defaultValue={params.labelHeight ?? "140"} /></label>
        <label>Margens em pontos <input name="labelMargin" type="number" min="10" max="50" defaultValue={params.labelMargin ?? "28"} /></label>
        <label>Campos separados por vírgula <input name="labelFields" defaultValue={params.labelFields} placeholder="name,registration,role,department" /></label>
        <p>Campos: name, registration, role, department, birthday, period, monthly. O PDF mantém o texto integral.</p><button className={styles.primaryButton}>Aplicar modelo</button>
      </form></OperationalFilters>}
      {params.kind === "EVENTOS_VARIAVEIS_PLANILHA" && <Link href="/rh/operacoes?tab=movimentos">Lançar eventos ou conferir/importar CSV por lote</Link>}
      {error && <span role="alert">{error}</span>}
    </>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/rh/relatorios" values={values} />}>
    <OperationalTable preferenceId={params.kind ? `rh-relatorio-${params.kind}` : "rh-relatorios-catalogo-poc"} columns={params.kind ? reportColumns : catalogColumns} rows={rows} caption={report?.title ?? "Catálogo rastreável dos relatórios de RH"} state={error ? "error" : "ready"} errorMessage={error} emptyMessage="Nenhum registro para os critérios informados." />
  </OperationalListFrame>;
}
