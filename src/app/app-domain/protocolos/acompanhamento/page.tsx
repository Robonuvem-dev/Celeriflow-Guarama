import Link from "next/link";
import { Eye } from "lucide-react";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { and, asc, eq, gte, inArray, lt, lte, notInArray, type SQL } from "drizzle-orm";
import { processes as processTable } from "@/db/schema/processes";
import { departments as departmentTable } from "@/db/schema/administration";
import { countProcesses, listProcessTracking, processSearchCondition } from "@/db/repositories/processes/listing";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";
type QueryValue = string | string[] | undefined;
type SearchParams = { q?: QueryValue; status?: QueryValue; priority?: QueryValue; departmentId?: QueryValue; deadline?: QueryValue; page?: QueryValue };
type ListingFilters = { q: string; status: string; priority: string; departmentId: string; deadline: string };
function valueOf(value: QueryValue) { return (Array.isArray(value) ? value[0] : value || "").trim(); }
function listHref(filters: ListingFilters, page = 1) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (page > 1) params.set("page", String(page));
  return `/protocolos/acompanhamento?${params}`;
}
function deadlineState(expectedCompletionAt: Date | null, requestTime: Date) {
  if (!expectedCompletionAt) return "Sem prazo";
  const days = Math.ceil((expectedCompletionAt.getTime() - requestTime.getTime()) / 86_400_000);
  return days < 0 ? `${Math.abs(days)}d atrasado` : `${days}d restantes`;
}
const columns: OperationalColumn[] = [
  ...([["protocol", "Protocolo", 130, 80], ["type", "Tipo", 140, 50], ["subject", "Assunto", 200, 70], ["interested", "Interessado", 170, 80], ["department", "Setor", 140, 60], ["responsible", "Responsável", 150, 70], ["status", "Situação", 120, 60], ["deadline", "Prazo", 100, 60], ["from", "Origem da tramitação", 140, 60], ["to", "Destino da tramitação", 140, 60], ["movedAt", "Última tramitação", 110, 70]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 650, type: key === "status" ? "status" : key === "protocol" ? "identifier" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ação", type: "actions", initialWidth: 56, minWidth: 56, maxWidth: 80, resizable: false, sortable: false, details: "none" },
];
export default async function AcompanhamentoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const requestTime = new Date();
  const context = await getProtocolContext();
  const raw = await searchParams;
  const isAdmin = context.protocolAccess.isAdmin;
  const deadlineValue = valueOf(raw.deadline);
  const filters: ListingFilters = { q: valueOf(raw.q).slice(0, 120), status: valueOf(raw.status).slice(0, 80), priority: valueOf(raw.priority).slice(0, 80), departmentId: isAdmin ? valueOf(raw.departmentId).slice(0, 120) : "", deadline: ["overdue", "soon"].includes(deadlineValue) ? deadlineValue : "" };
  const requestedPage = Number.parseInt(valueOf(raw.page), 10);
  const scope = protocolScopeCondition(context);
  const conditions: (SQL | undefined)[] = [scope];
  if (filters.status) conditions.push(eq(processTable.status, filters.status));
  if (filters.priority) conditions.push(eq(processTable.priority, filters.priority));
  if (filters.departmentId) conditions.push(eq(processTable.currentDepartmentId, filters.departmentId));
  if (filters.deadline === "overdue") conditions.push(lt(processTable.expectedCompletionAt, requestTime));
  if (filters.deadline === "soon") conditions.push(and(gte(processTable.expectedCompletionAt, requestTime), lte(processTable.expectedCompletionAt, new Date(requestTime.getTime() + 3 * 86_400_000))));
  if (filters.q) conditions.push(processSearchCondition(filters.q, true));
  const where = and(...conditions);
  const [total, awaitingReceipt, active, overdue, departments] = await Promise.all([
    countProcesses(db, where),
    countProcesses(db, and(scope, eq(processTable.status, "Aguardando Recebimento"))),
    countProcesses(db, and(scope, inArray(processTable.status, ["Recebido", "Em Analise", "Reaberto"]))),
    countProcesses(db, and(scope, lt(processTable.expectedCompletionAt, requestTime), notInArray(processTable.status, ["Concluido", "Arquivado", "Cancelado"]))),
    isAdmin ? db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(eq(departmentTable.isActive, true)).orderBy(asc(departmentTable.name)) : Promise.resolve([]),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1;
  const processes = await listProcessTracking(db, where, { offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
  const returnTo = listHref(filters, page);
  return <OperationalListFrame label="Acompanhamento" actions={<OperationalFilters label="Indicadores"><p>Em andamento: {active} · Aguardando: {awaitingReceipt} · Atrasados: {overdue}</p>{!isAdmin && !context.user.departmentId && <p>Vincule o usuário a um servidor com setor para acompanhar processos.</p>}<p>Acompanhamento interno no recorte autorizado.</p></OperationalFilters>}
    toolbar={<><form action="/protocolos/acompanhamento" className={styles.searchForm}><input name="q" aria-label="Buscar protocolo, interessado ou CPF/CNPJ" defaultValue={filters.q} placeholder="Protocolo, interessado, CPF/CNPJ…" className={styles.searchInput} />{Object.entries(filters).filter(([key]) => key !== "q").map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}<button className={styles.filterButton}>Buscar</button></form><OperationalFilters activeCount={Object.entries(filters).filter(([key, value]) => key !== "q" && !!value).length}><form action="/protocolos/acompanhamento" className={styles.filterFields}><input type="hidden" name="q" value={filters.q} /><label>Situação<select name="status" defaultValue={filters.status}><option value="">Todas</option><option>Aguardando Recebimento</option><option>Recebido</option><option>Em Analise</option><option>Reaberto</option><option>Concluido</option><option>Arquivado</option></select></label><label>Prioridade<select name="priority" defaultValue={filters.priority}><option value="">Todas</option><option>Normal</option><option>Alta</option><option>Urgente</option></select></label><label>Prazo<select name="deadline" defaultValue={filters.deadline}><option value="">Todos</option><option value="soon">Até 3 dias</option><option value="overdue">Atrasados</option></select></label>{isAdmin && <label>Setor<select name="departmentId" defaultValue={filters.departmentId}><option value="">Todos</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>}<button className={styles.primaryButton}>Aplicar</button><Link href="/protocolos/acompanhamento">Limpar</Link></form></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/protocolos/acompanhamento" values={filters} />}>
    <OperationalTable columns={columns} preferenceId="protocolos.acompanhamento" caption="Status, prazos e tramitações no recorte autorizado" emptyMessage="Nenhum processo encontrado." rows={processes.map(process => { const movement = process.movements[0]; return { id: process.id, label: process.protocolNumber, values: { protocol: process.protocolNumber, type: process.processType.name, subject: process.subject.name, interested: process.person?.fullName || process.company?.corporateName || "Não informado", department: process.currentDepartment?.name || "Sem setor", responsible: process.currentResponsibleEmployee?.name || "Sem responsável", status: process.status, deadline: deadlineState(process.expectedCompletionAt, requestTime), from: movement ? movement.fromDepartment?.name || "Abertura" : "Sem movimentação", to: movement?.toDepartment.name || "—", movedAt: movement ? new Date(movement.movedAt).toLocaleDateString("pt-BR") : "—" }, actions: <Link className={styles.iconButton} aria-label={`Abrir ${process.protocolNumber}`} href={`/protocolos/processos/${process.id}?returnTo=${encodeURIComponent(returnTo)}`}><Eye /></Link> }; })} />
  </OperationalListFrame>;
}
