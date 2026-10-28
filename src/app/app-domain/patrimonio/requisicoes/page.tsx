import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { Badge } from "@/components/ui/badge";
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
  patrimonioListHref,
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
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:p-3">
      <ErpPageTitle
        title="Requisições internas"
        action={
          <Link href="/patrimonio/requisicoes/nova" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">Nova requisição</span>
            <span className="sm:hidden">Nova</span>
          </Link>
        }
      />

      <ErpListFrame
        toolbar={
          <form className="flex flex-wrap items-center gap-2" role="search">
            <Input
              name="q"
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
        summary={<p className="text-[11px] text-slate-600">Abra a requisição para analisar e entregar. A entrega atualiza automaticamente o estoque e o saldo pendente.</p>}
        pagination={
          <ErpPagination
            page={page}
            total={total}
            pageSize={PATRIMONIO_LIST_PAGE_SIZE}
            label="requisições"
            previousHref={patrimonioListHref("/patrimonio/requisicoes", page - 1, hrefValues)}
            nextHref={patrimonioListHref("/patrimonio/requisicoes", page + 1, hrefValues)}
          />
        }
      >
        <table className="w-full min-w-[1050px] table-fixed text-left text-[11px] leading-4 text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <tr className="h-7">
              <th className="w-[17%] px-3 text-left">Número</th>
              <th className="w-[13%] px-3 text-left">Data</th>
              <th className="w-[18%] px-3 text-left">Almoxarifado de origem</th>
              <th className="w-[26%] px-3 text-left">Destino / solicitante</th>
              <th className="w-[12%] px-3 text-right">Itens</th>
              <th className="w-[22%] px-3 text-left">Situação</th>
              <th className="w-24 px-3 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-500">Nenhuma requisição encontrada para os filtros informados.</td></tr>
            ) : (
              requests.map((request) => (
                <tr key={request.id} className="h-[clamp(18px,2.65vh,28px)] border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-0 font-semibold text-emerald-800">
                    <Link href={`/patrimonio/requisicoes/${request.id}`} className="block truncate underline-offset-2 hover:underline">{request.number}</Link>
                  </td>
                   <td className="px-3 py-0 tabular-nums">{request.date.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                   <td className="px-3 py-0"><span className="block truncate">{request.sourceWarehouse?.name || "Origem no atendimento"}</span></td>
                  <td className="px-3 py-0"><span className="block truncate">{request.department?.name || "Setor não informado"} · {request.requester?.name || "Sem solicitante"}</span></td>
                  <td className="px-3 py-0 text-right tabular-nums">{request.items.length}</td>
                  <td className="px-3 py-0">
                    <Badge
                      variant={request.status === "Pendente" ? "secondary" : request.status === "Rejeitada" ? "destructive" : "default"}
                      className={request.status === "Atendida" ? "max-w-full truncate bg-emerald-600 px-1.5 py-0 text-[10px] leading-4 hover:bg-emerald-600" : "max-w-full truncate px-1.5 py-0 text-[10px] leading-4"}
                    >
                      {request.status}
                    </Badge>
                   </td>
                   <td className="px-3 text-right"><Link href={`/patrimonio/requisicoes/${encodeURIComponent(request.id)}`} className="font-semibold text-emerald-800 underline">{request.status === "Pendente" ? "Analisar" : ["Aprovada", "Atendida Parcialmente"].includes(request.status) ? "Atender" : "Consultar"}</Link></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ErpListFrame>
    </div>
  );
}
