import { ArrowLeft, Headphones } from "lucide-react";
import Link from "next/link";
import { getAttendanceContext } from "@/lib/attendance/access";
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
  await getAttendanceContext("edit");
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
