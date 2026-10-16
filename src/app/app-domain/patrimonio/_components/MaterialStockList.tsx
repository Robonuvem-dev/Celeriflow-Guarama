import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import type { Prisma } from "@prisma/client";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { StockOperationsClient } from "../materiais/StockOperationsClient";
import { MaterialCatalogTable } from "../materiais/MaterialCatalogTable";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { clampPatrimonioListPage, patrimonioListHref, parsePatrimonioListPage, PATRIMONIO_LIST_PAGE_SIZE } from "../listing";

type MaterialView = "catalogo" | "movimentar";
type MaterialStatus = "" | "ATIVO" | "INATIVO" | "SEM_ESTOQUE";
type MaterialOrder = "code-asc" | "code-desc" | "name-asc" | "name-desc" | "description-asc" | "description-desc";
type SearchParams = { q?: string; page?: string; view?: string; type?: string; category?: string; status?: string; warehouse?: string; order?: string };

function getStatus(value?: string): MaterialStatus {
  return value === "ATIVO" || value === "INATIVO" || value === "SEM_ESTOQUE" ? value : "";
}

function getOrder(value?: string): MaterialOrder {
  return value === "code-desc" || value === "name-asc" || value === "name-desc" || value === "description-asc" || value === "description-desc" ? value : "code-asc";
}

function materialOrder(order: MaterialOrder): Prisma.MaterialOrderByWithRelationInput {
  if (order === "code-desc") return { code: "desc" };
  if (order === "name-asc") return { name: "asc" };
  if (order === "name-desc") return { name: "desc" };
  if (order === "description-asc") return { description: "asc" };
  if (order === "description-desc") return { description: "desc" };
  return { code: "asc" };
}

function currencyCost(stocks: { quantity: number; unitCost: number | null }[]) {
  const priced = stocks.filter(stock => stock.unitCost !== null);
  if (!priced.length) return null;
  const quantity = priced.reduce((total, stock) => total + Math.max(stock.quantity, 0), 0);
  if (quantity === 0) return priced[0].unitCost;
  return priced.reduce((total, stock) => total + Math.max(stock.quantity, 0) * (stock.unitCost || 0), 0) / quantity;
}

