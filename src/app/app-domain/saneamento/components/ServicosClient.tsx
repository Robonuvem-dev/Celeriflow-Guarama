"use client";

import { Wrench } from "lucide-react";
import { NewServiceOrderSheet } from "./NewServiceOrderSheet";
import { EditServiceOrderSheet } from "./EditServiceOrderSheet";

import { SanitationTable, SanitationPagination } from "./SanitationTable";
import { SanitationFilters } from "./SanitationFilters";
import { useSanitationList } from "./useSanitationList";
import type { SanitationPagination as Pagination } from "@/lib/saneamento/list-query";

type ServiceOrder = {
  id: string;
  orderNumber: string;
  orderType: string;
  description: string;
  priority: string;
  status: string;
  technician: string | null;
  createdAt: Date;
  unit: { code: string } | null;
};

const PRIORITY_COLORS: Record<string, string> = {
  Normal: "bg-emerald-100 text-emerald-700",
  Alta: "bg-amber-100 text-amber-700",
  Urgente: "bg-red-100 text-red-700",
};

const STATUS_COLORS: Record<string, string> = {
  Aberta: "bg-slate-100 text-slate-700 border border-slate-200",
  "Em Andamento": "bg-blue-50 text-blue-700 border border-blue-200",
  Concluída: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  Cancelada: "bg-red-50 text-red-500 border border-red-200",
};

export function ServicosClient({ orders, pagination }: { orders: ServiceOrder[]; pagination: Pagination }) {
  const list = useSanitationList(pagination);
  const { query, total } = pagination;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800" aria-label="Lista de ordens de serviço">
      <SanitationFilters query={query} onFilter={list.filter} placeholder="Buscar OS, identificador ou técnico..." filters={[
        { name: "status", label: "Todos os status", options: ["Aberta", "Em Andamento", "Concluída", "Cancelada"] },
        { name: "type", label: "Todos os tipos", options: ["Vazamento", "Religação", "Corte", "Manutenção", "Troca de Hidrômetro"] },
      ]}><NewServiceOrderSheet /></SanitationFilters>

      {/* Table */}
      {orders.length === 0 ? (
        <div className="min-h-0 flex-1 p-10 text-center text-gray-400 text-sm">
          <Wrench className="h-10 w-10 mx-auto mb-3 text-gray-200" />
          Nenhuma ordem de serviço encontrada.
        </div>
      ) : (
        <SanitationTable columns={[
          { label: "Nº OS", width: 18 }, { label: "Tipo", width: 18 }, { label: "Identificador", width: 15 },
          { label: "Técnico", width: 20 }, { label: "Prioridade", width: 10, align: "center" },
          { label: "Status", width: 12, align: "center" }, { label: "Ações", width: 7, align: "right" },
        ]}>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-3 py-2 text-xs font-mono font-medium text-gray-900 dark:text-white">{o.orderNumber}</td>
                  <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">{o.orderType}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{o.unit?.code ?? <span className="text-gray-300 italic">Rede pública</span>}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{o.technician || "-"}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[o.priority] ?? "bg-gray-100 text-gray-500"}`}>
                      {o.priority}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {o.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      <EditServiceOrderSheet order={o} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
        </SanitationTable>
      )}

      <SanitationPagination page={query.page} total={total} pageSize={20} onPageChange={list.setPage} />
</section>
  );
}
