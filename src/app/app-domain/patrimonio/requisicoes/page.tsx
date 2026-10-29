import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../_components/operational-columns";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { and, count, desc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { materialRequests, materialRequestItems } from "@/db/schema/assets-requests";
import { warehouses } from "@/db/schema/assets-stock";
import { departments, employees } from "@/db/schema/administration";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import {
  clampPatrimonioListPage,
  parsePatrimonioListPage,
  PATRIMONIO_LIST_PAGE_SIZE,
} from "../listing";

type SearchParams = { q?: string; status?: string; page?: string };

export default async function RequisicoesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await getTenantContextForModule("PATRIMONIO");
  const params = await searchParams;
  const q = params?.q?.trim() || "";
  const status = params?.status || "";
  const requestedPage = parsePatrimonioListPage(params?.page);
  const where = and(q ? ilike(materialRequests.number, `%${q}%`) : undefined, status ? eq(materialRequests.status, status) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(materialRequests).where(where);
  const page = clampPatrimonioListPage(requestedPage, total);
  const requests = await db.select({ request: materialRequests, department: { name: departments.name }, requester: { name: employees.name }, sourceWarehouse: { name: warehouses.name } }).from(materialRequests)
    .innerJoin(departments, eq(departments.id, materialRequests.departmentId)).innerJoin(employees, eq(employees.id, materialRequests.requesterId)).leftJoin(warehouses, eq(warehouses.id, materialRequests.sourceWarehouseId))
    .where(where).orderBy(desc(materialRequests.date)).offset((page - 1) * PATRIMONIO_LIST_PAGE_SIZE).limit(PATRIMONIO_LIST_PAGE_SIZE).then(async rows => {
      const items = rows.length ? await db.select({ id: materialRequestItems.id, requestId: materialRequestItems.requestId }).from(materialRequestItems).where(inArray(materialRequestItems.requestId, rows.map(row => row.request.id))) : [];
      return rows.map(row => ({ ...row.request, department: row.department, requester: row.requester, sourceWarehouse: row.sourceWarehouse, items: items.filter(item => item.requestId === row.request.id) }));
    });
  const hrefValues = { q, status };

  return (
    <>
      <OperationalHeaderActions>
          <Link href="/patrimonio/requisicoes/nova" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">Nova requisição</span>
            <span className="sm:hidden">Nova</span>
          </Link>
      </OperationalHeaderActions>

      <OperationalListFrame
        toolbar={
          <form className="flex min-w-0 items-center gap-2" role="search">
            <Input
              name="q"
              aria-label="Número da requisição"
              defaultValue={q}
              placeholder="Número da requisição"
              className="h-8 min-w-0 flex-1 bg-white text-xs sm:min-w-64"
            />
            <select
              name="status"
              defaultValue={status}
              aria-label="Filtrar por situação"
              className="h-8 w-40 rounded-md border border-input bg-white px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Todas as situações</option>
              <option value="Pendente">Pendente</option>
              <option value="Aprovada">Aprovada — aguardando entrega</option>
              <option value="Atendida Parcialmente">Atendida parcialmente</option>
              <option value="Atendida">Atendida</option>
              <option value="Recusada">Recusada</option>
            </select>
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              <Search className="size-3.5" />
              Filtrar
            </button>
          </form>
        }
        pagination={
          <OperationalLinkPagination page={page} total={total} pathname="/patrimonio/requisicoes" values={hrefValues} />
        }
      >
        <OperationalTable preferenceId="patrimonio-requisicoes" caption="Requisições internas" emptyMessage="Nenhuma requisição encontrada para os filtros informados." columns={operationalColumns([
          ["number", "Número", 140, 100, "identifier"], ["date", "Data", 110, 90], ["source", "Almoxarifado de origem", 210, 140],
          ["destination", "Destino", 180, 110], ["requester", "Solicitante", 180, 110], ["items", "Itens", 70, 60, "text", "right"],
          ["status", "Situação", 190, 120, "status"], ["actions", "Ação", 90, 80, "actions"],
        ])} rows={requests.map(request => ({ id: request.id, label: request.number, values: {
          number: request.number, date: request.date.toLocaleDateString("pt-BR", { timeZone: "UTC" }), source: request.sourceWarehouse?.name || "Origem no atendimento",
          destination: request.department?.name || "Setor não informado", requester: request.requester?.name || "Sem solicitante", items: String(request.items.length), status: request.status,
        }, cells: { number: <Link href={`/patrimonio/requisicoes/${request.id}`}>{request.number}</Link> }, actions: <Link href={`/patrimonio/requisicoes/${encodeURIComponent(request.id)}`} className="text-emerald-800 underline">{request.status === "Pendente" ? "Analisar" : ["Aprovada", "Atendida Parcialmente"].includes(request.status) ? "Atender" : "Consultar"}</Link> }))} />
      </OperationalListFrame>
    </>
  );
}
