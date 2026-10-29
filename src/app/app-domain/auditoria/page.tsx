import type { AuditEventType } from "@/lib/contracts/audit";
import { auditEventTypes } from "@/lib/contracts/audit";
import {
  buildAuditEventWhere,
  parseAuditEventQuery,
} from "@/lib/platform/audit-query";
import { and, count, desc, eq, gt, gte, or, sql } from "drizzle-orm";
import { auditEvents } from "@/db/schema/audit";
import { accessProfiles, users } from "@/db/schema/identity";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { OperationalListFrame, OperationalFilters, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { buttonVariants } from "@/components/ui/button";
import { Activity, BarChart3, Clock3, Database, Search } from "lucide-react";
import Link from "next/link";
import { db } from "@/db/client";
import { loadAuditEventSummary } from "@/db/repositories/platform/audit-queries";

export const dynamic = "force-dynamic";

const columns: OperationalColumn[] = [
  { key: "date", label: "Data/hora", type: "text", initialWidth: 180, minWidth: 150, resizable: true, sortable: false, details: "overflow" },
  { key: "actor", label: "Usuário", type: "text", initialWidth: 170, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "event", label: "Evento", type: "text", initialWidth: 220, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "object", label: "Objeto", type: "text", initialWidth: 150, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "targetId", label: "ID do objeto", type: "identifier", initialWidth: 180, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "targetType", label: "Tipo do objeto", type: "identifier", initialWidth: 150, minWidth: 105, resizable: true, sortable: false, details: "overflow" },
  { key: "profile", label: "Perfil do ator", type: "text", initialWidth: 150, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "id", label: "ID da evidência", type: "identifier", initialWidth: 180, minWidth: 115, resizable: true, sortable: false, details: "overflow" },
];

type AuditSearchParams = Record<string, string | string[] | undefined>;

const eventLabels: Record<AuditEventType, string> = {
  SESSION_LOGIN: "Início de sessão",
  SESSION_LOGOUT: "Encerramento de sessão",
  DOCUMENT_DOWNLOAD: "Download de documento",
  FINANCIAL_REPORT_EXPORT: "Exportação de relatório financeiro",
  REPORT_ISSUED: "Emissão de relatório",
  PAGE_VIEW: "Visualização de página",
  UI_INTERACTION: "Interação com controle",
  FORM_SUBMIT: "Envio de formulário",
  INSTANCE_CONFIGURATION_CHANGED: "Alteração de configuração",
  INTERNAL_NOTIFICATION_CREATED: "Criação de notificação interna",
  INTERNAL_NOTIFICATION_READ: "Leitura de notificação interna",
  PERSON_MERGE_PROPOSED: "Proposição de unificação de pessoa",
  PERSON_MERGE_EXECUTED: "Execução de unificação de pessoa",
  PERSON_MERGE_REVERSED: "Reversão de unificação de pessoa",
  ADMINISTRATIVE_MUTATION: "Operação administrativa",
  PROCESS_OPENED: "Abertura de processo",
  PROCESS_UPDATED: "Atualização de processo",
  PROCESS_DOCUMENT_LINKED: "Vinculação de documento ao processo",
  GED_DOCUMENT_INGESTED: "Registro de documento no GED",
  DOCUMENT_SIGNATURE_REQUESTED: "Solicitação de assinatura",
  DOCUMENT_SIGNATURE_REGISTERED: "Registro de assinatura",
  PUBLIC_NOTICE_PUBLISHED: "Publicação de aviso público",
  STOCK_MANUALLY_ADJUSTED: "Ajuste manual de estoque",
  STOCK_RETURNED: "Devolução de estoque",
  STOCK_MOVEMENT_REVERSED: "Estorno de movimentação de estoque",
  ASSET_ACQUIRED_FROM_RECEIPT: "Aquisição patrimonial por recebimento",
  INTERNAL_CONTROL_FINDING_REGISTERED: "Registro de apontamento de controle",
  FLEET_OPERATION_REGISTERED: "Registro de operação de frota",
};

const targetLabels: Record<string, string> = {
  CONTROL: "Controle de interface",
  DOCUMENT: "Documento",
  DOCUMENT_SIGNATURE: "Assinatura de documento",
  FINANCIAL_REPORT: "Relatório financeiro",
  FORM: "Formulário",
  INSTANCE_CONFIGURATION: "Configuração da instância",
  PAGE: "Página",
  PROCESS: "Processo",
  PUBLIC_NOTICE: "Aviso público",
  SESSION: "Sessão",
};

function distributionRows<T extends { _count: { _all: number } }>(rows: T[]) {
  const ordered = [...rows].sort((a, b) => b._count._all - a._count._all);
  const visible = ordered.slice(0, 6);
  const otherCount = ordered.slice(6).reduce((total, row) => total + row._count._all, 0);
  return { visible, otherCount };
}

function getLast24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

function Distribution({
  title,
  rows,
  label,
}: {
  title: string;
  rows: { key: string; count: number }[];
  label: (key: string) => string;
}) {
  const maximum = rows[0]?.count ?? 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
        <BarChart3 className="size-3.5 text-amber-700" />
        {title}
      </h2>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="mb-0.5 flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate text-slate-600 dark:text-slate-300" title={label(row.key)}>{label(row.key)}</span>
              <strong className="shrink-0 tabular-nums text-slate-900 dark:text-slate-100">{row.count}</strong>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${maximum ? Math.max(4, (row.count / maximum) * 100) : 0}%` }} />
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="py-4 text-center text-[11px] text-slate-500">Sem dados no recorte.</p>}
      </div>
    </section>
  );
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<AuditSearchParams>;
}) {
  const context = await getTenantContextForModule("AUDITORIA");
  const params = await searchParams;
  const query = parseAuditEventQuery(params);
  const last24Hours = getLast24Hours();

  const database = context.database ?? db;
  const where = buildAuditEventWhere(query.filters);
  // URLs antigas por cursor são localizadas por contagem real na mesma ordem.
  // A navegação nova usa páginas/offset e não armazena contadores acumulados na URL.
  const cursorBoundary = query.cursor && !params.page ? or(
    gt(auditEvents.createdAt, query.cursor.createdAt),
    and(eq(auditEvents.createdAt, query.cursor.createdAt), query.direction === "previous" ? gt(auditEvents.id, query.cursor.id) : gte(auditEvents.id, query.cursor.id)),
  ) : undefined;
  const [[{ total, cursorPosition }], { recent, eventGroups, targetGroups }] = await Promise.all([
    database.select({ total: count(), cursorPosition: cursorBoundary ? sql<number>`count(*) filter (where ${cursorBoundary})::int` : sql<number>`0` })
      .from(auditEvents).innerJoin(users, eq(auditEvents.actorUsuarioId, users.id)).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id)).where(where),
    loadAuditEventSummary(database, query.filters, last24Hours),
  ]);
  const requestedPage = params.page ? Number(params.page) : query.cursor
    ? Math.floor(Math.max(0, cursorPosition - (query.direction === "previous" ? OPERATIONAL_PAGE_SIZE : 0)) / OPERATIONAL_PAGE_SIZE) + 1 : 1;
  const page = Math.min(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const eventRows = await database.select({
    id: auditEvents.id, eventType: auditEvents.eventType, targetType: auditEvents.targetType, targetId: auditEvents.targetId, createdAt: auditEvents.createdAt,
    actorName: users.nome, profileName: accessProfiles.nome,
  }).from(auditEvents).innerJoin(users, eq(auditEvents.actorUsuarioId, users.id)).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id))
    .where(where).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(OPERATIONAL_PAGE_SIZE).offset((page - 1) * OPERATIONAL_PAGE_SIZE);

  const events = distributionRows(eventGroups);
  const targets = distributionRows(targetGroups);
  const eventDistribution = [
    ...events.visible.map((row) => ({ key: row.eventType, count: row._count._all })),
    ...(events.otherCount ? [{ key: "OTHER", count: events.otherCount }] : []),
  ];
  const targetDistribution = [
    ...targets.visible.map((row) => ({ key: row.targetType, count: row._count._all })),
    ...(targets.otherCount ? [{ key: "OTHER", count: targets.otherCount }] : []),
  ];
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" });
  const controlClass = "h-8 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-amber-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  return (
    <OperationalListFrame label="Auditoria" actions={<OperationalFilters label="Indicadores e distribuições">
      <div className="mb-2 grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { label: "Eventos no recorte", value: total, icon: Database },
          { label: "Nas últimas 24 horas", value: recent, icon: Clock3 },
          { label: "Tipos de evento", value: eventGroups.length, icon: Activity },
          { label: "Tipos de objeto", value: targetGroups.length, icon: BarChart3 },
        ].map((indicator) => (
          <div key={indicator.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{indicator.label}</p>
              <indicator.icon className="size-3.5 text-amber-700" />
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">{indicator.value.toLocaleString("pt-BR")}</p>
          </div>
        ))}
      </div>

      <div className="mb-2 grid shrink-0 gap-2 lg:grid-cols-2">
        <Distribution
          title="Distribuição por evento"
          rows={eventDistribution}
          label={(key) => key === "OTHER" ? "Outros" : eventLabels[key as AuditEventType] ?? key}
        />
        <Distribution
          title="Distribuição por tipo de objeto"
          rows={targetDistribution}
          label={(key) => key === "OTHER" ? "Outros" : targetLabels[key] ?? key}
        />
      </div>

      <p className="mb-2 shrink-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        Módulo e resultado não são campos das evidências atuais e, por segurança, não são inferidos nesta visão.
      </p>

      </OperationalFilters>}
        toolbar={<>
          <form method="get" role="search" className={styles.searchForm}>
            {Object.entries(query.filters).filter(([name, value]) => name !== "targetId" && value).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
            <input name="targetId" defaultValue={query.filters.targetId} placeholder="Identificador exato do objeto" aria-label="Identificador exato do objeto" className={styles.searchInput} /><button className={styles.filterButton}>Buscar</button>
          </form>
          <OperationalFilters activeCount={Object.values(query.filters).filter(Boolean).length}>
          <form method="get" className={styles.filterFields}>
            <input name="actorUsuarioId" defaultValue={query.filters.actorUsuarioId} placeholder="ID do usuário" aria-label="ID do usuário" className={controlClass} />
            <select name="eventType" defaultValue={query.filters.eventType ?? ""} aria-label="Tipo de evento" className={controlClass}>
              <option value="">Todos os eventos</option>
              {Object.values(auditEventTypes).map((eventType) => <option key={eventType} value={eventType}>{eventLabels[eventType]}</option>)}
            </select>
            <input name="targetType" defaultValue={query.filters.targetType} placeholder="Tipo de objeto" aria-label="Tipo de objeto" className={controlClass} />
            <input name="targetId" defaultValue={query.filters.targetId} placeholder="Identificador exato" aria-label="Identificador exato do objeto" className={controlClass} />
            <input name="from" type="date" defaultValue={query.filters.from} aria-label="Data inicial" className={controlClass} />
            <input name="to" type="date" defaultValue={query.filters.to} aria-label="Data final" className={controlClass} />
            <button type="submit" className={buttonVariants({ size: "sm", className: "h-8" })}><Search className="size-3.5" />Filtrar</button>
            <Link href="/auditoria" className={buttonVariants({ variant: "outline", size: "sm", className: "h-8" })}>Limpar</Link>
          </form></OperationalFilters>
        </>}
        pagination={<OperationalLinkPagination page={page} total={total} pathname="/auditoria" values={query.filters} />}
      >
        <OperationalTable columns={columns} preferenceId="auditoria-evidencias" caption="Evidências de auditoria" emptyMessage="Nenhum evento encontrado para os filtros informados." rows={eventRows.map((event) => ({
          id: event.id, label: event.id,
          values: { date: dateFormatter.format(event.createdAt), actor: event.actorName, event: eventLabels[event.eventType as AuditEventType] ?? event.eventType, object: targetLabels[event.targetType] ?? event.targetType, targetId: event.targetId, targetType: event.targetType, profile: event.profileName, id: event.id },
        }))} />
    </OperationalListFrame>
  );
}
