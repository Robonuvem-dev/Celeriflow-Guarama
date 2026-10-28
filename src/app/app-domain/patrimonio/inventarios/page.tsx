import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { Badge } from "@/components/ui/badge";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import Link from "next/link";
import { InventoryStartClient } from "./InventoryStartClient";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { warehouses as warehouseTable, inventorySessions } from "@/db/schema/assets-stock";
import { users } from "@/db/schema/identity";
import {
  clampPatrimonioListPage,
  patrimonioListHref,
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
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3">
      <ErpPageTitle
        title="Inventários de estoque"
      />

      <ErpListFrame
        toolbar={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800">Iniciar inventário</p>
              <p className="hidden text-[10px] text-slate-500 lg:block">O saldo atual será congelado como posição esperada para cada material e lote.</p>
            </div>
            <InventoryStartClient warehouses={warehouses} />
          </div>
        }
        summary={<p className="text-[11px] text-slate-600"><strong className="text-slate-900">{total}</strong> inventário(s) registrado(s)</p>}
        pagination={
          <ErpPagination
            page={page}
            total={total}
            pageSize={PATRIMONIO_LIST_PAGE_SIZE}
            label="inventários"
            previousHref={patrimonioListHref("/patrimonio/inventarios", page - 1)}
            nextHref={patrimonioListHref("/patrimonio/inventarios", page + 1)}
          />
        }
      >
        <table className="w-full table-fixed text-left text-[11px] leading-4 text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <tr className="h-7">
              <th className="w-[13%] px-3 text-left">Início</th>
              <th className="w-[29%] px-3 text-left">Almoxarifado</th>
              <th className="hidden w-[20%] px-3 text-left lg:table-cell">Responsável</th>
              <th className="w-[12%] px-3 text-right">Itens</th>
              <th className="w-[24%] px-3 text-left">Situação</th>
              <th className="hidden w-[14%] px-3 text-left xl:table-cell">Bloqueio</th>
              <th className="w-[12%] px-3 text-left">Ação</th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">Nenhum inventário registrado.</td></tr>
            ) : (
              sessions.map((session) => (
                <tr key={session.id} className="h-[clamp(18px,2.65vh,28px)] border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-0 tabular-nums">{session.startedAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                  <td className="px-3 py-0"><span className="block truncate">{session.warehouse.name}</span></td>
                  <td className="hidden px-3 py-0 lg:table-cell"><span className="block truncate">{session.createdByUsuario.nome}</span></td>
                  <td className="px-3 py-0 text-right tabular-nums">{session._count.items}</td>
                  <td className="px-3 py-0">
                    <Badge variant={session.status === "CLOSED" ? "default" : "secondary"} className="max-w-full truncate px-1.5 py-0 text-[10px] leading-4">
                      {statusLabel[session.status] ?? session.status}
                    </Badge>
                  </td>
                  <td className="hidden px-3 py-0 xl:table-cell">{session.lockMovements ? "Ativo" : "Liberado"}</td>
                  <td className="px-3 py-0"><Link className="font-semibold text-emerald-800 underline-offset-2 hover:underline" href={`/patrimonio/inventarios/${session.id}`}>Abrir</Link></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ErpListFrame>
    </div>
  );
}
