import { AlertTriangle, Archive, ClipboardList, FileBox, FileCheck2, FileText, MessageSquareWarning, Timer } from "lucide-react";
import Link from "next/link";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { getOmbudsmanContextForProtocols } from "@/lib/attendance/access";
import { ombudsmanScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { db } from "@/db/client";
import { and, count, eq, gte, inArray, lt, lte, ne, notInArray } from "drizzle-orm";
import { processes } from "@/db/schema/processes";
import { ombudsmans } from "@/db/schema/attendance-portals";
import { publicNotices } from "@/db/schema/transparency";
import { countProcesses } from "@/db/repositories/processes/listing";

export const dynamic = "force-dynamic";

export default async function ProtocolosDashboardPage() {
  const context = await getProtocolContext();
  const scope = protocolScopeCondition(context);
  const ombudsmanContext = await getOmbudsmanContextForProtocols();
  const now = new Date();
  const [totalProcesses, awaitingReceipt, inProgressProcesses, archivedProcesses, dueSoon, overdue, pendingOmbudsman, publishedProcessNotices] = await Promise.all([
    countProcesses(db, scope),
    countProcesses(db, and(scope, eq(processes.status, "Aguardando Recebimento"))),
    countProcesses(db, and(scope, inArray(processes.status, ["Recebido", "Em Analise", "Reaberto"]))),
    countProcesses(db, and(scope, eq(processes.status, "Arquivado"))),
    countProcesses(db, and(scope, gte(processes.expectedCompletionAt, now), lte(processes.expectedCompletionAt, new Date(now.getTime() + 3 * 86_400_000)), notInArray(processes.status, ["Concluido", "Arquivado", "Cancelado"]))),
    countProcesses(db, and(scope, lt(processes.expectedCompletionAt, now), notInArray(processes.status, ["Concluido", "Arquivado", "Cancelado"]))),
    db.select({ total: count() }).from(ombudsmans).where(and(ombudsmanScopeCondition(ombudsmanContext), ne(ombudsmans.status, "Concluída"))).then(rows => rows[0].total),
    db.select({ total: count() }).from(publicNotices).where(eq(publicNotices.sourceModule, "PROCESSOS")).then(rows => rows[0].total),
  ]);

  const stats = [
    { title: "Total de Processos", value: totalProcesses.toString(), icon: ClipboardList, href: "/protocolos/acompanhamento", color: "text-indigo-600", bg: "bg-indigo-100" },
    { title: "Em andamento", value: inProgressProcesses.toString(), icon: FileBox, href: "/protocolos/acompanhamento?status=Recebido", color: "text-emerald-600", bg: "bg-emerald-100" },
    { title: "Aguardando recebimento", value: awaitingReceipt.toString(), icon: FileText, href: "/protocolos/acompanhamento?status=Aguardando+Recebimento", color: "text-amber-600", bg: "bg-amber-100" },
    { title: "Arquivados", value: archivedProcesses.toString(), icon: Archive, href: "/protocolos/arquivados", color: "text-slate-600", bg: "bg-slate-100" },
    { title: "Próximos do prazo", value: dueSoon.toString(), icon: Timer, href: "/protocolos/acompanhamento?deadline=soon", color: "text-amber-600", bg: "bg-amber-100" },
    { title: "Atrasados", value: overdue.toString(), icon: AlertTriangle, href: "/protocolos/acompanhamento?deadline=overdue", color: "text-red-600", bg: "bg-red-100" },
    { title: "Ouvidoria em tratamento", value: pendingOmbudsman.toString(), icon: MessageSquareWarning, href: "/protocolos/ouvidoria", color: "text-amber-700", bg: "bg-amber-100" },
    { title: "Avisos públicos", value: publishedProcessNotices.toString(), icon: FileCheck2, href: "/portal-protocolos", color: "text-teal-700", bg: "bg-teal-100" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3">
      <ErpPageTitle
        title="Painel operacional"
        description="Visão consolidada de processos, prazos, ouvidoria e avisos públicos."
        icon={<ClipboardList className="size-5 shrink-0 text-emerald-700" />}
      />
      <Link href="/protocolos/cadastros" className="text-sm font-semibold text-emerald-800 underline">Cadastros: subassuntos, localizações, documentos, justificativas e formas de solicitação</Link>
      <Link href="/protocolos/estrutura" className="text-sm font-semibold text-emerald-800 underline">Estrutura: órgãos, unidades, setores e responsáveis</Link>
      <div className="flex flex-wrap gap-3 text-sm font-semibold"><Link href="/protocolos/servicos" className="rounded border border-emerald-300 bg-white px-4 py-2 text-emerald-800">Catálogo de serviços</Link><Link href="/protocolos/servicos/solicitacoes" className="rounded border border-emerald-300 bg-white px-4 py-2 text-emerald-800">Solicitações do Autoatendimento e programação</Link></div>
      <div className="flex flex-wrap gap-3 text-sm"><a href="/api/portal/servicos/relatorio" className="text-emerald-800 underline">Relatório integral de ocorrências</a><a href="/api/portal/servicos/relatorio?executed=1" className="text-emerald-800 underline">Relatório de serviços executados</a></div>
      {context.protocolAccess.isAdmin && <Link href="/protocolos/servicos/acessos" className="text-sm font-semibold text-emerald-800 underline">Conferir solicitações de acesso do cidadão</Link>}

      <section className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Indicadores de processos e protocolos">
        {stats.map((stat) => (
          <Link
            key={stat.title}
            href={stat.href}
            className="flex min-h-16 items-center gap-3 border border-slate-300 bg-white px-3 py-2 shadow-sm outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <div className={`flex size-8 shrink-0 items-center justify-center rounded ${stat.bg} ${stat.color}`}>
              <stat.icon className="size-4" strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{stat.title}</p>
              <p className="text-xl font-semibold leading-tight tabular-nums text-slate-900">{stat.value}</p>
              <p className="truncate text-[10px] font-medium text-emerald-800">Abrir visão</p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
