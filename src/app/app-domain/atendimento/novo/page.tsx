import { ArrowLeft, Headphones } from "lucide-react";
import Link from "next/link";
import { getAttendanceContext, getAttendanceRegistrationIssue } from "@/lib/attendance/access";
import { createTicket } from "../actions";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import NovoChamadoForm from "./NovoChamadoForm";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { supportChannels, serviceSubjects } from "@/db/schema/attendance-portals";
import { departments as departmentTable } from "@/db/schema/administration";

export const dynamic = "force-dynamic";

export default async function NovoChamadoPage() {
  const context = await getAttendanceContext("edit");
  const registrationIssue = await getAttendanceRegistrationIssue(context);
  if (registrationIssue) {
    return (
      <PageFrame className="max-w-4xl space-y-2">
        <PageHeader title="Novo Atendimento" icon={<Headphones className="size-4 shrink-0 text-violet-600" />} action={<Link href="/atendimento/central" className="inline-flex h-7 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="size-3.5" />Voltar</Link>} />
        <section role="alert" className="space-y-2 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-semibold">Vínculo operacional necessário</h2>
          <p>{registrationIssue}</p>
          {context.attendanceAccess.isAdmin ? (
            <p>A conta técnica de administrador é gerenciada automaticamente. Para registrar chamados, utilize um usuário operacional com permissão de criação em Atendimento, vinculado ao servidor responsável. Em Configurações → Usuários, configure o campo Servidor vinculado desse usuário; o servidor e seu departamento devem estar ativos.</p>
          ) : (
            <p>Em Configurações → Usuários, um administrador deve editar seu usuário e selecionar o servidor responsável no campo Servidor vinculado. O servidor e seu departamento devem estar ativos. Depois, retorne a esta tela para abrir o chamado.</p>
          )}
          {context.attendanceAccess.isAdmin && <Link href="/configuracoes/usuarios" className="inline-block font-semibold underline">Abrir cadastro de usuários</Link>}
        </section>
      </PageFrame>
    );
  }
  const [channels, departments, subjects] = await Promise.all([
    db.select().from(supportChannels).where(eq(supportChannels.isActive, true)).orderBy(asc(supportChannels.sortOrder), asc(supportChannels.name)),
    db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(eq(departmentTable.isActive, true)).orderBy(asc(departmentTable.name)),
    db.select({ id: serviceSubjects.id, name: serviceSubjects.name, defaultDepartmentId: serviceSubjects.defaultDepartmentId, defaultPriority: serviceSubjects.defaultPriority, defaultDueDays: serviceSubjects.defaultDueDays }).from(serviceSubjects).where(eq(serviceSubjects.isActive, true)).orderBy(asc(serviceSubjects.name)),
  ]);

  return (
    <PageFrame className="max-w-4xl space-y-2">
      <PageHeader title="Novo Atendimento" icon={<Headphones className="size-4 shrink-0 text-violet-600" />} action={<Link href="/atendimento/central" className="inline-flex h-7 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="size-3.5" />Voltar</Link>} />
      <NovoChamadoForm channels={channels} departments={departments} subjects={subjects} createTicketAction={createTicket} />
    </PageFrame>
  );
}
