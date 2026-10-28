import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { assetOperationWhere } from "@/lib/patrimonio/asset-operations";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { assets as assetTable, assetCategories } from "@/db/schema/assets";
import { equipmentCustodies, materials, materialCategories } from "@/db/schema/assets-stock";
import { departments as departmentTable, employees } from "@/db/schema/administration";
import { realEstates } from "@/db/schema/registry";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { clampPatrimonioListPage, patrimonioListHref, parsePatrimonioListPage, PATRIMONIO_LIST_PAGE_SIZE } from "../listing";
import { AssetRowActions as ClientAssetRowActions } from "./AssetRowActions";
import { ResizableTable } from "../_components/ResizableTable";

type SearchParams = { q?: string; status?: string; page?: string; tab?: string; department?: string; category?: string };
type Tab = "lista" | "tombamento" | "sem-tombamento";
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function AssetRowActions({ asset, canUpdate }: { asset: { id: string; name: string; status: string }; canUpdate: boolean }) {
  return <ClientAssetRowActions asset={{ id: asset.id, name: asset.name, status: asset.status }} canUpdate={canUpdate} />;
}

export default async function BensPatrimoniaisPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const context = await getTenantContextForModule("PATRIMONIO");
  const params = await searchParams;
  const q = params?.q?.trim() || "", status = params?.status || "", departmentId = params?.department || "", categoryId = params?.category || "";
  const tab: Tab = params?.tab === "tombamento" ? "tombamento" : params?.tab === "sem-tombamento" ? "sem-tombamento" : "lista";
  const scope = assetOperationWhere(context);
  const pattern = `%${q}%`;
  const where = and(scope.departmentId ? eq(assetTable.departmentId, scope.departmentId) : undefined, departmentId ? eq(assetTable.departmentId, departmentId) : undefined,
    status ? eq(assetTable.status, status) : undefined, categoryId ? eq(assetTable.categoryId, categoryId) : undefined,
    q ? or(ilike(assetTable.name, pattern), ilike(assetTable.code, pattern), ilike(assetTable.patrimonyNumber, pattern), ilike(assetTable.description, pattern), ilike(assetTable.brand, pattern), ilike(assetTable.model, pattern), sql`EXISTS (SELECT 1 FROM "Employee" e WHERE e.id=${assetTable.responsibleId} AND e.name ILIKE ${pattern})`) : undefined);
  const custodyWhere = and(scope.departmentId ? eq(equipmentCustodies.departmentId, scope.departmentId) : undefined, departmentId ? eq(equipmentCustodies.departmentId, departmentId) : undefined,
    status ? eq(equipmentCustodies.status, status) : undefined,
    q ? or(ilike(equipmentCustodies.code, pattern), ilike(equipmentCustodies.name, pattern), ilike(equipmentCustodies.serialNumber, pattern), sql`EXISTS (SELECT 1 FROM "Employee" e WHERE e.id=${equipmentCustodies.responsibleId} AND e.name ILIKE ${pattern})`) : undefined);
  const [assetCount, custodyCount, departments, categories] = await Promise.all([
    db.select({ count: count() }).from(assetTable).where(where).then(rows => rows[0].count), db.select({ count: count() }).from(equipmentCustodies).where(custodyWhere).then(rows => rows[0].count),
    db.select({ id: departmentTable.id, name: departmentTable.name }).from(departmentTable).where(and(eq(departmentTable.isActive, true), scope.departmentId ? eq(departmentTable.id, scope.departmentId) : undefined)).orderBy(asc(departmentTable.name)),
    db.select({ id: assetCategories.id, name: assetCategories.name }).from(assetCategories).where(eq(assetCategories.isActive, true)).orderBy(asc(assetCategories.name)),
  ]);
  const total = tab === "sem-tombamento" ? custodyCount : assetCount;
  const page = clampPatrimonioListPage(parsePatrimonioListPage(params?.page), total);
  const [assets, custodies] = await Promise.all([
    tab !== "sem-tombamento" ? db.select({ asset: assetTable, category: { name: assetCategories.name }, department: { name: departmentTable.name }, responsible: { name: employees.name }, realEstate: { id: realEstates.id, propertyType: realEstates.propertyType, streetName: realEstates.streetName } }).from(assetTable)
      .innerJoin(assetCategories, eq(assetCategories.id, assetTable.categoryId)).leftJoin(departmentTable, eq(departmentTable.id, assetTable.departmentId)).leftJoin(employees, eq(employees.id, assetTable.responsibleId)).leftJoin(realEstates, eq(realEstates.id, assetTable.realEstateId))
      .where(where).orderBy(desc(tab === "tombamento" ? assetTable.acquisitionDate : assetTable.createdAt), asc(assetTable.id)).offset((page - 1) * PATRIMONIO_LIST_PAGE_SIZE).limit(PATRIMONIO_LIST_PAGE_SIZE)
      .then(rows => rows.map(row => ({ ...row.asset, category: row.category, department: row.department, responsible: row.responsible, realEstate: row.realEstate }))) : [],
    tab === "sem-tombamento" ? db.select({ equipment: equipmentCustodies, department: { name: departmentTable.name }, responsible: { name: employees.name }, category: { name: materialCategories.name } }).from(equipmentCustodies)
      .innerJoin(departmentTable, eq(departmentTable.id, equipmentCustodies.departmentId)).innerJoin(employees, eq(employees.id, equipmentCustodies.responsibleId)).innerJoin(materials, eq(materials.id, equipmentCustodies.materialId)).innerJoin(materialCategories, eq(materialCategories.id, materials.categoryId))
      .where(custodyWhere).orderBy(desc(equipmentCustodies.deliveredAt), asc(equipmentCustodies.id)).offset((page - 1) * PATRIMONIO_LIST_PAGE_SIZE).limit(PATRIMONIO_LIST_PAGE_SIZE)
      .then(rows => rows.map(row => ({ ...row.equipment, department: row.department, responsible: row.responsible, material: { category: row.category } }))) : [],
  ]);
  const filters = { q, status, department: departmentId, category: categoryId, tab };
  const canUpdate = canPerformModuleOperation(context.user, "PATRIMONIO", "update");
  const canCreate = canPerformModuleOperation(context.user, "PATRIMONIO", "create");
  const selectClass = "h-7 max-w-48 rounded border bg-white px-2 text-xs";
  const columns = tab === "tombamento" ? [
    { label: "Código", width: 115 }, { label: "Tombamento", width: 120 }, { label: "Data", width: 100 }, { label: "Descrição do bem", width: 270 }, { label: "Marca / modelo", width: 170 }, { label: "Setor", width: 190 }, { label: "Valor aquisição", width: 130, align: "right" as const }, { label: "Ações", width: 85 },
  ] : [
    { label: "Código", width: 115 }, { label: "Tombamento", width: 120 }, { label: "Descrição do equipamento", width: 270 }, { label: "Categoria", width: 180 }, { label: "Localização", width: 190 }, { label: "Responsável", width: 180 }, { label: "Situação", width: 120 }, { label: "Valor atual", width: 130, align: "right" as const }, { label: "Ações", width: 85 },
  ];

  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3">
    <ErpPageTitle title="Bens patrimoniais e equipamentos" action={<><Link href="/patrimonio/ciclo-vida" className="rounded border bg-white px-2 py-1 text-xs font-semibold">Ciclo de vida</Link>{canCreate && <Link href="/patrimonio/bens/novo" className="inline-flex items-center gap-1 rounded bg-blue-900 px-2 py-1 text-xs font-semibold text-white"><Plus className="size-3" />Tombar bem</Link>}</>} />
    <nav aria-label="Visões dos bens" className="flex shrink-0 flex-wrap items-center gap-1">{([["lista", "Lista de bens"], ["tombamento", "Histórico de tombamento"], ["sem-tombamento", "Em uso sem tombamento"]] as [Tab, string][]).map(([value, label]) => <Link key={value} href={patrimonioListHref("/patrimonio/bens", 1, { ...filters, tab: value })} aria-current={tab === value ? "page" : undefined} className={`rounded border px-2 py-1 text-[11px] font-semibold ${tab === value ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600"}`}>{label}</Link>)}<Link href="/patrimonio/bens/estoque" className="px-2 text-[11px] text-slate-600 underline">Equipamentos em estoque</Link></nav>
    {tab === "sem-tombamento" && <p className="shrink-0 text-[11px] text-slate-600">Controle físico dos equipamentos entregues por requisição, com setor e recebedor. O código EQP identifica o equipamento; o tombamento é a incorporação patrimonial individual e possui registro próprio.</p>}
    <ErpListFrame toolbar={<form role="search" className="flex flex-wrap items-center gap-2"><input type="hidden" name="tab" value={tab} /><Input aria-label="Pesquisar bens" name="q" defaultValue={q} placeholder="Código, tombamento, descrição, marca, modelo ou responsável" className="h-7 min-w-0 flex-1 bg-white text-xs sm:min-w-64" /><select name="status" aria-label="Situação" defaultValue={status} className={selectClass}><option value="">Todas as situações</option>{["Ativo", "Em uso", "Ocioso", "Em manutenção", "Inativo", "Baixado"].map(value => <option key={value}>{value}</option>)}</select><select name="department" aria-label="Setor" defaultValue={departmentId} className={selectClass}><option value="">Todos os setores</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select>{tab !== "sem-tombamento" && <select name="category" aria-label="Categoria" defaultValue={categoryId} className={selectClass}><option value="">Todas as categorias</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>}<button type="submit" className="inline-flex h-7 items-center gap-1 rounded bg-blue-900 px-2 text-xs font-semibold text-white"><Search className="size-3" />Filtrar</button><Link href={patrimonioListHref("/patrimonio/bens", 1, { tab })} className="text-[11px] underline">Limpar</Link></form>}
      pagination={<ErpPagination page={page} total={total} pageSize={20} label={tab === "sem-tombamento" ? "equipamentos" : "bens"} previousHref={patrimonioListHref("/patrimonio/bens", page - 1, filters)} nextHref={patrimonioListHref("/patrimonio/bens", page + 1, filters)} jumpTo={{ pathname: "/patrimonio/bens", values: filters }} />}
    ><ResizableTable key={tab} columns={columns} storageKey={`patrimonio-bens-${tab}-columns-v1`}>
      {!total && <tr><td colSpan={columns.length} className="p-6 text-center text-slate-500">Nenhum registro encontrado para os filtros.</td></tr>}
      {assets.map(asset => <tr key={asset.id} className="h-7 hover:bg-slate-50"><td className="px-3 font-semibold text-emerald-800"><Link href={`/patrimonio/bens/${encodeURIComponent(asset.id)}`} className="block truncate">{asset.code || "Não identificado"}</Link></td><td className="px-3"><span className="block truncate">{asset.patrimonyNumber}</span></td>{tab === "tombamento" && <td className="px-3 tabular-nums">{asset.acquisitionDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>}<td className="px-3 font-medium" title={asset.name}><span className="block truncate">{asset.name}</span></td>{tab === "tombamento" ? <td className="px-3"><span className="block truncate">{[asset.brand, asset.model].filter(Boolean).join(" ") || "—"}</span></td> : <td className="px-3"><span className="block truncate">{asset.category.name}</span></td>}<td className="px-3" title={asset.department?.name}><span className="block truncate">{asset.realEstate ? `${asset.realEstate.propertyType} · ${asset.realEstate.streetName || "Sem endereço"}` : asset.department?.name || "Não vinculado"}</span></td>{tab !== "tombamento" && <><td className="px-3"><span className="block truncate">{asset.responsible?.name || "Não vinculado"}</span></td><td className="px-3"><Badge variant={asset.status === "Baixado" ? "destructive" : "secondary"} className="truncate px-1.5 py-0 text-[10px]">{asset.status}</Badge></td></>}<td className="px-3 text-right tabular-nums">{money(tab === "tombamento" ? Number(asset.acquisitionValueDecimal ?? asset.acquisitionValue) : Number(asset.currentValueDecimal ?? asset.currentValue))}</td><td className="px-2"><AssetRowActions asset={asset} canUpdate={canUpdate} /></td></tr>)}
      {custodies.map(equipment => <tr key={equipment.id} className="h-7 hover:bg-slate-50"><td className="px-3 font-semibold text-emerald-800">{equipment.code}</td><td className="px-3 text-slate-500">Sem tombamento</td><td className="px-3 font-medium"><span className="block truncate">{equipment.name}</span></td><td className="px-3"><span className="block truncate">{equipment.material.category.name}</span></td><td className="px-3"><span className="block truncate">{equipment.department.name}</span></td><td className="px-3"><span className="block truncate">{equipment.responsible.name}</span></td><td className="px-3">{equipment.status}</td><td className="px-3 text-right text-slate-500">Não incorporado</td><td className="px-2 text-right">{canUpdate && <Link href={`/patrimonio/bens/editar?id=${encodeURIComponent(equipment.id)}&kind=custody`} className="text-emerald-800 underline">Editar</Link>}</td></tr>)}
    </ResizableTable></ErpListFrame>
  </div>;
}
