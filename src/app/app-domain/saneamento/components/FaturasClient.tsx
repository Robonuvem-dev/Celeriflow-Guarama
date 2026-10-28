"use client";

import { Receipt } from "lucide-react";
import { SanitationTable, SanitationPagination } from "./SanitationTable";
import { SanitationFilters } from "./SanitationFilters";
import { useSanitationList } from "./useSanitationList";
import type { SanitationPagination as Pagination } from "@/lib/saneamento/list-query";

type Invoice = {
  id: string;
  invoiceNumber: string;
  competence: string;
  totalAmount: number;
  dueDate: string;
  status: string;
  unit: { code: string };
};

const STATUS_COLORS: Record<string, string> = {
  Emitida: "bg-yellow-100 text-yellow-700",
  Paga: "bg-green-100 text-green-700",
  Vencida: "bg-red-100 text-red-700",
  Cancelada: "bg-gray-100 text-gray-500",
};

export function FaturasClient({ invoices, pagination }: { invoices: Invoice[]; pagination: Pagination }) {
  const list = useSanitationList(pagination);
  const { query, total } = pagination;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800" aria-label="Lista de faturas">
      <SanitationFilters query={query} onFilter={list.filter} placeholder="Buscar fatura, identificador..." filters={[
        { name: "status", label: "Todos os status", options: ["Emitida", "Paga", "Vencida", "Cancelada"] },
      ]} />

      {/* Table */}
      {invoices.length === 0 ? (
        <div className="min-h-0 flex-1 p-10 text-center text-gray-400 text-sm">
          <Receipt className="h-10 w-10 mx-auto mb-3 text-gray-200" />
          Nenhuma fatura encontrada.
        </div>
      ) : (
        <SanitationTable columns={[
          { label: "Número", width: 24 }, { label: "Identificador", width: 19 },
          { label: "Competência", width: 15 }, { label: "Valor (R$)", width: 15, align: "right" },
          { label: "Vencimento", width: 15, align: "right" }, { label: "Status", width: 12, align: "center" },
        ]}>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-3 py-2 text-xs font-mono font-medium text-gray-900 dark:text-white">{inv.invoiceNumber}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{inv.unit.code}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{inv.competence}</td>
                  <td className="px-3 py-2 text-xs font-semibold text-gray-800 dark:text-gray-200 text-right">
                    R$ {inv.totalAmount.toFixed(2).replace(".", ",")}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 text-right">
                    {new Date(inv.dueDate).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {inv.status}
                    </span>
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
