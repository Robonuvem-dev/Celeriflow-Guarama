import Link from "next/link";
import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
import { portalServiceRequests } from "@/db/schema/portal-services";
import { processes } from "@/db/schema/processes";
import { departments } from "@/db/schema/administration";
import { readPortalScheduleResources } from "@/db/repositories/portal-content/services";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { ProgramRequestsForm } from "../ProgramRequestsForm";

export const dynamic = "force-dynamic";
export default async function ServiceQueuePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const context = await getProtocolContext(), query = await searchParams, q = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "", status = typeof query.status === "string" ? query.status : "";
  const where = and(protocolScopeCondition(context), q ? ilike(processes.protocolNumber, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined, status ? eq(portalServiceRequests.status, status) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(portalServiceRequests).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).where(where);
  const page = Math.min(Math.max(1, Math.ceil(total / 30)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const requestRows = await db.select({ request: portalServiceRequests, process: { protocolNumber: processes.protocolNumber, currentDepartmentId: processes.currentDepartmentId }, department: { name: departments.name } }).from(portalServiceRequests).innerJoin(processes, eq(processes.id, portalServiceRequests.processId)).leftJoin(departments, eq(departments.id, processes.currentDepartmentId)).where(where).orderBy(desc(portalServiceRequests.createdAt), asc(portalServiceRequests.id)).limit(30).offset((page - 1) * 30);
  const requests = requestRows.map(row => ({ ...row.request, process: { ...row.process, currentDepartment: row.department } }));
  const [employees, teams, assets] = context.protocolAccess.canUpdate ? await readPortalScheduleResources(db, context.protocolAccess.isAdmin ? undefined : context.user.departmentId || "__NONE__") : [[], [], []];
  const href = (target: number) => `?${new URLSearchParams({ q, status, page: String(target) })}`;
  return <main className="mx-auto max-w-6xl space-y-5 p-4"><Link href="/protocolos/servicos" className="text-sm font-semibold text-emerald-800">← Catálogo e configuração</Link><h1 className="text-2xl font-semibold">Solicitações de serviços — origem Autoatendimento</h1><form className="flex flex-wrap gap-3"><input name="q" defaultValue={q} placeholder="Protocolo" aria-label="Protocolo" className="min-w-0 flex-1 rounded border p-2" /><select name="status" defaultValue={status} aria-label="Situação" className="rounded border p-2"><option value="">Todas</option>{["RECEBIDO", "EM_ANALISE", "AGUARDANDO_COMPLEMENTO", "PROGRAMADO", "RESPONDIDO", "CONCLUIDO", "CANCELADO"].map((item) => <option key={item}>{item}</option>)}</select><button className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Filtrar</button></form><div className="overflow-x-auto rounded border bg-white"><table className="w-full text-left text-sm"><thead><tr>{["Protocolo", "Serviço", "Situação", "Setor", "Abertura"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{requests.map((request) => <tr key={request.id} className="border-t"><td className="p-3"><Link href={`/protocolos/servicos/solicitacoes/${request.id}`} className="font-semibold text-emerald-800 underline">{request.process.protocolNumber}</Link></td><td className="p-3">{(request.snapshot as { name: string }).name}</td><td className="p-3">{request.status}</td><td className="p-3">{request.process.currentDepartment?.name}</td><td className="p-3">{request.createdAt.toLocaleDateString("pt-BR")}</td></tr>)}</tbody></table></div><ErpPagination page={page} total={total} pageSize={30} previousHref={href(page - 1)} nextHref={href(page + 1)} label="solicitações" />{context.protocolAccess.canUpdate && <ProgramRequestsForm requests={requests.filter((item) => !["CONCLUIDO", "CANCELADO"].includes(item.status)).map((item) => ({ id: item.id, label: `${item.process.protocolNumber} — ${(item.snapshot as { name: string }).name}` }))} employees={employees} teams={teams} assets={assets.map((item) => ({ id: item.id, name: item.description }))} />}</main>;
}
