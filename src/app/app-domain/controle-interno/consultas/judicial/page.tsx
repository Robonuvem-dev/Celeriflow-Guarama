import Link from "next/link";
import { AccessError, getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { getProtocolContext } from "@/lib/protocols/access";
import { judicialCaseFilters, judicialCaseWhere } from "@/lib/protocols/judicial-cases";

export default async function ControlJudicialConsultation({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const control = await getTenantContextForModule("ADMINISTRACAO");
  let context;
  try { context = await getProtocolContext(); } catch (error) { if (!(error instanceof AccessError) || error.status !== 403) throw error; return <p className="p-5">Consulta judicial exige leitura autorizada do módulo de Processos ativo.</p>; }
  const raw = await searchParams;
  const parsed = judicialCaseFilters.safeParse(Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "string" && value !== "")));
  if (!parsed.success) return <p className="p-5">{parsed.error.issues[0]?.message}</p>;
  const filters = parsed.data;
  const units = await control.prisma.planningEntityUnit.findMany({ where: { ...(!isSystemAdministrator(control.user) ? { budgetUnitId: { in: control.user.allowedBudgetUnitIds } } : {}) }, include: { governmentEntity: { select: { id: true, name: true } } } });
  const entities = [...new Map(units.map(unit => [unit.governmentEntityId, unit.governmentEntity])).values()];
  const selected = filters.entityId ?? entities[0]?.id;
  if (!selected || !entities.some(entity => entity.id === selected)) return <p className="p-5">Entidade fora das UGs autorizadas no Controle.</p>;
  const where = { ...judicialCaseWhere(context, selected, filters), budgetUnitId: { in: units.filter(unit => unit.governmentEntityId === selected && (context.protocolAccess.isAdmin || context.user.allowedBudgetUnitIds.includes(unit.budgetUnitId))).map(unit => unit.budgetUnitId) } };
  // Infer the aggregate before composing the transaction tuple. Prisma's
  // contextual groupBy inference otherwise widens _count to its input union.
  const statusCounts = control.prisma.processJudicialCase.groupBy({ by: ["status"], where, orderBy: { status: "asc" }, _count: { _all: true } });
  const [count, cases, statuses] = await control.prisma.$transaction([
    control.prisma.processJudicialCase.count({ where }),
    control.prisma.processJudicialCase.findMany({ where, include: { process: { select: { protocolNumber: true, status: true } }, events: { orderBy: { version: "desc" }, take: 1 } }, orderBy: [{ openedAt: "desc" }, { id: "desc" }], take: 50, skip: (filters.page - 1) * 50 }),
    statusCounts,
  ], { isolationLevel: "RepeatableRead" });
  const href = (page: number) => `?${new URLSearchParams({ entityId: selected, page: String(page), status: filters.status ?? "", q: filters.q ?? "", from: filters.from ?? "", through: filters.through ?? "" })}`;
  const style = "block rounded border p-2";
  return <section className="space-y-4 p-5"><h1 className="text-xl font-semibold">Controle Interno — processos contra a entidade</h1><Link href="/controle-interno" className="underline">Voltar ao Controle</Link><form className="flex flex-wrap gap-3"><label>Entidade<select name="entityId" defaultValue={selected} className={style}>{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Situação<select name="status" defaultValue={filters.status ?? ""} className={style}><option value="">Abertos e suspensos</option><option value="OPEN">Aberto</option><option value="SUSPENDED">Suspenso</option><option value="CLOSED">Encerrado</option><option value="RECLASSIFIED">Reclassificado</option></select></label><label>Número/tribunal/protocolo<input name="q" defaultValue={filters.q} className={style} /></label><label>Abertura inicial<input type="date" name="from" defaultValue={filters.from} className={style} /></label><label>Abertura final<input type="date" name="through" defaultValue={filters.through} className={style} /></label><button className={style}>Consultar</button></form><p>Origem: registro judicial documentado no processo nativo, com ente demandado e UG explícitos. Consulta aplica acesso de Processos e de Controle conjuntamente. Cadastro sem registro judicial não entra nos totais. Não equivale a certidão de inexistência de ações.</p><p>Total filtrado: {count} · {statuses.map(row => `${row.status}: ${row._count._all}`).join(" · ")}</p><div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{["Número judicial", "Tribunal", "Abertura", "Situação judicial", "Processo nativo", "Última posição/evidência"].map(label => <th key={label} className="border p-2">{label}</th>)}</tr></thead><tbody>{cases.map(row => <tr key={row.id}><td className="border p-2">{row.caseNumber}</td><td className="border p-2">{row.court}</td><td className="border p-2">{row.openedAt.toISOString().slice(0, 10)}</td><td className="border p-2">{row.status}</td><td className="border p-2"><Link href={`/protocolos/processos/${row.processId}/judicial`} className="underline">{row.process.protocolNumber}</Link> · {row.process.status}</td><td className="border p-2">{row.events[0]?.effectiveAt.toISOString().slice(0, 10)} · v{row.version}<br />GED {row.events[0]?.documentVersionId}<br /><span className="break-all">{row.events[0]?.documentHash}</span></td></tr>)}</tbody></table></div><nav className="flex gap-3">{filters.page > 1 && <Link href={href(filters.page - 1)}>Anterior</Link>}<span>Página {filters.page}</span>{filters.page * 50 < count && <Link href={href(filters.page + 1)}>Próxima</Link>}</nav></section>;
}
