import Link from "next/link";
import { db } from "@/db/client";
import { readFolderEmployee, readFolderPage } from "@/db/repositories/personnel-pages/folder";
import { canViewModule, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import { attendanceRecords } from "@/db/schema/personnel-records";
import { hrEmploymentContracts, hrPayrollRuns, hrPayrollStatements, payrolls } from "@/db/schema/personnel-workforce";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { rhColumn } from "../../_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { personnelDisplayText } from "@/lib/rh/personnel-presentation";

export const dynamic = "force-dynamic";
export default async function FunctionalFolderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH"), user = context.user, database = context.database ?? db; const { id } = await params; const filters = await searchParams;
  const employee = await readFolderEmployee(database, id);
  const tabs = ["contratos", "atos", "documentos", "ocorrencias", "direitos", "ponto", "folha"];
  const tab = tabs.includes(filters.tab || "") ? filters.tab! : "contratos";
  const q = (filters.q || "").trim(); const documentsAllowed = canViewModule(user, "DOCUMENTOS") && Boolean(employee.personId);
  const { total: legacyTotal, page: legacyPage, contracts, acts, documents, occurrences, cancellations, rights } = await readFolderPage(database, { id, personId: employee.personId, tab, q, page: filters.page, documentsAllowed });
  const canceled = new Set(cancellations.map(row => row.sourceKey));
  let total = legacyTotal, page = legacyPage;
  let rows: Array<Omit<OperationalRow, "label">> = [];
  let columns = [rhColumn("reference", "Referência", 180, 110), rhColumn("description", "Descrição", 280, 150), rhColumn("details", "Detalhes", 340, 160), rhColumn("actions", "Ações", 210, 140, "actions", "right")];
  const civil = (value: Date | null) => value?.toISOString().slice(0, 10) || "—";
  if (tab === "contratos") rows = contracts.map(row => ({ id: row.id, values: { reference: row.registration, description: row.workLocation, details: `Nível ${row.salaryLevel || "não informado"} · versão ${row.version}` }, actions: <><Link href={`/rh/operacoes/contratos/${row.id}`}>Revisões</Link><Link href={`/rh/ocorrencias?contractId=${row.id}`}>Ocorrências</Link></> }));
  if (tab === "atos") rows = acts.map(row => ({ id: row.id, values: { reference: civil(row.date), description: row.type, details: row.actNumber || "Sem número" }, actions: <Link href={`/rh/atos/${row.id}/editar`}>Consultar ato</Link> }));
  if (tab === "documentos") rows = documents.map(row => ({ id: row.id, values: { reference: row.documentType, description: row.title, details: `${row.status} · validade ${civil(row.validUntil)} · ID ${row.id}` }, actions: <Link href="/documentos/ged">Consultar no GED</Link> }));
  if (tab === "ocorrencias") rows = occurrences.map(row => {
    const payload = row.payload as { input: { type: string; date: string; reason: string; contractId: string } };
    return { id: row.id, values: { reference: payload.input.date, description: `${payload.input.type} · ${row.environment}`, details: `${canceled.has(`OCORRENCIA:CANCELAMENTO:${row.id}`) ? "Cancelada" : "Registrada"} · ${payload.input.reason}` }, actions: <Link href={`/rh/ocorrencias?contractId=${payload.input.contractId}`}>Consultar histórico</Link> };
  });
  if (tab === "direitos") rows = rights.map(row => ({ id: row.id, values: { reference: row.contract.registration, description: `${row.kind} · ${civil(row.periodStart)} a ${civil(row.periodEnd)}`, details: `Quantidade ${row.quantity.toString()} · R$ ${row.amount.toFixed(2)} · ${row.sourceKey}` } }));
  if (tab === "ponto") {
    const where = and(eq(attendanceRecords.employeeId, id), q ? sql`to_char(${attendanceRecords.date},'YYYY-MM-DD') LIKE ${`%${q}%`}` : undefined);
    [{ total }] = await database.select({ total: count() }).from(attendanceRecords).where(where);
    page = Math.min(Math.max(1, Number.parseInt(filters.page || "1") || 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
    const records = await database.select().from(attendanceRecords).where(where).orderBy(desc(attendanceRecords.date), desc(attendanceRecords.id)).limit(OPERATIONAL_PAGE_SIZE).offset((page - 1) * OPERATIONAL_PAGE_SIZE);
    const time = (value: Date | null) => value ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(value) : "—";
    rows = records.map(row => ({ id: row.id, values: { reference: civil(row.date), description: `${time(row.entryTime)} a ${time(row.exitTime)} · ${row.status}`, details: `${row.hoursWorked}h trabalhadas · ${row.extraHours}h extras · ${row.bankHours}h banco · jornada ${row.contractedHours}h` }, actions: <Link href={`/rh/ponto?q=${encodeURIComponent(employee.name)}&month=${civil(row.date).slice(0, 7)}`}>Rotina de ponto</Link> }));
  }
  if (tab === "folha") {
    const where = and(eq(hrEmploymentContracts.employeeId, id), accessiblePayrollWhere(user), q ? ilike(payrolls.competence, `%${q}%`) : undefined);
    [{ total }] = await database.select({ total: count() }).from(hrPayrollStatements).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId)).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(where);
    page = Math.min(Math.max(1, Number.parseInt(filters.page || "1") || 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
    const statements = await database.select({ statement: hrPayrollStatements, run: hrPayrollRuns, competence: payrolls.competence, type: payrolls.type }).from(hrPayrollStatements).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId)).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(where).orderBy(desc(hrPayrollRuns.createdAt), desc(hrPayrollStatements.id)).limit(OPERATIONAL_PAGE_SIZE).offset((page - 1) * OPERATIONAL_PAGE_SIZE);
    columns = [rhColumn("reference", "Competência", 130, 100), rhColumn("description", "Folha / situação", 240, 130), rhColumn("details", "Bruto / descontos / líquido", 370, 180), rhColumn("actions", "Contracheque", 180, 120, "actions", "right")];
    rows = statements.map(({ statement, run, competence, type }) => ({ id: statement.id, values: { reference: competence, description: `${type} · ${run.scope} · ${run.mode} · ${run.status}`, details: `R$ ${statement.gross.toFixed(2)} / R$ ${statement.deductions.toFixed(2)} / R$ ${statement.net.toFixed(2)} · ${statement.revokedAt ? "Revogado" : statement.releaseAt && statement.releaseAt <= new Date() ? "Liberado no Portal" : "Não liberado"}` }, actions: <Link href={`/rh/operacoes/demonstrativos/${statement.id}`}>Abrir demonstrativo</Link> }));
  }
  const pathname = `/rh/pasta-funcional/${id}`;
  return <OperationalListFrame label={`Ficha de ${employee.person?.fullName || employee.name} — ${tab}`} actions={<><OperationalFilters label="Identificação"><p>{employee.person?.fullName || employee.name} · {employee.isActive ? "Ativo" : "Inativo"}</p><p>Identidade funcional: {id} · Matrícula cadastral: {employee.registration || "Não informada"}</p><p>Documentos clínicos e atestados permanecem nas rotinas de Saúde/SST com permissões próprias.</p></OperationalFilters><Link href="/rh/operacoes">Operações RH</Link><Link href={`/rh/servidores?q=${encodeURIComponent(employee.name)}`}>Cadastro do servidor</Link></>}
    toolbar={<><nav aria-label="Seções da ficha funcional" className="flex items-center gap-2 text-xs">{tabs.map(value => <Link key={value} aria-current={tab === value ? "page" : undefined} href={`${pathname}?tab=${value}`} className={tab === value ? "font-bold underline" : ""}>{value}</Link>)}</nav><form className={styles.searchForm}><input name="tab" type="hidden" value={tab} /><input aria-label="Buscar nesta seção" name="q" defaultValue={q} placeholder={tab === "ponto" ? "Data AAAA-MM" : tab === "folha" ? "Competência MM/AAAA" : "Buscar nesta seção"} className={styles.searchInput} /><button className={styles.filterButton}>Filtrar</button></form></>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname={pathname} values={{ tab, q }} />}>
    <OperationalTable preferenceId={`rh-ficha-funcional-${tab}`} caption={`Ficha funcional: ${tab}`} columns={columns} rows={rows.map(row => ({ ...row, values: Object.fromEntries(Object.entries(row.values).map(([key, value]) => [key, personnelDisplayText(String(value ?? ""))])), label: personnelDisplayText(String(row.values.description)) }))} emptyMessage={tab === "documentos" && !documentsAllowed ? "Consulta de documentos exige vínculo central e permissão GED." : "Nenhum registro nesta seção/filtro."} />
  </OperationalListFrame>;
}
