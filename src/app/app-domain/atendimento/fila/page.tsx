import Link from "next/link";
import { getAttendanceContext } from "@/lib/attendance/access";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { tickets as ticketTable } from "@/db/schema/attendance-portals";
import { listAttendanceTickets } from "@/db/repositories/attendance-portals/queries";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function FilaAtendimentoPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await searchParams;
  const context = await getAttendanceContext();
  const departmentId = context.user.departmentId;
  const where = and(context.attendanceAccess.isManager ? undefined : eq(ticketTable.departmentId, departmentId || "__sem-departamento__"), status ? eq(ticketTable.status, status) : undefined);
  const tickets = await listAttendanceTickets(db, where, { limit: 100, order: "deadline-created" });
  return (
    <PageFrame className="space-y-2">
      <PageHeader title="Fila do Setor" />
      <p className="text-xs text-slate-500">
        {context.attendanceAccess.isManager ? "Visão gerencial de todas as filas." : "Demandas encaminhadas ao seu setor."}
      </p>
      <nav className="flex flex-wrap gap-1 rounded border border-slate-300 bg-white p-1.5" aria-label="Filtrar fila por status">
        {[["", "Todas"], ["Aberto", "Novos"], ["Em Atendimento", "Em atendimento"], ["Aguardando Informação", "Aguardando informação"], ["Aguardando Recebimento", "A receber"]].map(([value, label]) => (
          <Link
            key={value}
            href={value ? `/atendimento/fila?status=${encodeURIComponent(value)}` : "/atendimento/fila"}
            className={`inline-flex h-7 items-center rounded px-2.5 text-xs font-semibold ${status === value ? "bg-violet-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <section className="grid gap-2" aria-label="Chamados na fila">
        {tickets.map((ticket) => (
          <Link key={ticket.id} href={`/atendimento/chamados/${ticket.id}`} className="rounded border border-slate-300 bg-white p-3 shadow-sm transition-colors hover:border-violet-400 hover:bg-violet-50/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm text-slate-800">{ticket.ticketNumber} · {ticket.subject}</strong>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{ticket.status}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{ticket.isAnonymous ? "Anônimo" : ticket.person?.fullName || ticket.company?.corporateName || "Não informado"} · {ticket.department?.name || "Sem setor"} · {ticket.assignee?.name || "Sem responsável"}</p>
          </Link>
        ))}
        {tickets.length === 0 && <p className="rounded border border-slate-300 bg-white p-8 text-center text-xs text-slate-500">Nenhuma demanda na fila.</p>}
      </section>
    </PageFrame>
  );
}
