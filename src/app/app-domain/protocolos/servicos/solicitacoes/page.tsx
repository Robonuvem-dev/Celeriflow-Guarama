import Link from "next/link";
import { Eye } from "lucide-react";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { portalServiceRequests } from "@/db/schema/portal-services";
import { processes, processSubjects } from "@/db/schema/processes";
import { serviceQueueSubjectCondition } from "@/lib/protocols/service-queue-filters";
import { departments } from "@/db/schema/administration";
import { readPortalScheduleResources } from "@/db/repositories/portal-content/services";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { ProgramRequestsForm } from "../ProgramRequestsForm";

export const dynamic = "force-dynamic";
const columns: OperationalColumn[] = [
  ...([["protocol", "Protocolo", 160, 110], ["service", "Serviço", 290, 130], ["status", "Situação", 180, 110], ["department", "Setor", 200, 110], ["date", "Abertura", 110, 95]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 700, type: key === "status" ? "status" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ações", type: "actions", initialWidth: 75, minWidth: 65, maxWidth: 90, resizable: false, sortable: false, details: "none" },
];
export default async function ServiceQueuePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; subjectId?: string; page?: string; view?: string }> }) {
  const context = await getProtocolContext(), query = await searchParams, q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "", status = typeof query.status === "string" ? query.status : "";
  const subjectId = typeof query.subjectId === "string" ? query.subjectId.trim().slice(0, 200) : "";
  const subjects = await db.select({ id: processSubjects.id, name: processSubjects.name }).from(processSubjects).orderBy(asc(processSubjects.name));
  const where = and(protocolScopeCondition(context), q ? ilike(processes.protocolNumber, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined, status ? eq(portalServiceRequests.status, status) : undefined, serviceQueueSubjectCondition(subjectId));
  const [{ total }] = await db.select({ total: count() }).from(portalServiceRequests).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).where(where);
  const page = Math.min(Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const requestRows = await db.select({ request: portalServiceRequests, process: { protocolNumber: processes.protocolNumber, currentDepartmentId: processes.currentDepartmentId }, department: { name: departments.name } }).from(portalServiceRequests).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).leftJoin(departments, eq(departments.id, processes.currentDepartmentId)).where(where).orderBy(desc(portalServiceRequests.createdAt), asc(portalServiceRequests.id)).limit(OPERATIONAL_PAGE_SIZE).offset((page - 1) * OPERATIONAL_PAGE_SIZE);
  const requests = requestRows.map(row => ({ ...row.request, process: { ...row.process, currentDepartment: row.department } }));
  const [employees, teams, assets] = context.protocolAccess.canUpdate ? await readPortalScheduleResources(db, context.protocolAccess.isAdmin ? undefined : context.user.departmentId || "__NONE__") : [[], [], []];
  const listHref = `/protocolos/servicos/solicitacoes?${new URLSearchParams({ q, status, subjectId, page: String(page) })}`;
  if (query.view === "programar") return <main className="space-y-4 p-4"><Link href={listHref}>Voltar à fila</Link>{context.protocolAccess.canUpdate && <ProgramRequestsForm requests={requests.filter(item => !["CONCLUIDO", "CANCELADO"].includes(item.status)).map(item => ({ id: item.id, label: `${item.process.protocolNumber} — ${(item.snapshot as { name: string }).name}` }))} employees={employees} teams={teams} assets={assets.map(asset => ({ id: asset.id, name: asset.description }))} />}</main>;
  return <OperationalListFrame label="Solicitações de serviços" actions={<><Link className={styles.dialogButton} href="/protocolos/servicos">Catálogo e configuração</Link>{context.protocolAccess.canUpdate && <Link className={styles.newButton} href={`${listHref}&view=programar`}>Programar atendimento</Link>}</>}
    toolbar={<form className={styles.searchForm}><input name="q" defaultValue={q} placeholder="Protocolo…" aria-label="Protocolo" className={styles.searchInput} /><select name="status" defaultValue={status} aria-label="Situação"><option value="">Todas</option>{["RECEBIDO", "EM_ANALISE", "AGUARDANDO_COMPLEMENTO", "PROGRAMADO", "RESPONDIDO", "CONCLUIDO", "CANCELADO"].map(item => <option key={item}>{item}</option>)}</select><select name="subjectId" defaultValue={subjectId} aria-label="Assunto"><option value="">Todos os assuntos</option>{subjects.map(subject => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><button className={styles.filterButton}>Pesquisar</button><Link href="/protocolos/servicos/solicitacoes" className={styles.filterButton}>Limpar</Link></form>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/protocolos/servicos/solicitacoes" values={{ q, status, subjectId }} />}>
    <OperationalTable columns={columns} preferenceId="protocolos.servicos.solicitacoes" caption="Solicitações de serviços — origem Autoatendimento" emptyMessage="Nenhuma solicitação encontrada." rows={requests.map(request => ({ id: request.id, label: request.process.protocolNumber, values: { protocol: request.process.protocolNumber, service: (request.snapshot as { name: string }).name, status: request.status, department: request.process.currentDepartment?.name || "—", date: request.createdAt.toLocaleDateString("pt-BR") }, cells: { protocol: <Link href={`/protocolos/servicos/solicitacoes/${request.id}`}>{request.process.protocolNumber}</Link> }, actions: <Link className={styles.iconButton} aria-label={`Abrir solicitação ${request.process.protocolNumber}`} href={`/protocolos/servicos/solicitacoes/${request.id}`}><Eye /></Link> }))} />
  </OperationalListFrame>;
}
