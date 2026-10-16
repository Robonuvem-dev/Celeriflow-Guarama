import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { structureConfig, structureFilters } from "@/lib/cemeteries/structure-config";
import { getStructure, listStructure, type StructureRecord } from "@/lib/cemeteries/structure-service";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { StructureForm } from "./StructureForm";
import { StructureCemeteryFilter } from "./StructureFilters";

export type StructureSearch = Record<string, string | string[] | undefined>;
const scalar = (search: StructureSearch) => Object.fromEntries(Object.entries(search).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
export async function StructureListPage({ search, occupancy = false }: { search: StructureSearch; occupancy?: boolean }) {
  const c = await getTenantContextForModule("CEMITERIOS");
  const input = scalar(search);
  if (!input.tipo) input.tipo = occupancy ? "LOTE" : "CEMITERIO";
  const { filters, rows, total } = await listStructure(c.prisma, input);
  const config = structureConfig[filters.tipo];
  const path = occupancy ? "/cemiterios/ocupacao" : "/cemiterios/estrutura";
  const values = { tipo: filters.tipo, q: filters.q, cemeteryId: filters.cemeteryId, active: filters.active, status: filters.status };
  const href = (page: number) => `${path}?${new URLSearchParams({ ...values, page: String(page) })}`;
  const context = new URLSearchParams({ ...values, page: String(filters.page) }).toString();
  return <div className="space-y-4 p-4">
    <header className="flex items-center justify-between"><div><h1 className="text-xl font-semibold">{config.title}</h1><p className="text-sm text-slate-500">Cadastro, manutenção e rastreabilidade</p></div>{canPerformModuleOperation(c.user, "CEMITERIOS", "create") && <Link className="rounded bg-emerald-700 px-4 py-2 text-sm text-white" href={`${path}/novo?${context}`}>Novo</Link>}</header>
    <ErpListFrame toolbar={<form className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="tipo" value={filters.tipo} />
      <label className="text-xs">Busca<input name="q" defaultValue={filters.q} className="block rounded border p-2 text-sm" /></label>
      {config.fields.some(f => f.key === "cemeteryId") && <StructureCemeteryFilter value={filters.cemeteryId} />}
      {config.fields.some(f => f.key === "active") && <label className="text-xs">Ativação<select name="active" defaultValue={filters.active} className="block rounded border p-2 text-sm"><option value="">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option></select></label>}
      {occupancy && <label className="text-xs">Situação<select name="status" defaultValue={filters.status} className="block rounded border p-2 text-sm"><option value="">Todas</option>{(filters.tipo === "LOTE" ? ["LIVRE", "OCUPADO"] : ["LIVRE", "OCUPADA", "RESERVADA", "INTERDITADA"]).map(s => <option key={s}>{s}</option>)}</select></label>}
      <button className="rounded border px-3 py-2 text-sm">Filtrar</button>
    </form>} summary={<span className="text-xs">{total} registros no filtro</span>} pagination={<ErpPagination page={filters.page} total={total} previousHref={href(filters.page - 1)} nextHref={href(filters.page + 1)} jumpTo={{ pathname: path, values }} />}>
      <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs"><tr><th className="p-3">Identificação</th><th className="p-3">Situação</th>{occupancy && <th className="p-3">Capacidade / ocupação</th>}<th className="p-3">Ações</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="p-3">{String(row.name ?? row.identifier ?? row.label ?? row.description ?? row.code)}</td><td className="p-3">{String(row.status ?? (row.active === undefined ? "Cadastrado" : row.active ? "Ativo" : "Inativo"))}{Boolean(row.status) && row.active === false ? " · Inativo" : ""}</td>{occupancy && <td className="p-3">{filters.tipo === "LOTE" ? `${row.registered}/${row.graveLimit} cadastradas · ${row.occupied} ocupadas · ${Number(row.graveLimit) - Number(row.registered)} vagas para cadastro` : `${row.occupantCount}/${row.capacity} ocupantes · ${row.graveType === "GAVETA" ? "Lóculo" : row.graveType}`}</td>}<td className="p-3"><Link className="font-medium text-emerald-700" href={`${path}/${row.id}?${context}`}>Abrir</Link></td></tr>)}{!rows.length && <tr><td className="p-8 text-center text-slate-500" colSpan={occupancy ? 4 : 3}>Nenhum registro encontrado.</td></tr>}</tbody>
      </table>
    </ErpListFrame>
  </div>;
}

export async function StructureDetailPage({ id, search, occupancy = false }: { id: string; search: StructureSearch; occupancy?: boolean }) {
  const c = await getTenantContextForModule("CEMITERIOS");
  const input = scalar(search);
  const filters = structureFilters.parse({ ...input, tipo: input.tipo ?? (occupancy ? "LOTE" : "CEMITERIO") });
  const record: StructureRecord = id === "novo" ? { id: "" } : await getStructure(c.prisma, filters.tipo, id) ?? notFound();
  const path = occupancy ? "/cemiterios/ocupacao" : "/cemiterios/estrutura";
  const returnHref = `${path}?${new URLSearchParams({ ...scalar(search), tipo: filters.tipo })}`;
  const fields = ["LOTE", "SEPULTURA"].includes(filters.tipo) ? await c.prisma.cemeteryIdentificationField.findMany({ where: { targetType: filters.tipo, ...(record.cemeteryId ? { cemeteryId: String(record.cemeteryId) } : { active: true }) }, orderBy: [{ label: "asc" }, { id: "asc" }] }) : [];
  const historyPage = z.coerce.number().int().min(1).max(1000000).default(1).parse(input.historyPage);
  const where = { targetType: filters.tipo, targetId: id };
  const [historyTotal, history] = id === "novo" ? [0, []] : await Promise.all([c.prisma.cemeteryChangeHistory.count({ where }), c.prisma.cemeteryChangeHistory.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (historyPage - 1) * 20, take: 20 })]);
  const users = await c.prisma.usuario.findMany({ where: { id: { in: history.map(h => h.actorUsuarioId) } }, select: { id: true, nome: true } });
  const taxpayerIds = structureConfig[filters.tipo].fields.filter(f => f.lookup === "taxpayer").map(f => String(record[f.key] ?? "")).filter(Boolean);
  const taxpayers = await c.prisma.taxpayer.findMany({ where: { id: { in: taxpayerIds } }, include: { person: true, company: true } });
  const serialized = JSON.parse(JSON.stringify({ ...record, cemeteryId: record.cemeteryId ?? filters.cemeteryId })) as Record<string, unknown>;
  const historyHref = (page: number) => `${path}/${id}?${new URLSearchParams({ ...scalar(search), tipo: filters.tipo, historyPage: String(page) })}`;
  const lotPage = z.coerce.number().int().min(1).max(1000000).default(1).parse(input.lotPage);
  const [graveTotal, graves] = filters.tipo === "LOTE" && id !== "novo" ? await Promise.all([c.prisma.taxGrave.count({ where: { lotId: id } }), c.prisma.taxGrave.findMany({ where: { lotId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (lotPage - 1) * 20, take: 20 })]) : [0, []];
  const lotHref = (page: number) => `${path}/${id}?${new URLSearchParams({ ...scalar(search), tipo: filters.tipo, lotPage: String(page) })}`;
  return <div className="space-y-6 p-4">
    <Link href={returnHref} className="text-sm text-emerald-700">← Voltar à lista</Link><h1 className="text-xl font-semibold">{id === "novo" ? "Novo cadastro" : "Ficha / editar"} · {structureConfig[filters.tipo].title}</h1>
    {record.status !== undefined && <p className="text-sm">Situação: {String(record.status)}{record.occupantCount !== undefined && ` · Ocupação: ${record.occupantCount}/${record.capacity}`}</p>}
    {taxpayers.length > 0 && <dl className="grid gap-2 text-sm">{structureConfig[filters.tipo].fields.filter(f => f.lookup === "taxpayer").map(f => { const t = taxpayers.find(t => t.id === record[f.key]); return <div key={f.key}><dt className="font-medium">{f.label}</dt><dd>{t?.person?.fullName ?? t?.company?.corporateName ?? "Não vinculado"} · {t?.person?.cpf ?? t?.company?.cnpj ?? ""}</dd></div>; })}</dl>}
    <section className="rounded-lg border bg-white p-4">{canPerformModuleOperation(c.user, "CEMITERIOS", id === "novo" ? "create" : "update") ? <StructureForm kind={filters.tipo} record={serialized} fields={fields} returnHref={returnHref} /> : <dl className="grid gap-3 text-sm md:grid-cols-2">{structureConfig[filters.tipo].fields.map(f => <div key={f.key}><dt className="font-medium">{f.label}</dt><dd>{typeof record[f.key] === "boolean" ? record[f.key] ? "Sim" : "Não" : String(record[f.key] ?? "—")}</dd></div>)}{fields.map(f => <div key={f.fieldKey}><dt className="font-medium">{f.label}</dt><dd>{String(((record.additionalData ?? {}) as Record<string, unknown>)[f.fieldKey] ?? "—")}</dd></div>)}</dl>}</section>
    {filters.tipo === "LOTE" && id !== "novo" && <section className="space-y-3"><h2 className="font-semibold">Sepulturas do lote · {graveTotal}/{String(record.graveLimit)} cadastradas</h2><p className="text-sm">{Number(record.graveLimit) - graveTotal} vagas para cadastrar sepulturas. Ocupação do lote: {String(record.status)}.</p><ul>{graves.map(g => <li key={g.id} className="border-t p-2 text-sm"><Link className="text-emerald-700" href={`/cemiterios/ocupacao/${g.id}?tipo=SEPULTURA&cemeteryId=${g.cemeteryId}`}>{g.code} · {g.graveType === "GAVETA" ? "Lóculo" : g.graveType} · {g.occupantCount}/{g.capacity} ocupantes · {g.active ? g.status : "Inativa"} · Abrir</Link></li>)}</ul><ErpPagination page={lotPage} total={graveTotal} previousHref={lotHref(lotPage - 1)} nextHref={lotHref(lotPage + 1)} /></section>}
    {id !== "novo" && <section className="space-y-3"><h2 className="font-semibold">Histórico imutável por campo</h2><div className="overflow-auto"><table className="w-full text-left text-xs"><thead><tr>{["Data / hora", "Campo", "Antes", "Depois", "Operador"].map(t => <th key={t} className="p-2">{t}</th>)}</tr></thead><tbody>{history.map(h => <tr key={h.id} className="border-t"><td className="p-2">{h.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td className="p-2">{h.fieldName}</td><td className="p-2">{JSON.stringify(h.previousValue)}</td><td className="p-2">{JSON.stringify(h.newValue)}</td><td className="p-2">{users.find(u => u.id === h.actorUsuarioId)?.nome ?? h.actorUsuarioId}</td></tr>)}</tbody></table></div>{!history.length && <p className="text-sm text-slate-500">Nenhuma alteração registrada.</p>}<ErpPagination page={historyPage} total={historyTotal} previousHref={historyHref(historyPage - 1)} nextHref={historyHref(historyPage + 1)} /></section>}
  </div>;
}
