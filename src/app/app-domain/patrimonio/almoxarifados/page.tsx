import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { asc, count, eq, ilike } from "drizzle-orm";
import { db } from "@/db/client";
import { warehouses as warehouseTable } from "@/db/schema/assets-stock";
import { employees } from "@/db/schema/administration";
import { costCenters } from "@/db/schema/master-data";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import {
  clampPatrimonioListPage,
  parsePatrimonioListPage,
  PATRIMONIO_LIST_PAGE_SIZE,
} from "../listing";
import { WarehouseTable } from "./WarehouseTable";

type SearchParams = { q?: string; page?: string };

export default async function AlmoxarifadosPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const context = await getTenantContextForModule("PATRIMONIO");
  const params = await searchParams;
  const q = params?.q?.trim() || "";
  const requestedPage = parsePatrimonioListPage(params?.page);
  const where = q ? ilike(warehouseTable.name, `%${q}%`) : undefined;

  const [{ total }] = await db.select({ total: count() }).from(warehouseTable).where(where);
  const page = clampPatrimonioListPage(requestedPage, total);
  const warehouses = await db.select({ warehouse: warehouseTable, manager: { name: employees.name }, costCenter: { code: costCenters.code, name: costCenters.name } }).from(warehouseTable)
    .leftJoin(employees, eq(employees.id, warehouseTable.managerId)).leftJoin(costCenters, eq(costCenters.id, warehouseTable.costCenterId))
    .where(where).orderBy(asc(warehouseTable.name)).offset((page - 1) * PATRIMONIO_LIST_PAGE_SIZE).limit(PATRIMONIO_LIST_PAGE_SIZE)
    .then(rows => rows.map(row => ({ ...row.warehouse, manager: row.manager, costCenter: row.costCenter })));
  const canCreate = canPerformModuleOperation(context.user, "PATRIMONIO", "create");
  const canUpdate = canPerformModuleOperation(context.user, "PATRIMONIO", "update");
  const canDelete = canPerformModuleOperation(context.user, "PATRIMONIO", "delete");

  return (
    <>
      <OperationalHeaderActions>
          {canCreate ? <Link href="/patrimonio/almoxarifados/novo" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">Novo almoxarifado</span>
            <span className="sm:hidden">Novo</span>
          </Link> : undefined}
      </OperationalHeaderActions>

      <OperationalListFrame
        toolbar={
          <form className="flex items-center gap-2" role="search">
            <Input
              name="q"
              aria-label="Nome do almoxarifado"
              defaultValue={q}
              placeholder="Nome do almoxarifado"
              className="h-8 min-w-0 flex-1 bg-white text-xs sm:max-w-xl"
            />
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              <Search className="size-3.5" />
              Buscar
            </button>
          </form>
        }
        pagination={
          <OperationalLinkPagination page={page} total={total} pathname="/patrimonio/almoxarifados" values={{ q }} />
        }
      >
        <WarehouseTable warehouses={warehouses.map((warehouse) => ({ id: warehouse.id, name: warehouse.name, type: warehouse.type, address: warehouse.address, zipCode: warehouse.zipCode, streetName: warehouse.streetName, number: warehouse.number, neighborhood: warehouse.neighborhood, city: warehouse.city, state: warehouse.state, isActive: warehouse.isActive, managerName: warehouse.manager?.name || null, costCenterName: warehouse.costCenter ? `${warehouse.costCenter.code} · ${warehouse.costCenter.name}` : null }))} canUpdate={canUpdate} canDelete={canDelete} />
      </OperationalListFrame>
    </>
  );
}