export async function MaterialStockList({ searchParams, equipmentOnly = false }: { searchParams?: Promise<SearchParams>; equipmentOnly?: boolean }) {
  const context = await getTenantContextForModule("PATRIMONIO");
  const { prisma } = context;
  const params = await searchParams;
  const q = params?.q?.trim() || "";
  const view: MaterialView = params?.view === "movimentar" ? "movimentar" : "catalogo";
  const type = equipmentOnly ? "PATRIMONIO" : "MATERIAL";
  const pathname = equipmentOnly ? "/patrimonio/bens/estoque" : "/patrimonio/materiais";
  const categoryId = params?.category || "";
  const status = getStatus(params?.status);
  const warehouseId = params?.warehouse || "";
  const order = getOrder(params?.order);
  const requestedPage = parsePatrimonioListPage(params?.page);
  const whereParts: Prisma.MaterialWhereInput[] = [];
  if (q) whereParts.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] });
  if (type) whereParts.push({ type });
  if (categoryId) whereParts.push({ categoryId });
  if (status === "ATIVO") whereParts.push({ isActive: true });
  if (status === "INATIVO") whereParts.push({ isActive: false });
  if (status === "SEM_ESTOQUE") whereParts.push({ isActive: true, stocks: { none: warehouseId ? { warehouseId, quantity: { gt: 0 } } : { quantity: { gt: 0 } } } });
  if (warehouseId && status !== "SEM_ESTOQUE") whereParts.push({ stocks: { some: { warehouseId } } });
  const catalogWhere: Prisma.MaterialWhereInput = whereParts.length ? { AND: whereParts } : {};
  const catalogValues = { q, type, category: categoryId, status, warehouse: warehouseId, order };
  const catalogTotal = await prisma.material.count({ where: catalogWhere });
  const page = view === "movimentar" ? 1 : clampPatrimonioListPage(requestedPage, catalogTotal);

  const [materials, warehouses, categories, movementMaterials, settlements, subcategories] = await Promise.all([
    view === "catalogo" ? prisma.material.findMany({
      where: catalogWhere, skip: (page - 1) * PATRIMONIO_LIST_PAGE_SIZE, take: PATRIMONIO_LIST_PAGE_SIZE,
      orderBy: [materialOrder(order), { id: "asc" }],
      include: { category: { select: { id: true, name: true } }, subcategory: { select: { name: true } }, stocks: { select: { quantity: true, unitCost: true, expirationDate: true, warehouse: { select: { id: true, name: true } } } } },
    }) : Promise.resolve([]),
    prisma.warehouse.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.materialCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    view === "movimentar" ? prisma.material.findMany({ where: { isActive: true, type }, take: 200, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }) : Promise.resolve([]),
    view === "movimentar" ? prisma.settlement.findMany({ where: { status: "Liquidado" }, take: 100, orderBy: { date: "desc" }, select: { id: true, date: true, value: true, commitment: { select: { number: true } } } }) : Promise.resolve([]),
    prisma.materialSubcategory.findMany({ where: { isActive: true, category: { isActive: true } }, select: { id: true, categoryId: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const selectedWarehouse = warehouses.find(warehouse => warehouse.id === warehouseId);
  const canCreate = canPerformModuleOperation(context.user, "PATRIMONIO", "create");
  const canUpdate = canPerformModuleOperation(context.user, "PATRIMONIO", "update");
  const canDelete = canPerformModuleOperation(context.user, "PATRIMONIO", "delete");
  const panelHref = (nextView: MaterialView, nextPage = 1) => patrimonioListHref(pathname, nextPage, nextView === "catalogo" ? { ...catalogValues, view: nextView } : { view: nextView });
  const materialRows = materials.map(material => {
    const visibleStocks = warehouseId ? material.stocks.filter(stock => stock.warehouse.id === warehouseId) : material.stocks;
    const totalStock = visibleStocks.reduce((total, stock) => total + stock.quantity, 0);
    const earliestExpiration = visibleStocks.filter(stock => stock.quantity > 0).flatMap(stock => stock.expirationDate ? [stock.expirationDate] : []).sort((left, right) => left.valueOf() - right.valueOf())[0];
    const warehouseLabel = [...new Set(visibleStocks.map(stock => stock.warehouse.name))].join(", ") || (selectedWarehouse ? selectedWarehouse.name : "Sem saldo");
    const materialStatus: "Ativo" | "Inativo" | "Sem estoque" = !material.isActive ? "Inativo" : totalStock <= 0 ? "Sem estoque" : "Ativo";
    return {
      id: material.id, code: material.code, name: material.name, description: material.description,
      type: material.type === "PATRIMONIO" ? "PATRIMONIO" as const : "MATERIAL" as const,
      unitOfMeasure: material.unitOfMeasure, minStock: material.minStock, categoryId: material.categoryId,
      categoryName: material.category.name, subcategoryId: material.subcategoryId, subcategoryName: material.subcategory?.name ?? null,
      status: materialStatus, totalStock, warehouseLabel, unitCost: currencyCost(visibleStocks),
      expirationLabel: earliestExpiration ? earliestExpiration.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "-",
    };
  });
  const selectClass = "h-8 max-w-44 rounded-md border border-input bg-white px-2 text-xs";

  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3">
    <ErpPageTitle title={equipmentOnly ? "Equipamentos em estoque" : "Estoque de Materiais"} action={equipmentOnly ? <Link href="/patrimonio/bens" className="text-xs underline">Bens patrimoniais</Link> : undefined} />
    {view === "catalogo" && <ErpListFrame
      toolbar={<form className="flex flex-wrap items-center gap-2" role="search">
        <input type="hidden" name="view" value="catalogo" />
        <Input name="q" aria-label="Buscar material" defaultValue={q} placeholder="Código, nome ou descrição" className="h-8 min-w-0 flex-1 bg-white text-xs sm:min-w-52" />
        <select name="category" defaultValue={categoryId} aria-label="Filtrar por categoria" className={selectClass}><option value="">Categoria: todas</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <select name="status" defaultValue={status} aria-label="Filtrar por status" className={selectClass}><option value="">Status: todos</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="SEM_ESTOQUE">Sem estoque</option></select>
        <select name="warehouse" defaultValue={warehouseId} aria-label="Filtrar por almoxarifado" className={selectClass}><option value="">Almoxarifado: todos</option>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
        <select name="order" defaultValue={order} aria-label="Ordenar materiais" className={selectClass}><option value="code-asc">Código: A-Z</option><option value="code-desc">Código: Z-A</option><option value="name-asc">Nome: A-Z</option><option value="name-desc">Nome: Z-A</option><option value="description-asc">Descrição: A-Z</option><option value="description-desc">Descrição: Z-A</option></select>
        <div className="flex items-center gap-2">
          <button type="submit" className={buttonVariants({ size: "sm", variant: "outline" })}><Search className="size-3.5" />Filtro</button>
          {canCreate && <Link href={equipmentOnly ? "/patrimonio/materiais/novo?type=PATRIMONIO" : "/patrimonio/materiais/novo"} className={buttonVariants({ size: "sm" })}><Plus className="size-3.5" />{equipmentOnly ? "Novo equipamento" : "Novo material"}</Link>}
        </div>
        {canUpdate && <Link href={panelHref("movimentar")} className="text-xs font-semibold text-emerald-800 underline">Movimentar</Link>}
        <Link href={pathname} className="text-xs text-slate-500 underline">Limpar</Link>
      </form>}
      summary={<p className="text-[11px] text-slate-600"><strong className="text-slate-900">{catalogTotal}</strong> {equipmentOnly ? "equipamentos" : "materiais"} · 20 por página · Arraste as bordas dos cabeçalhos para ajustar as colunas.</p>}
      pagination={<ErpPagination page={page} total={catalogTotal} pageSize={PATRIMONIO_LIST_PAGE_SIZE} label={equipmentOnly ? "equipamentos" : "materiais"} previousHref={panelHref("catalogo", page - 1)} nextHref={panelHref("catalogo", page + 1)} jumpTo={{ pathname, values: { ...catalogValues, view: "catalogo" } }} />}
    ><MaterialCatalogTable materials={materialRows} categories={categories} subcategories={subcategories} canUpdate={canUpdate} canDelete={canDelete} /></ErpListFrame>}
    {view === "movimentar" && <ErpListFrame toolbar={<div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-800">Registrar movimentação de estoque</p><Link href={panelHref("catalogo")} className="text-xs underline">Voltar ao estoque</Link></div>}><div className="p-3"><StockOperationsClient
      materials={movementMaterials.map(material => ({ id: material.id, label: `${material.code} - ${material.name}` }))}
      warehouses={warehouses.map(warehouse => ({ id: warehouse.id, label: warehouse.name }))}
      settlements={settlements.map(settlement => ({ id: settlement.id, label: `${settlement.commitment.number} - ${settlement.date.toLocaleDateString("pt-BR", { timeZone: "UTC" })} - ${settlement.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` }))}
    /></div></ErpListFrame>}
  </div>;
}
