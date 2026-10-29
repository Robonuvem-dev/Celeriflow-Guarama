import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { asc, count, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { costCenters as costCenterTable } from "@/db/schema/master-data";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import {
  clampPatrimonioListPage,
  parsePatrimonioListPage,
  PATRIMONIO_LIST_PAGE_SIZE,
} from "../listing";
import { CostCenterTable } from "./CostCenterTable";

type SearchParams = { q?: string; page?: string };

export default async function CentrosCustoPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const context = await getTenantContextForModule("PATRIMONIO");
  const params = await searchParams;
  const q = params?.q?.trim() || "";
  const requestedPage = parsePatrimonioListPage(params?.page);
  const pattern = `%${q}%`;
  const where = q ? or(ilike(costCenterTable.code, pattern), ilike(costCenterTable.name, pattern), ilike(costCenterTable.description, pattern)) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(costCenterTable).where(where);
  const page = clampPatrimonioListPage(requestedPage, total);
  const costCenters = await db.select({ costCenter: costCenterTable, warehouses: sql<number>`(SELECT count(*)::int FROM "Warehouse" WHERE "costCenterId"="CostCenter"."id")` }).from(costCenterTable)
    .where(where).orderBy(asc(costCenterTable.code), asc(costCenterTable.name)).offset((page - 1) * PATRIMONIO_LIST_PAGE_SIZE).limit(PATRIMONIO_LIST_PAGE_SIZE)
    .then(rows => rows.map(row => ({ ...row.costCenter, _count: { warehouses: row.warehouses } })));
  const canCreate = canPerformModuleOperation(context.user, "PATRIMONIO", "create");
  const canUpdate = canPerformModuleOperation(context.user, "PATRIMONIO", "update");
  const canDelete = canPerformModuleOperation(context.user, "PATRIMONIO", "delete");

  return (
    <>
      <OperationalHeaderActions>{canCreate ? <Link href="/patrimonio/centros-custo/novo" className={buttonVariants({ size: "sm" })}><Plus className="size-3.5" />Novo centro de custo</Link> : undefined}</OperationalHeaderActions>
      <OperationalListFrame
        toolbar={<form className="flex items-center gap-2" role="search"><Input name="q" aria-label="Código, nome ou descrição" defaultValue={q} placeholder="Código, nome ou descrição" className="h-8 min-w-0 flex-1 bg-white text-xs sm:max-w-xl" /><button type="submit" className={buttonVariants({ size: "sm" })}><Search className="size-3.5" />Buscar</button></form>}
        pagination={<OperationalLinkPagination page={page} total={total} pathname="/patrimonio/centros-custo" values={{ q }} />}
      >
        <CostCenterTable costCenters={costCenters.map((costCenter) => ({ id: costCenter.id, code: costCenter.code, name: costCenter.name, description: costCenter.description, isActive: costCenter.isActive, warehouseCount: costCenter._count.warehouses }))} canUpdate={canUpdate} canDelete={canDelete} />
      </OperationalListFrame>
    </>
  );
}
