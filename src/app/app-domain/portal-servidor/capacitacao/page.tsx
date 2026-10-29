import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listOwnCareerActivities } from "@/lib/portal-servidor/career-service";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { PortalOperationalList } from "../PortalOperationalList";
import { portalColumn } from "../operational-columns";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { CourseEnrollmentButton } from "./CourseEnrollmentButton";

export const dynamic = "force-dynamic";
export default async function MyTraining({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const result = await listOwnCareerActivities(access.context), now = new Date();
  const params = await searchParams;
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(result.enrollments.length / OPERATIONAL_PAGE_SIZE)));
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col"><OperationalHeaderActions><OperationalFilters label="Cursos disponíveis">
    <ErpPageTitle title="Minha capacitação" description="Cursos, treinamentos, inscrições e certificados próprios." />
    {result.courses.map(course => {
      const enrollment = result.enrollments.find(request => (request.payload as { courseId: string }).courseId === course.id);
      return <article key={course.id} className="rounded border border-slate-300 bg-white p-4"><h2 className="font-semibold">{course.name}</h2><p className="mt-1 text-xs">{new Date(course.policy.startsAt).toLocaleString("pt-BR")} a {new Date(course.policy.endsAt).toLocaleString("pt-BR")} · {course.policy.hours}h · {course.policy.location}</p><p className="mt-2 whitespace-pre-wrap text-sm">{course.policy.instructions}</p>{enrollment ? <p className="mt-3 text-xs font-semibold">Inscrição registrada · {enrollment.status}</p> : now >= new Date(course.policy.enrollmentStartsAt) && now <= new Date(course.policy.enrollmentEndsAt) ? <CourseEnrollmentButton courseId={course.id} /> : <p className="mt-3 text-xs text-slate-500">Inscrições: {new Date(course.policy.enrollmentStartsAt).toLocaleString("pt-BR")} a {new Date(course.policy.enrollmentEndsAt).toLocaleString("pt-BR")}</p>}</article>;
    })}
    {!result.courses.length && <p className="rounded border bg-white p-4 text-sm">Nenhum curso publicado para seu público.</p>}
    </OperationalFilters></OperationalHeaderActions>
    <PortalOperationalList id="capacitacao" label="Histórico de participações" page={page} total={result.enrollments.length} columns={[portalColumn("course", "Curso", 360, 140), portalColumn("date", "Inscrição", 140, 100), portalColumn("status", "Situação", 150, 100, "status"), portalColumn("actions", "Documentos", 240, 220, "actions", "right", 260)]} rows={result.enrollments.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE).map(request => ({ id: request.id, label: (request.payload as { courseName: string }).courseName, values: { course: (request.payload as { courseName: string }).courseName, date: request.createdAt.toLocaleDateString("pt-BR"), status: request.status }, actions: <div className="flex gap-2"><a href={`/api/portal-servidor/capacitacao/${request.id}/comprovante`}>Comprovante</a>{request.status === "CONCLUIDA" && <a href={`/api/portal-servidor/capacitacao/${request.id}/certificado`}>Certificado</a>}</div> }))} />
  </div>;
}
