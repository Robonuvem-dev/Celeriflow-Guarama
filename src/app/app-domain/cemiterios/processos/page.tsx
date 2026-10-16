import Link from "next/link";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { WorkflowAdvance, WorkflowForm } from "@/components/cemeteries/WorkflowForms";
import CemeteryLookup from "@/components/cemeteries/CemeteryLookup";
import { cemeteryEventDayStart } from "@/lib/cemeteries/query-policy";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

const day = z.union([z.literal(""), z.iso.date()]).default("");
const schema = z.object({ q: z.string().trim().max(120).default(""), type: z.enum(["", "SEPULTAMENTO", "VELORIO", "CREMACAO"]).default(""), status: z.enum(["", "AGENDADO", "EM_REALIZACAO", "SEPULTADO", "ENCERRADO", "CREMADO", "EXUMADO", "TRANSFERIDO", "DESAPROPRIADO", "CANCELADO"]).default(""), cemetery: z.string().default(""), cemeteryId: z.string().default(""), start: day, end: day, page: z.coerce.number().int().min(1).max(100000).default(1) }).refine(v => !v.start || !v.end || v.start <= v.end, "Data inicial posterior à final.");

export default async function CemeteryProcessesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("CEMITERIOS");
  const parsed = schema.safeParse(await searchParams);
  if (!parsed.success) return <p role="alert" className="p-6">Filtros inválidos: {parsed.error.issues[0].message}</p>;
  const filters = parsed.data;
  const cemeteryId = filters.cemetery || filters.cemeteryId;
  const endDay = filters.end ? new Date(new Date(`${filters.end}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0,10) : "";
  const where: Prisma.CemeteryProcessWhereInput = {
    ...(filters.q ? { OR: [{ receiptCode: { contains: filters.q, mode: "insensitive" } }, { deceased: { fullName: { contains: filters.q, mode: "insensitive" } } }] } : {}),
    ...(filters.type ? { processType: filters.type } : {}), ...(filters.status ? { status: filters.status } : {}), ...(cemeteryId ? { cemeteryId } : {}),
    ...(filters.start || filters.end ? { scheduledAt: { ...(filters.start ? { gte: cemeteryEventDayStart(filters.start) } : {}), ...(endDay ? { lt: cemeteryEventDayStart(endDay) } : {}) } } : {}),
  };
  const total = await context.prisma.cemeteryProcess.count({ where });
  const page = Math.min(filters.page, Math.max(1, Math.ceil(total / 20)));
  const rows = await context.prisma.cemeteryProcess.findMany({ where, include: { deceased: true, cemetery: true, grave: true, chapel: true }, orderBy: [{ scheduledAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20 });
  const values = { q: filters.q, type: filters.type, status: filters.status, cemetery: cemeteryId, start: filters.start, end: filters.end };
  const href = (next: number) => `/cemiterios/processos?${new URLSearchParams({ ...values, page: String(next) })}`;
  const canUpdate = canPerformModuleOperation(context.user, "CEMITERIOS", "update");
  return <main className="space-y-5 p-6"><header><h1 className="text-2xl font-bold">Processos funerários</h1><p>{total} registros no filtro · agendamento e acompanhamento</p></header>
    <form className="grid gap-3 rounded border p-4 md:grid-cols-3"><label className="grid gap-1">Nome / comprovante<input name="q" defaultValue={filters.q} className="rounded border p-2" /></label><label className="grid gap-1">Tipo<select name="type" defaultValue={filters.type} className="rounded border p-2"><option value="">Todos</option>{["SEPULTAMENTO", "VELORIO", "CREMACAO"].map(v => <option key={v}>{v}</option>)}</select></label><label className="grid gap-1">Situação<select name="status" defaultValue={filters.status} className="rounded border p-2"><option value="">Todas</option>{["AGENDADO", "EM_REALIZACAO", "SEPULTADO", "ENCERRADO", "CREMADO", "EXUMADO", "TRANSFERIDO", "DESAPROPRIADO", "CANCELADO"].map(v => <option key={v}>{v}</option>)}</select></label><CemeteryLookup name="cemetery" kind="cemetery" label="Cemitério" defaultValue={cemeteryId} /><label className="grid gap-1">Agendamento desde<input type="date" name="start" defaultValue={filters.start} className="rounded border p-2" /></label><label className="grid gap-1">Agendamento até<input type="date" name="end" defaultValue={filters.end} className="rounded border p-2" /></label><button className="rounded border p-2">Filtrar</button></form>
    <div className="overflow-x-auto rounded border"><table className="w-full text-left text-sm"><thead><tr>{["Comprovante / pessoa", "Tipo / situação", "Agendamento", "Local", "Ações"].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{rows.map(r => <tr key={r.id} className="border-t"><td className="p-3"><Link className="underline" href={`/cemiterios/processos/${r.id}`}>{r.receiptCode} · {r.deceased.fullName} · Abrir</Link></td><td className="p-3">{r.processType} · {r.burialType}<br />{r.status}</td><td className="p-3">{r.scheduledAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td className="p-3">{r.cemetery?.name}<br />{r.grave?.code} · {r.chapel?.name}</td><td className="p-3">{canUpdate && <WorkflowAdvance id={r.id} type={r.processType} status={r.status} />}</td></tr>)}</tbody></table>{!rows.length && <p className="p-4">Nenhum processo encontrado.</p>}</div>
    <ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)} jumpTo={{ pathname: "/cemiterios/processos", values }} />
    {canPerformModuleOperation(context.user, "CEMITERIOS", "create") && <WorkflowForm initialCemeteryId={cemeteryId} />}
  </main>;
}
