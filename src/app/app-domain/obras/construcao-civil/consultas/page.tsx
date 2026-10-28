import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { db } from "@/db/client";
import { listPageCaseOptions, loadPageConsultations } from "@/db/repositories/works-pages/cases";
import { listPageDepartments } from "@/db/repositories/works-pages/shared";
import { requestConstructionConsultation } from "./actions";

export default async function ConstructionConsultationsPage({ searchParams }: { searchParams: Promise<{ q?:string;page?:string;status?:string }> }) {
  const context=await getTenantContextForModule("OBRAS"); const access=await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.length) notFound();
  const query=await searchParams; const q=(query.q||"").trim().slice(0,100); const status=query.status==="answered" ? "answered" : query.status==="pending" ? "pending" : "all";
  const database = context.database ?? db;
  const { total, page, items } = await loadPageConsultations(database, access, { q, status, page: query.page });
  const [cases, departments] = await Promise.all([listPageCaseOptions(database, access), listPageDepartments(database)]);
  const names=new Map(departments.map((department)=>[department.id,department.name])); const href=(target:number)=>`?${new URLSearchParams({q,status,page:String(target)})}`;
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Consultas urbanísticas a outros setores" />{(access.administrator || access.roles.some((role)=>["ANALYST","MANAGER"].includes(role))) && <form action={requestConstructionConsultation} className="grid gap-3 rounded border p-3 sm:grid-cols-2"><input type="hidden" name="requestKey" value={randomUUID()} /><label className="text-xs">Solicitação<select name="caseId" required className="h-8 w-full rounded border bg-transparent px-2"><option value="">Selecione</option>{cases.map((item)=><option key={item.id} value={item.id}>{item.process.protocolNumber}</option>)}</select></label><label className="text-xs">Setor consultado<select name="targetDepartmentId" required className="h-8 w-full rounded border bg-transparent px-2"><option value="">Selecione</option>{departments.map((department)=><option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="text-xs">Prazo<input name="dueAt" type="date" required className="h-8 w-full rounded border bg-transparent px-2" /></label><label className="text-xs sm:col-span-2">Questão para parecer<textarea name="question" required minLength={10} maxLength={4000} rows={3} className="w-full rounded border bg-transparent p-2 text-sm" /></label><button className="rounded bg-blue-600 px-3 py-2 text-xs text-white sm:col-span-2">Solicitar parecer e notificar setor</button></form>}<form className="flex gap-2"><input name="q" aria-label="Buscar protocolo" defaultValue={q} placeholder="Buscar protocolo" className="min-w-0 flex-1 rounded border bg-transparent px-2 text-sm" /><select name="status" aria-label="Situação" defaultValue={status} className="rounded border bg-transparent text-xs"><option value="all">Todas</option><option value="pending">Pendentes</option><option value="answered">Respondidas</option></select><button className="rounded border px-3 py-1 text-xs">Filtrar</button></form>{items.map((item)=><details key={item.id} className="rounded border p-3 text-xs"><summary>{item.case.process.protocolNumber} — {names.get(item.targetDepartmentId)||item.targetDepartmentId} — {item.response?"Respondida":"Pendente"} — Prazo {item.dueAt.toLocaleDateString("pt-BR")}</summary><p className="mt-2 whitespace-pre-wrap">{item.question}</p>{item.response && <p className="mt-2 whitespace-pre-wrap"><strong>Parecer:</strong> {item.response.opinion}</p>}</details>)}<ErpPagination page={page} total={total} pageSize={20} previousHref={href(page-1)} nextHref={href(page+1)} label="consultas" /></PageFrame>;
}
