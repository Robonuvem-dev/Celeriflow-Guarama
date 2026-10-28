import Link from "next/link";
import { z } from "zod";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { recruitmentNoticeSchema } from "@/lib/rh/recruitment-service";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { RecruitmentNoticeForm, RecruitmentDecisionForm } from "./RecruitmentForms";
import { db } from "@/db/client";
import { readPortalRules, readActiveRuleSets } from "@/db/repositories/personnel-pages/catalog";
import { readRecruitmentApplicationReview } from "@/db/repositories/personnel-pages/requests";

export const dynamic = "force-dynamic";
export default async function RecruitmentAdministration({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH"), params = await searchParams;
   const rules = await readPortalRules(context.database ?? db, "recruitment");
  const notices = rules.filter(rule => { const parsed = recruitmentNoticeSchema.safeParse(rule.value); return parsed.success && (isSystemAdministrator(context.user) || context.user.allowedBudgetUnitIds.includes(parsed.data.budgetUnitId)); });
  const selected = notices.find(notice => notice.id === params.edit);
   const ruleSets = await readActiveRuleSets(context.database ?? db);
  const { rows, page, total } = await readRecruitmentApplicationReview(context.database ?? db, context.user, Number.parseInt(params.page || "1") || 1);
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"><ErpPageTitle title="Concursos e processos seletivos" description="Publicação de editais, inscrições recebidas e análise no escopo da unidade responsável." action={<Link href="?new=1">Novo edital</Link>} />{params.new || selected ? <RecruitmentNoticeForm key={selected?.id || "new"} ruleSets={ruleSets} values={selected ? { id: selected.id, name: selected.name, code: selected.code, ruleSetId: selected.ruleSetId, isActive: selected.isActive, value: selected.value } : undefined} /> : <section className="rounded border bg-white p-3 text-xs">{notices.map(notice => <p key={notice.id}><Link href={`?edit=${notice.id}`} className="font-semibold text-emerald-800 underline">{notice.name}</Link> · {notice.isActive ? "Publicado" : "Não publicado"}</p>)}{!notices.length && <p>Nenhum edital no seu escopo.</p>}</section>}
    <h2 className="text-sm font-semibold">{total} inscrições no escopo autorizado</h2>{rows.map(row => { const source = z.object({ fullName: z.string(), noticeName: z.string(), policy: recruitmentNoticeSchema }).parse(row.snapshot); return <article key={row.id} className="space-y-3 rounded border bg-white p-3 text-xs"><h3 className="font-semibold">{row.number} · {source.fullName} · {source.noticeName}</h3><p>{source.policy.roles.find(role => role.code === row.roleCode)?.name} · {row.status} · {row.createdAt.toLocaleDateString("pt-BR")}</p>{row.decision && <p className="whitespace-pre-wrap">{row.decision}</p>}{row.status === "RECEBIDA" && <RecruitmentDecisionForm id={row.id} />}</article>; })}
    <ErpPagination page={page} total={total} pageSize={20} label="inscrições" previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} />
  </div>;
}
