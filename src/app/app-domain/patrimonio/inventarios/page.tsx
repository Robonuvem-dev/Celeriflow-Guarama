import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../_components/operational-columns";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
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

const statusLabel: Record<string, string> = {
  COUNTING: "Em contagem",
  PENDING_APPROVAL: "Aguardando aprovação",
  CLOSED: "Encerrado",
  CANCELLED: "Cancelado",
};

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

  return (
    <OperationalListFrame actions={<InventoryStartClient warehouses={warehouses} />} pagination={<OperationalLinkPagination page={page} total={total} pathname="/patrimonio/inventarios" />}>
      <OperationalTable preferenceId="patrimonio-inventarios" caption="Inventários de estoque" emptyMessage="Nenhum inventário registrado." columns={operationalColumns([
        ["start", "Início", 110, 90], ["warehouse", "Almoxarifado", 240, 130], ["manager", "Responsável", 200, 110],
        ["items", "Itens", 80, 60, "text", "right"], ["status", "Situação", 190, 120, "status"],
        ["lock", "Bloqueio", 100, 80], ["actions", "Ação", 70, 65, "actions"],
      ])} rows={sessions.map(session => ({ id: session.id, label: session.warehouse.name, values: {
        start: session.startedAt.toLocaleDateString("pt-BR", { timeZone: "UTC" }), warehouse: session.warehouse.name,
        manager: session.createdByUsuario.nome, items: String(session._count.items), status: statusLabel[session.status] ?? session.status,
        lock: session.lockMovements ? "Ativo" : "Liberado",
      }, actions: <Link href={`/patrimonio/inventarios/${session.id}`} className="text-emerald-800 underline">Abrir</Link> }))} />
    </OperationalListFrame>
  );
}
