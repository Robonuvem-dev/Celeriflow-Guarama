import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AccessError, getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { listPublicRecruitmentNotices, readOwnRecruitmentApplications } from "@/lib/rh/recruitment-service";
import { RecruitmentApplicationForm } from "./ApplicationForm";
import { PortalBreadcrumb } from "@/components/portal-institucional/PortalShell";

export const dynamic = "force-dynamic";
export default async function RecruitmentPortalPage() {
  const notices = await listPublicRecruitmentNotices(prisma), now = new Date();
  const context = await getCurrentTenantContext().catch(error => { if (error instanceof AccessError) return null; throw error; });
  const applications = context ? await readOwnRecruitmentApplications(context) : [];
  return <main className="mx-auto max-w-5xl space-y-5 px-4 py-8"><PortalBreadcrumb current="Concursos e processos seletivos" /><h1 className="text-3xl font-bold">Concursos e processos seletivos</h1><p className="text-sm text-slate-600">Consulte os editais e inscreva-se com sua conta verificada. O candidato não precisa possuir vínculo de servidor.</p>
    {notices.map(notice => { const registered = applications.find(application => application.noticeRuleId === notice.id); return <section key={notice.id} className="rounded border bg-white p-5"><h2 className="text-xl font-semibold">{notice.name} · {notice.policy.kind} {notice.policy.number}</h2><p className="mt-2 whitespace-pre-wrap text-sm">{notice.policy.instructions}</p><p className="mt-3 text-xs">Inscrições: {new Date(notice.policy.startsAt).toLocaleString("pt-BR")} a {new Date(notice.policy.endsAt).toLocaleString("pt-BR")}</p><a href={`/api/portal/concursos/${notice.id}/edital`} className="mt-3 inline-block font-semibold text-emerald-800 underline">Consultar edital integral</a><ul className="mt-3 space-y-2 text-sm">{notice.policy.roles.map(role => <li key={role.code}><strong>{role.name}</strong><p>{role.requirements}</p></li>)}</ul>{registered ? <p className="mt-4 text-sm font-semibold">Inscrição {registered.number} · {registered.status}</p> : now >= new Date(notice.policy.startsAt) && now <= new Date(notice.policy.endsAt) ? context ? <RecruitmentApplicationForm noticeId={notice.id} roles={notice.policy.roles} acceptance={notice.policy.acceptance} /> : <Link href="/portal/entrar" className="mt-3 inline-block font-semibold text-emerald-800 underline">Entrar para registrar inscrição</Link> : <p className="mt-3 text-sm">Fora da janela de inscrições.</p>}</section>; })}
    {!notices.length && <p>Nenhum edital publicado.</p>}
    {context && <section className="rounded border bg-white p-5"><h2 className="text-lg font-semibold">Minhas inscrições</h2>{applications.map(application => <p key={application.id} className="mt-3 text-sm">Inscrição {application.number} · {application.status} · {application.decision || "Aguardando análise"}<a href={`/api/portal/concursos/inscricoes/${application.id}`} className="ml-3 font-semibold text-emerald-800 underline">Comprovante</a></p>)}{!applications.length && <p className="mt-3 text-sm">Nenhuma inscrição registrada.</p>}</section>}
  </main>;
}
