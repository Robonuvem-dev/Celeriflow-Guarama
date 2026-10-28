import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { databaseTimestamp } from "@/db/temporal";
import { materials as materialTable, warehouses as warehouseTable, materialCategories, materialSubcategories, materialStocks } from "@/db/schema/assets-stock";
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

function materialOrder(order: MaterialOrder) {
  if (order === "code-desc") return desc(materialTable.code);
  if (order === "name-asc") return asc(materialTable.name);
  if (order === "name-desc") return desc(materialTable.name);
  if (order === "description-asc") return asc(materialTable.description);
  if (order === "description-desc") return desc(materialTable.description);
  return asc(materialTable.code);
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
  const pattern = `%${q}%`;
  const catalogWhere = and(
    eq(materialTable.type, type), categoryId ? eq(materialTable.categoryId, categoryId) : undefined,
    q ? or(ilike(materialTable.name, pattern), ilike(materialTable.code, pattern), ilike(materialTable.description, pattern)) : undefined,
    status === "ATIVO" || status === "SEM_ESTOQUE" ? eq(materialTable.isActive, true) : status === "INATIVO" ? eq(materialTable.isActive, false) : undefined,
    status === "SEM_ESTOQUE" ? sql`NOT EXISTS (SELECT 1 FROM "MaterialStock" s WHERE s."materialId"=${materialTable.id} AND s.quantity>0 ${warehouseId ? sql`AND s."warehouseId"=${warehouseId}` : sql``})` : undefined,
    warehouseId && status !== "SEM_ESTOQUE" ? sql`EXISTS (SELECT 1 FROM "MaterialStock" s WHERE s."materialId"=${materialTable.id} AND s."warehouseId"=${warehouseId})` : undefined,
  );
  const catalogValues = { q, type, category: categoryId, status, warehouse: warehouseId, order };
  const [{ total: catalogTotal }] = await db.select({ total: count() }).from(materialTable).where(catalogWhere);
  const page = view === "movimentar" ? 1 : clampPatrimonioListPage(requestedPage, catalogTotal);

  const [materials, warehouses, categories, movementMaterials, settlements, subcategories] = await Promise.all([
    view === "catalogo" ? db.select({ material: materialTable, category: { id: materialCategories.id, name: materialCategories.name }, subcategory: { name: materialSubcategories.name } }).from(materialTable)
      .innerJoin(materialCategories, eq(materialCategories.id, materialTable.categoryId)).leftJoin(materialSubcategories, eq(materialSubcategories.id, materialTable.subcategoryId))
      .where(catalogWhere).orderBy(materialOrder(order), asc(materialTable.id)).offset((page - 1) * PATRIMONIO_LIST_PAGE_SIZE).limit(PATRIMONIO_LIST_PAGE_SIZE)
      .then(async rows => {
        const stocks = rows.length ? await db.select({ materialId: materialStocks.materialId, quantity: materialStocks.quantity, unitCost: materialStocks.unitCost, expirationDate: materialStocks.expirationDate, warehouse: { id: warehouseTable.id, name: warehouseTable.name } }).from(materialStocks)
          .innerJoin(warehouseTable, eq(warehouseTable.id, materialStocks.warehouseId)).where(inArray(materialStocks.materialId, rows.map(row => row.material.id))) : [];
        return rows.map(row => ({ ...row.material, category: row.category, subcategory: row.subcategory, stocks: stocks.filter(stock => stock.materialId === row.material.id) }));
      }) : Promise.resolve([]),
    db.select({ id: warehouseTable.id, name: warehouseTable.name }).from(warehouseTable).where(eq(warehouseTable.isActive, true)).orderBy(asc(warehouseTable.name)),
    db.select({ id: materialCategories.id, name: materialCategories.name }).from(materialCategories).where(eq(materialCategories.isActive, true)).orderBy(asc(materialCategories.name)),
    view === "movimentar" ? db.select({ id: materialTable.id, code: materialTable.code, name: materialTable.name }).from(materialTable).where(and(eq(materialTable.isActive, true), eq(materialTable.type, type))).orderBy(asc(materialTable.name)).limit(200) : Promise.resolve([]),
    view === "movimentar" ? db.execute<{ id: string; date: string; value: number; number: string }>(sql`SELECT s.id, s.date, s.value, c.number FROM "Settlement" s JOIN "Commitment" c ON c.id=s."commitmentId" WHERE s.status='Liquidado' ORDER BY s.date DESC LIMIT 100`)
      .then(result => result.rows.map(row => ({ id: row.id, date: databaseTimestamp(row.date), value: row.value, commitment: { number: row.number } }))) : Promise.resolve([]),
    db.select({ id: materialSubcategories.id, categoryId: materialSubcategories.categoryId, name: materialSubcategories.name }).from(materialSubcategories).innerJoin(materialCategories, eq(materialCategories.id, materialSubcategories.categoryId))
      .where(and(eq(materialSubcategories.isActive, true), eq(materialCategories.isActive, true))).orderBy(asc(materialSubcategories.name)),
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
