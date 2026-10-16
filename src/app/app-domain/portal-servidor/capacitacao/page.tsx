import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listOwnCareerActivities } from "@/lib/portal-servidor/career-service";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { CourseEnrollmentButton } from "./CourseEnrollmentButton";

export const dynamic = "force-dynamic";
export default async function MyTraining({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Acesso funcional indisponível.</p>;
  const result = await listOwnCareerActivities(access.context), now = new Date();
  const params = await searchParams;
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(result.enrollments.length / 20)));
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
    <ErpPageTitle title="Minha capacitação" description="Cursos, treinamentos, inscrições e certificados próprios." />
    {result.courses.map(course => {
      const enrollment = result.enrollments.find(request => (request.payload as { courseId: string }).courseId === course.id);
      return <article key={course.id} className="rounded border border-slate-300 bg-white p-4"><h2 className="font-semibold">{course.name}</h2><p className="mt-1 text-xs">{new Date(course.policy.startsAt).toLocaleString("pt-BR")} a {new Date(course.policy.endsAt).toLocaleString("pt-BR")} · {course.policy.hours}h · {course.policy.location}</p><p className="mt-2 whitespace-pre-wrap text-sm">{course.policy.instructions}</p>{enrollment ? <p className="mt-3 text-xs font-semibold">Inscrição registrada · {enrollment.status}</p> : now >= new Date(course.policy.enrollmentStartsAt) && now <= new Date(course.policy.enrollmentEndsAt) ? <CourseEnrollmentButton courseId={course.id} /> : <p className="mt-3 text-xs text-slate-500">Inscrições: {new Date(course.policy.enrollmentStartsAt).toLocaleString("pt-BR")} a {new Date(course.policy.enrollmentEndsAt).toLocaleString("pt-BR")}</p>}</article>;
    })}
    {!result.courses.length && <p className="rounded border bg-white p-4 text-sm">Nenhum curso publicado para seu público.</p>}
    <h2 className="text-sm font-semibold">Histórico de participações</h2>
    <ErpListFrame summary={<p className="text-xs">{result.enrollments.length} inscrições</p>} pagination={<ErpPagination page={page} total={result.enrollments.length} pageSize={20} label="inscrições" previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} />}>
      <table className="w-full text-left text-xs"><thead><tr><th className="p-2">Curso</th><th>Inscrição</th><th>Situação</th><th>Documentos</th></tr></thead><tbody>{result.enrollments.slice((page - 1) * 20, page * 20).map(request => <tr key={request.id} className="border-t"><td className="p-2">{(request.payload as { courseName: string }).courseName}</td><td>{request.createdAt.toLocaleDateString("pt-BR")}</td><td>{request.status}</td><td><a href={`/api/portal-servidor/capacitacao/${request.id}/comprovante`} className="mr-3 font-semibold text-emerald-800 underline">Comprovante</a>{request.status === "CONCLUIDA" && <a href={`/api/portal-servidor/capacitacao/${request.id}/certificado`} className="font-semibold text-emerald-800 underline">Certificado</a>}</td></tr>)}</tbody></table>
      {!result.enrollments.length && <p className="p-4 text-sm">Nenhuma inscrição registrada.</p>}
    </ErpListFrame>
  </div>;
}
