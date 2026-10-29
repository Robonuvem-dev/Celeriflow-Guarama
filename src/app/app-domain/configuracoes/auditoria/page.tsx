import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/contracts/audit";
import { buildAuditEventWhere, parseAuditEventQuery } from "@/lib/platform/audit-query";
import { and, count, desc, eq, gt, gte, or, sql } from "drizzle-orm";
import { auditEvents } from "@/db/schema/audit";
import { accessProfiles, users } from "@/db/schema/identity";
import { OperationalListFrame, OperationalFilters, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { db } from "@/db/client";
import { loadAuditUsageSummary } from "@/db/repositories/platform/audit-queries";

export const dynamic = "force-dynamic";

const columns: OperationalColumn[] = [
  { key: "date", label: "Data/hora", type: "text", initialWidth: 180, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "actor", label: "Usuário", type: "text", initialWidth: 180, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "email", label: "E-mail", type: "text", initialWidth: 200, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "event", label: "Ação", type: "text", initialWidth: 210, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "entity", label: "Entidade", type: "text", initialWidth: 120, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "target", label: "Identificador", type: "identifier", initialWidth: 240, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
];

const eventLabels: Record<string, string> = {
  SESSION_LOGIN: "Iniciou sessão", SESSION_LOGOUT: "Encerrou sessão", DOCUMENT_DOWNLOAD: "Baixou documento",
  FINANCIAL_REPORT_EXPORT: "Exportou relatório financeiro", REPORT_ISSUED: "Emitiu relatório", PAGE_VIEW: "Visualizou página",
  UI_INTERACTION: "Interagiu com controle", FORM_SUBMIT: "Enviou formulário", INSTANCE_CONFIGURATION_CHANGED: "Alterou parâmetro da instância",
  PROCESS_OPENED: "Abriu processo", PROCESS_UPDATED: "Atualizou processo", PROCESS_DOCUMENT_LINKED: "Vinculou documento ao processo",
  GED_DOCUMENT_INGESTED: "Registrou documento no GED", DOCUMENT_SIGNATURE_REQUESTED: "Solicitou assinatura interna",
  DOCUMENT_SIGNATURE_REGISTERED: "Registrou assinatura interna", PUBLIC_NOTICE_PUBLISHED: "Publicou aviso público redigido",
};

function describeTarget(event: { targetType: string; targetId: string }) {
  if (event.targetType === "PAGE") return event.targetId;
  if (event.targetType === "CONTROL") { const [path, control] = event.targetId.split("|"); return `${control === "link" ? "Link" : "Controle"} em ${path}`; }
  if (event.targetType === "FORM") return `Formulário em ${event.targetId}`;
  const labels: Record<string, string> = { SESSION: "Sessão autenticada", DOCUMENT: "Documento protegido", FINANCIAL_REPORT: "Relatório financeiro", INSTANCE_CONFIGURATION: "Parâmetro operacional", PROCESS: "Processo privado", DOCUMENT_SIGNATURE: "Assinatura de documento", PUBLIC_NOTICE: "Aviso público" };
  return labels[event.targetType] ?? event.targetType;
}

function getLast24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

export default async function AuditUsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForSystemAdministration();
  const params = await searchParams;
  const auditQuery = parseAuditEventQuery(params);
  const last24Hours = getLast24Hours();
  const database = context.database ?? db;
  const where = buildAuditEventWhere(auditQuery.filters);
  const cursorBoundary = auditQuery.cursor && !params.page ? or(
    gt(auditEvents.createdAt, auditQuery.cursor.createdAt),
    and(eq(auditEvents.createdAt, auditQuery.cursor.createdAt), auditQuery.direction === "previous" ? gt(auditEvents.id, auditQuery.cursor.id) : gte(auditEvents.id, auditQuery.cursor.id)),
  ) : undefined;
  const [[{ total, cursorPosition }], { totalEvents, eventsLast24Hours, activeUsers }] = await Promise.all([
    database.select({ total: count(), cursorPosition: cursorBoundary ? sql<number>`count(*) filter (where ${cursorBoundary})::int` : sql<number>`0` })
      .from(auditEvents).innerJoin(users, eq(auditEvents.actorUsuarioId, users.id)).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id)).where(where),
    loadAuditUsageSummary(database, last24Hours),
  ]);
  const requestedPage = params.page ? Number(params.page) : auditQuery.cursor
    ? Math.floor(Math.max(0, cursorPosition - (auditQuery.direction === "previous" ? OPERATIONAL_PAGE_SIZE : 0)) / OPERATIONAL_PAGE_SIZE) + 1 : 1;
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const eventRows = await database.select({
    id: auditEvents.id, eventType: auditEvents.eventType, targetType: auditEvents.targetType, targetId: auditEvents.targetId, createdAt: auditEvents.createdAt,
    actorName: users.nome, actorEmail: users.email,
  }).from(auditEvents).innerJoin(users, eq(auditEvents.actorUsuarioId, users.id)).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id))
    .where(where).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(OPERATIONAL_PAGE_SIZE).offset((page - 1) * OPERATIONAL_PAGE_SIZE);
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });
  const controlClass = "h-7 min-w-0 rounded border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-amber-600";

  return <OperationalListFrame label="Auditoria de uso"
      actions={<OperationalFilters label="Indicadores de uso"><p>{totalEvents} eventos · {eventsLast24Hours} nas últimas 24h · {activeUsers.length} usuários ativos</p></OperationalFilters>}
      toolbar={<>
      <form method="get" className={styles.searchForm}>
        {Object.entries(auditQuery.filters).filter(([name, value]) => name !== "targetId" && value).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <input name="targetId" defaultValue={auditQuery.filters.targetId} placeholder="Identificador exato do objeto" aria-label="Identificador exato do objeto" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button>
      </form>
      <OperationalFilters activeCount={Object.values(auditQuery.filters).filter(Boolean).length}><form method="get" className={styles.filterFields}>
        <input name="actorUsuarioId" defaultValue={auditQuery.filters.actorUsuarioId} placeholder="ID do usuário" aria-label="ID do usuário" className={controlClass} />
        <select name="eventType" defaultValue={auditQuery.filters.eventType ?? ""} aria-label="Ação" className={controlClass}><option value="">Todas as ações</option>{Object.values(auditEventTypes).map((eventType) => <option key={eventType} value={eventType}>{eventLabels[eventType] ?? eventType}</option>)}</select>
        <input name="targetType" defaultValue={auditQuery.filters.targetType} placeholder="Tipo de entidade" aria-label="Tipo de entidade" className={controlClass} />
        <input name="targetId" defaultValue={auditQuery.filters.targetId} placeholder="Identificador" aria-label="Identificador" className={controlClass} />
        <input name="from" type="date" defaultValue={auditQuery.filters.from} aria-label="Data inicial" className={controlClass} />
        <input name="to" type="date" defaultValue={auditQuery.filters.to} aria-label="Data final" className={controlClass} />
        <button type="submit" className="h-7 rounded bg-slate-900 px-3 text-xs font-semibold text-white">Filtrar</button>
        <a href="/configuracoes/auditoria" className="inline-flex h-7 items-center justify-center rounded border border-slate-300 px-3 text-xs font-semibold text-slate-700">Limpar</a>
      </form></OperationalFilters></>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname="/configuracoes/auditoria" values={auditQuery.filters} />}
    >
      <OperationalTable columns={columns} preferenceId="configuracoes-auditoria" caption="Auditoria de uso" emptyMessage="Nenhum evento encontrado." rows={eventRows.map((event) => ({ id: event.id, label: event.id, values: { date: dateFormatter.format(event.createdAt), actor: event.actorName, email: event.actorEmail, event: eventLabels[event.eventType] ?? event.eventType, entity: event.targetType, target: describeTarget(event) } }))} />
    </OperationalListFrame>;
}
