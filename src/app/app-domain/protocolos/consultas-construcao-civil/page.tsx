import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { respondConstructionConsultation } from "@/app/app-domain/obras/construcao-civil/consultas/actions";
import { db } from "@/db/client";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { employees, departments } from "@/db/schema/administration";
import { processConstructionConsultations, processConstructionResponses } from "@/db/schema/transparency-sources";

export default async function ReceivedConstructionConsultations({ searchParams }: { searchParams:Promise<{page?:string;status?:string}> }) {
  const context=await getTenantContextForModule("PROCESSOS");
  if (!context.user.employeeId || !context.user.departmentId || !(await db.select({id:employees.id}).from(employees).innerJoin(departments,eq(departments.id,employees.departmentId)).where(and(eq(employees.id,context.user.employeeId),eq(employees.isActive,true),eq(employees.departmentId,context.user.departmentId),eq(departments.isActive,true))).limit(1)).length) notFound();
  const query=await searchParams; const status=query.status==="all"?"all":"pending"; const where=and(eq(processConstructionConsultations.targetDepartmentId,context.user.departmentId),status==="pending"?isNull(processConstructionResponses.id):undefined);
  const [{total}]=await db.select({total:count()}).from(processConstructionConsultations).leftJoin(processConstructionResponses,eq(processConstructionResponses.consultationId,processConstructionConsultations.id)).where(where); const page=Math.min(Math.max(1,Math.ceil(total/20)),Math.max(1,Number.parseInt(query.page||"1",10)||1));
  const rows=await db.select({consultation:processConstructionConsultations,response:{opinion:processConstructionResponses.opinion}}).from(processConstructionConsultations).leftJoin(processConstructionResponses,eq(processConstructionResponses.consultationId,processConstructionConsultations.id)).where(where).orderBy(asc(processConstructionConsultations.dueAt),asc(processConstructionConsultations.id)).offset((page-1)*20).limit(20);
  const items=rows.map(row=>({...row.consultation,response:row.response}));
  const href=(target:number)=>`?${new URLSearchParams({status,page:String(target)})}`;
  return <PageFrame className="space-y-3 p-3"><PageHeader title="Consultas recebidas — Construção Civil" /><p className="text-xs text-slate-500">Esta consulta compartilha somente a questão dirigida ao seu setor. O acesso ao processo civil completo permanece restrito aos responsáveis.</p><form className="flex gap-2"><select name="status" aria-label="Situação" defaultValue={status} className="rounded border bg-transparent p-1 text-xs"><option value="pending">Pendentes</option><option value="all">Todas</option></select><button className="rounded border px-3 text-xs">Filtrar</button></form>{items.map((item)=><section key={item.id} className="space-y-2 rounded border p-3"><p className="text-xs">Prazo: {item.dueAt.toLocaleDateString("pt-BR")} — {item.response?"Respondida":"Pendente"}</p><p className="whitespace-pre-wrap text-sm">{item.question}</p>{item.response?<p className="whitespace-pre-wrap text-sm"><strong>Parecer registrado:</strong> {item.response.opinion}</p>:<form action={respondConstructionConsultation} className="space-y-2"><input type="hidden" name="consultationId" value={item.id}/><label className="block text-xs">Parecer<textarea required name="opinion" minLength={10} maxLength={10000} rows={4} className="w-full rounded border bg-transparent p-2 text-sm"/></label><button className="rounded bg-blue-600 px-3 py-2 text-xs text-white">Registrar parecer</button></form>}</section>)}<ErpPagination page={page} total={total} pageSize={20} previousHref={href(page-1)} nextHref={href(page+1)} label="consultas" /></PageFrame>;
}
