import Link from "next/link";
import { z } from "zod";
import { AccessError, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { getOmbudsmanReadContext, ombudsmanScope } from "@/lib/attendance/access";
import type { Prisma } from "@prisma/client";

const filtersSchema = z.object({ entityId: z.string().optional(), type: z.string().max(80).optional(), status: z.string().max(80).optional(), from: z.iso.date().optional(), through: z.iso.date().optional(), page: z.coerce.number().int().min(1).max(100000).default(1) }).refine(value => !value.from || !value.through || value.from <= value.through, "Período inicial deve preceder o final.");

export default async function ControlOmbudsmanConsultation({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const control = await getTenantContextForModule("ADMINISTRACAO");
  let context;
  try { context = await getOmbudsmanReadContext(); } catch (error) {
    if (!(error instanceof AccessError) || error.status !== 403) throw error;
    return <section className="p-5"><h1 className="text-xl font-semibold">Controle Interno — Ouvidoria</h1><p>A consulta exige leitura autorizada de Ouvidoria no módulo de origem.</p><Link href="/controle-interno">Voltar ao Controle</Link></section>;
  }
  const raw = await searchParams;
  const input = filtersSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== "")));
  if (!input.success) return <p className="p-5">{input.error.issues[0]?.message ?? "Filtros inválidos."}</p>;
  const filters = input.data;
  const units = await control.prisma.budgetUnit.findMany({ where: { ...(isSystemAdministrator(control.user) ? {} : { id: { in: control.user.allowedBudgetUnitIds } }), planningEntityUnit: { isNot: null } }, select: { secretariatId: true, planningEntityUnit: { select: { governmentEntityId: true, governmentEntity: { select: { name: true } } } } } });
  const entities = [...new Map(units.flatMap(unit => unit.planningEntityUnit ? [[unit.planningEntityUnit.governmentEntityId, { id: unit.planningEntityUnit.governmentEntityId, name: unit.planningEntityUnit.governmentEntity.name }] as const] : [])).values()];
  const selected = filters.entityId || entities[0]?.id;
  if (!selected || !entities.some(entity => entity.id === selected)) return <p className="p-5">Entidade fora do escopo autorizado ou sem UG municipal vinculada.</p>;
  // A shared secretariat cannot establish which entity owns a manifestation.
  // Require all durable UG bindings of its department's secretariat to agree.
  const scopedSecretariats = [...new Set(units.filter(unit => unit.planningEntityUnit?.governmentEntityId === selected).map(unit => unit.secretariatId))];
  const departments = await control.prisma.department.findMany({ where: { secretariatId: { in: scopedSecretariats }, secretariat: { budgetUnits: { some: { planningEntityUnit: { governmentEntityId: selected } }, every: { planningEntityUnit: { governmentEntityId: selected } } } } }, select: { id: true } });
  const where: Prisma.OmbudsmanWhereInput = { AND: [ombudsmanScope(context), { departmentId: { in: departments.map(department => department.id) } }, ...(filters.type ? [{ type: filters.type }] : []), ...(filters.status ? [{ status: filters.status }] : []), ...(filters.from || filters.through ? [{ createdAt: { ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}), ...(filters.through ? { lte: new Date(`${filters.through}T23:59:59.999Z`) } : {}) } }] : [])] };
  const typeGroups = control.prisma.ombudsman.groupBy({ by: ["type"], where, _count: { _all: true }, orderBy: { type: "asc" } });
  const statusGroups = control.prisma.ombudsman.groupBy({ by: ["status"], where, _count: { _all: true }, orderBy: { status: "asc" } });
  const [count, rows, types, statuses] = await control.prisma.$transaction([
    control.prisma.ombudsman.count({ where }),
    control.prisma.ombudsman.findMany({ where, select: { id: true, protocolNumber: true, type: true, status: true, createdAt: true, respondedAt: true, concludedAt: true, isAnonymous: true, isConfidential: true, department: { select: { name: true } }, process: { select: { protocolNumber: true, status: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, skip: (filters.page - 1) * 50 }),
    typeGroups,
    statusGroups,
  ], { isolationLevel: "RepeatableRead" });
  const pageLink = (page: number) => { const query = new URLSearchParams({ entityId: selected, page: String(page) }); for (const key of ["type", "status", "from", "through"] as const) if (filters[key]) query.set(key, filters[key]); return `?${query}`; };
  return <section className="space-y-4 p-5"><div><h1 className="text-xl font-semibold">Controle Interno — consulta integrada de Ouvidoria</h1><Link href="/controle-interno" className="underline">Voltar ao Controle</Link></div><form className="flex flex-wrap items-end gap-3"><label>Entidade<select name="entityId" defaultValue={selected} className="block rounded border p-2">{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Tipo<input name="type" defaultValue={filters.type} className="block rounded border p-2" placeholder="Reclamação, Sugestão…" /></label><label>Situação<input name="status" defaultValue={filters.status} className="block rounded border p-2" /></label><label>Inclusão inicial<input name="from" type="date" defaultValue={filters.from} className="block rounded border p-2" /></label><label>Inclusão final<input name="through" type="date" defaultValue={filters.through} className="block rounded border p-2" /></label><button className="rounded border p-2">Consultar</button></form><p className="text-sm">Registros canônicos no escopo de Ouvidoria autorizado e da entidade selecionada. Identidade, contatos, assunto e narrativa não são carregados nesta consulta. Registros sem atribuição institucional inequívoca não entram nos totais.</p><div className="grid gap-3 md:grid-cols-3"><p>Total filtrado: <strong>{count}</strong></p><div>{types.map(row => <p key={row.type}>{row.type}: {row._count._all}</p>)}</div><div>{statuses.map(row => <p key={row.status}>{row.status}: {row._count._all}</p>)}</div></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Protocolo", "Tipo", "Situação", "Setor", "Inclusão", "Resposta", "Conclusão", "Processo", "Acesso"].map(title => <th key={title} className="border p-2 text-left">{title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className="border p-2"><Link href={`/atendimento/ouvidoria/${row.id}`} className="underline">{row.protocolNumber}</Link></td><td className="border p-2">{row.type}</td><td className="border p-2">{row.status}</td><td className="border p-2">{row.department?.name}</td><td className="border p-2">{row.createdAt.toISOString().slice(0, 10)}</td><td className="border p-2">{row.respondedAt?.toISOString().slice(0, 10) ?? "Pendente"}</td><td className="border p-2">{row.concludedAt?.toISOString().slice(0, 10) ?? "Aberta"}</td><td className="border p-2">{row.process ? `${row.process.protocolNumber} — ${row.process.status}` : "Sem processo vinculado"}</td><td className="border p-2">{row.isConfidential ? "Confidencial" : "Ordinário"}{row.isAnonymous ? " / anônimo" : ""}</td></tr>)}</tbody></table></div>{!rows.length && <p>Sem manifestações no período e escopo selecionados.</p>}<nav className="flex gap-4">{filters.page > 1 && <Link href={pageLink(filters.page - 1)}>Anterior</Link>}<span>Página {filters.page} de {Math.max(1, Math.ceil(count / 50))}</span>{filters.page * 50 < count && <Link href={pageLink(filters.page + 1)}>Próxima</Link>}</nav></section>;
}
