import { Input } from "@/components/ui/input";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
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
  const columns = tab === "tombamento" ? operationalColumns([
    ["code", "Código", 115, 75, "identifier"], ["patrimony", "Tombamento", 120, 85], ["date", "Data", 100, 85],
    ["name", "Descrição do bem", 270, 110], ["brand", "Marca", 120, 65], ["model", "Modelo", 120, 65],
    ["location", "Setor", 190, 80], ["value", "Valor aquisição", 140, 100, "text", "right"], ["actions", "Ações", 85, 85, "actions"],
  ]) : operationalColumns([
    ["code", "Código", 115, 75, "identifier"], ["patrimony", "Tombamento", 120, 85], ["name", "Descrição do equipamento", 270, 120],
    ["category", "Categoria", 180, 80], ["location", "Localização", 190, 85], ["responsible", "Responsável", 180, 85],
    ["status", "Situação", 120, 80, "status"], ["value", "Valor atual", 140, 100, "text", "right"], ["actions", "Ações", 85, 85, "actions"],
  ]);
  const rows: OperationalRow[] = [
    ...assets.map(asset => ({ id: asset.id, label: asset.name, values: {
      code: asset.code || "Não identificado", patrimony: asset.patrimonyNumber, date: asset.acquisitionDate.toLocaleDateString("pt-BR", { timeZone: "UTC" }), name: asset.name,
      brand: asset.brand || "—", model: asset.model || "—", category: asset.category.name,
      location: asset.realEstate ? `${asset.realEstate.propertyType} · ${asset.realEstate.streetName || "Sem endereço"}` : asset.department?.name || "Não vinculado",
      responsible: asset.responsible?.name || "Não vinculado", status: asset.status,
      value: money(tab === "tombamento" ? Number(asset.acquisitionValueDecimal ?? asset.acquisitionValue) : Number(asset.currentValueDecimal ?? asset.currentValue)),
    }, cells: { code: <Link href={`/patrimonio/bens/${encodeURIComponent(asset.id)}`}>{asset.code || "Não identificado"}</Link> }, actions: <AssetRowActions asset={asset} canUpdate={canUpdate} /> })),
    ...custodies.map(equipment => ({ id: equipment.id, label: equipment.name, values: {
      code: equipment.code, patrimony: "Sem tombamento", name: equipment.name, category: equipment.material.category.name,
      location: equipment.department.name, responsible: equipment.responsible.name, status: equipment.status, value: "Não incorporado",
    }, actions: canUpdate && <Link href={`/patrimonio/bens/editar?id=${encodeURIComponent(equipment.id)}&kind=custody`} className="text-emerald-800 underline">Editar</Link> })),
  ];

  return <OperationalListFrame actions={<>
    <select aria-label="Visão dos bens" form="asset-view" name="tab" defaultValue={tab} className={selectClass}>
      <option value="lista">Lista de bens</option><option value="tombamento">Histórico de tombamento</option><option value="sem-tombamento">Em uso sem tombamento</option>
    </select><form id="asset-view"><input type="hidden" name="q" value={q} /><input type="hidden" name="status" value={status} /><input type="hidden" name="department" value={departmentId} /><input type="hidden" name="category" value={categoryId} /><button className={styles.dialogButton}>Mudar visão</button></form>
    <Link href="/patrimonio/bens/estoque" className={styles.dialogButton}>Estoque</Link><Link href="/patrimonio/ciclo-vida" className={styles.dialogButton}>Ciclo de vida</Link>
    {canCreate && <Link href="/patrimonio/bens/novo" className={styles.newButton}><Plus />Tombar bem</Link>}
  </>} toolbar={<>
    <form id="asset-search" role="search" className={styles.searchForm}><input type="hidden" name="tab" value={tab} /><input type="hidden" name="status" value={status} /><input type="hidden" name="department" value={departmentId} /><input type="hidden" name="category" value={categoryId} /><Input aria-label="Pesquisar bens" name="q" defaultValue={q} placeholder="Código, tombamento, descrição, marca, modelo ou responsável" className={styles.searchInput} /><button type="submit" className={styles.iconButton} aria-label="Pesquisar"><Search /></button></form>
    <OperationalFilters activeCount={[status, departmentId, categoryId].filter(Boolean).length}>
      <form className={styles.filterFields}><input type="hidden" name="tab" value={tab} /><input type="hidden" name="q" value={q} />
        <label>Situação<select name="status" defaultValue={status} className={selectClass}><option value="">Todas as situações</option>{["Ativo", "Em uso", "Ocioso", "Em manutenção", "Inativo", "Baixado"].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Setor<select name="department" defaultValue={departmentId} className={selectClass}><option value="">Todos os setores</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        {tab !== "sem-tombamento" && <label>Categoria<select name="category" defaultValue={categoryId} className={selectClass}><option value="">Todas as categorias</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
        <button className={styles.primaryButton}>Aplicar</button><Link href={patrimonioListHref("/patrimonio/bens", 1, { tab })}>Limpar</Link>
      </form>
    </OperationalFilters>
    {tab === "sem-tombamento" && <OperationalFilters label="Sobre equipamentos"><p>Controle físico dos equipamentos entregues por requisição, com setor e recebedor. O código EQP identifica o equipamento; o tombamento é a incorporação patrimonial individual e possui registro próprio.</p></OperationalFilters>}
  </>} pagination={<OperationalLinkPagination page={page} total={total} pathname="/patrimonio/bens" values={filters} />}>
    <OperationalTable key={tab} columns={columns} rows={rows} preferenceId={`patrimonio-bens-${tab}`} caption="Bens patrimoniais e equipamentos" emptyMessage="Nenhum registro encontrado para os filtros." />
  </OperationalListFrame>;
}
