import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { sstUnitWhere } from "@/lib/sst/access";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export default async function SstAppointmentsPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const units = await context.prisma.budgetUnit.findMany({ where: sstUnitWhere(context), select: { id: true } });
  const where = { availability: { budgetUnitId: { in: units.map((item) => item.id) } }, ...(params.q ? { employee: { name: { contains: params.q, mode: "insensitive" as const } } } : {}) };
  const total = await context.prisma.sstAppointment.count({ where });
  const page = Math.min(Math.max(1, Math.trunc(Number(params.page)) || 1), Math.max(1, Math.ceil(total / 20)));
  const records = await context.prisma.sstAppointment.findMany({ where, take: 20, skip: (page - 1) * 20, orderBy: [{ startsAt: "desc" }, { id: "asc" }], include: { employee: { select: { name: true } }, availability: { select: { unitName: true, professional: { select: { fullName: true } } } } } });
  const href = (value: number) => `/sst/agenda/agendamentos?${new URLSearchParams({ page: String(value), q: params.q || "" })}`;
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Agendamentos SST</h1><Link href="/sst/agenda">Abrir agenda</Link><form className="flex gap-2"><input name="q" defaultValue={params.q} placeholder="Servidor" className="rounded border p-2"/><button className="rounded border p-2">Filtrar</button></form><table className="w-full table-fixed text-left text-sm"><thead><tr><th className="p-2">Servidor</th><th className="p-2">Profissional/local</th><th className="p-2">Data/hora</th><th className="p-2">Situação</th><th className="p-2">Detalhes</th></tr></thead><tbody>{records.map((record) => <tr className="border-b" key={record.id}><td className="break-words p-2">{record.employee.name}</td><td className="break-words p-2">{record.availability.professional.fullName}<br/>{record.availability.unitName}</td><td className="p-2">{record.startsAt.toLocaleString("pt-BR")}</td><td className="p-2">{record.status}</td><td className="p-2"><Link className="underline" href={`/sst/agenda/agendamentos/${record.id}`}>Abrir</Link></td></tr>)}</tbody></table><ErpPagination page={page} total={total} previousHref={href(page - 1)} nextHref={href(page + 1)}/></div>;
}
