import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { InventoryStartClient } from "./InventoryStartClient";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { warehouses as warehouseTable, inventorySessions } from "@/db/schema/assets-stock";
import { users } from "@/db/schema/identity";
import {
  clampPatrimonioListPage,
  parsePatrimonioListPage,
  PATRIMONIO_LIST_PAGE_SIZE,
} from "../listing";
import { InventariosClientList, type InventoryRow } from "./InventariosClientList";

type SearchParams = { page?: string };

export default async function InventariosPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await getTenantContextForModule("PATRIMONIO");
  const params = await searchParams;
  const requestedPage = parsePatrimonioListPage(params?.page);
  const [warehouses, total] = await Promise.all([
    db.select({ id: warehouseTable.id, name: warehouseTable.name }).from(warehouseTable).where(eq(warehouseTable.isActive, true)).orderBy(asc(warehouseTable.name)),
    db.select({ total: count() }).from(inventorySessions).then(rows => rows[0].total),
  ]);
  const page = clampPatrimonioListPage(requestedPage, total);
  const sessions = await db.select({ session: inventorySessions, warehouse: { name: warehouseTable.name }, createdByUsuario: { nome: users.nome }, items: sql<number>`(SELECT count(*)::int FROM "InventorySessionItem" WHERE "sessionId"=${inventorySessions.id})` }).from(inventorySessions)
    .innerJoin(warehouseTable, eq(warehouseTable.id, inventorySessions.warehouseId)).innerJoin(users, eq(users.id, inventorySessions.createdByUsuarioId))
    .orderBy(desc(inventorySessions.startedAt)).offset((page - 1) * PATRIMONIO_LIST_PAGE_SIZE).limit(PATRIMONIO_LIST_PAGE_SIZE)
    .then(rows => rows.map(row => ({ ...row.session, warehouse: row.warehouse, createdByUsuario: row.createdByUsuario, _count: { items: row.items } })));

  const sessionRows: InventoryRow[] = sessions.map(session => ({
    id: session.id,
    startedAt: session.startedAt.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
    warehouseName: session.warehouse.name,
    managerName: session.createdByUsuario.nome,
    itemCount: session._count.items,
    status: session.status,
    lockMovements: session.lockMovements,
  }));

  return (
    <OperationalListFrame actions={<InventoryStartClient warehouses={warehouses} />} pagination={<OperationalLinkPagination page={page} total={total} pathname="/patrimonio/inventarios" />}>
      <InventariosClientList sessions={sessionRows} />
    </OperationalListFrame>
  );
}
