import type { AuditEventType } from "@/lib/platform/audit-evidence";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import {
  buildAuditEventWhere,
  createAuditEventSearchParams,
  parseAuditEventQuery,
} from "@/lib/platform/audit-query";
import { getAuditEventPage } from "@/lib/platform/audit-query-service";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import {
  ErpTableContainer,
  ErpTableTd,
  ErpTableTh,
  ErpTableThead,
  ErpTableTr,
} from "@/components/app-ui/erp/ErpTable";
import { buttonVariants } from "@/components/ui/button";
import { Activity, BarChart3, Clock3, Database, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

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
  const { prisma } = await getTenantContextForModule("AUDITORIA");
  const query = parseAuditEventQuery(await searchParams);
  const where = buildAuditEventWhere(query.filters);
  const last24Hours = getLast24Hours();

  const [eventPage, total, recent, eventGroups, targetGroups] = await Promise.all([
    getAuditEventPage(prisma, query),
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.count({ where: { AND: [where, { createdAt: { gte: last24Hours } }] } }),
    prisma.auditEvent.groupBy({ by: ["eventType"], where, _count: { _all: true } }),
    prisma.auditEvent.groupBy({ by: ["targetType"], where, _count: { _all: true } }),
  ]);

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
    <PageFrame className="flex h-full min-h-0 flex-col p-2 sm:p-3">
      <PageHeader
        title="Auditoria"
        icon={<ShieldCheck className="size-4 text-amber-700" />}
        action={<span className="text-[11px] text-slate-500">Evidências imutáveis de operações autenticadas</span>}
      />

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

      <ErpListFrame
        className="min-h-[360px]"
        toolbar={
          <form method="get" role="search" className="grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:flex xl:items-center">
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
          </form>
        }
        summary={<p className="text-[11px] text-slate-600 dark:text-slate-300"><strong className="text-slate-900 dark:text-slate-100">{total.toLocaleString("pt-BR")}</strong> evento(s) no recorte selecionado</p>}
        pagination={
          <div className="flex min-h-7 items-center justify-between gap-3 text-[11px] text-slate-500">
            <span>20 eventos por página</span>
            <div className="flex gap-2">
              {eventPage.previousCursor ? (
                <Link href={`/auditoria?${createAuditEventSearchParams(query.filters, { cursor: eventPage.previousCursor, direction: "previous" })}`} className={buttonVariants({ variant: "outline", size: "xs" })}>Anterior</Link>
              ) : <span className="rounded border px-2 py-1 text-slate-300">Anterior</span>}
              {eventPage.nextCursor ? (
                <Link href={`/auditoria?${createAuditEventSearchParams(query.filters, { cursor: eventPage.nextCursor })}`} className={buttonVariants({ variant: "outline", size: "xs" })}>Próxima</Link>
              ) : <span className="rounded border px-2 py-1 text-slate-300">Próxima</span>}
            </div>
          </div>
        }
      >
        <ErpTableContainer>
          <ErpTableThead><ErpTableTr>
            <ErpTableTh className="w-[22%] sm:w-[18%]">Data/hora</ErpTableTh>
            <ErpTableTh className="w-[25%] sm:w-[22%]">Usuário</ErpTableTh>
            <ErpTableTh className="w-[38%] sm:w-[27%]">Evento</ErpTableTh>
            <ErpTableTh className="hidden w-[18%] md:table-cell">Objeto</ErpTableTh>
            <ErpTableTh className="w-[15%]">Detalhes</ErpTableTh>
          </ErpTableTr></ErpTableThead>
          <tbody>
            {eventPage.events.map((event) => (
              <ErpTableTr key={event.id}>
                <ErpTableTd className="tabular-nums">{dateFormatter.format(event.createdAt)}</ErpTableTd>
                <ErpTableTd title={event.actorUsuario.nome}>{event.actorUsuario.nome}</ErpTableTd>
                <ErpTableTd>{eventLabels[event.eventType as AuditEventType] ?? event.eventType}</ErpTableTd>
                <ErpTableTd className="hidden md:table-cell">{targetLabels[event.targetType] ?? event.targetType}</ErpTableTd>
                <ErpTableTd className="overflow-visible whitespace-normal">
                  <details>
                    <summary className="cursor-pointer font-semibold text-amber-800 underline-offset-2 hover:underline dark:text-amber-400">Ver</summary>
                    <dl className="mt-2 min-w-48 space-y-1 rounded-md border border-slate-200 bg-white p-2 text-[10px] shadow-md dark:border-slate-700 dark:bg-slate-950">
                      <div><dt className="font-semibold text-slate-500">Identificador do objeto</dt><dd className="break-all font-mono text-slate-800 dark:text-slate-200">{event.targetId}</dd></div>
                      <div><dt className="font-semibold text-slate-500">Tipo do objeto</dt><dd>{event.targetType}</dd></div>
                      <div><dt className="font-semibold text-slate-500">Perfil do ator</dt><dd>{event.actorUsuario.perfil.nome}</dd></div>
                      <div><dt className="font-semibold text-slate-500">ID da evidência</dt><dd className="break-all font-mono">{event.id}</dd></div>
                    </dl>
                  </details>
                </ErpTableTd>
              </ErpTableTr>
            ))}
            {eventPage.events.length === 0 && <ErpTableTr><ErpTableTd colSpan={5} className="py-10 text-center text-slate-500">Nenhum evento encontrado para os filtros informados.</ErpTableTd></ErpTableTr>}
          </tbody>
        </ErpTableContainer>
      </ErpListFrame>
    </PageFrame>
  );
}
