"use client";

import { FileText } from "lucide-react";
import { NewReadingSheet } from "./NewReadingSheet";
import { EditReadingSheet } from "./EditReadingSheet";

import { SanitationTable, SanitationPagination } from "./SanitationTable";
import { SanitationFilters } from "./SanitationFilters";
import { useSanitationList } from "./useSanitationList";
import type { SanitationPagination as Pagination } from "@/lib/saneamento/list-query";

type Reading = {
  id: string;
  competence: string;
  previousValue: number;
  currentValue: number;
  consumption: number;
  readerName: string | null;
  status: string;
  readingDate: Date;
  unit: { code: string };
};

const STATUS_COLORS: Record<string, string> = {
  Registrada: "bg-emerald-100 text-emerald-700",
  Revisada: "bg-blue-100 text-blue-700",
  Estimada: "bg-amber-100 text-amber-700",
};

export function LeiturasClient({ readings, pagination }: { readings: Reading[]; pagination: Pagination }) {
  const list = useSanitationList(pagination);
  const { query, total } = pagination;
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const lastYear = Math.max(new Date().getFullYear() + 5, Number(query.year));

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800" aria-label="Lista de leituras">
      <SanitationFilters query={query} onFilter={list.filter} placeholder="Buscar identificador, competência..." filters={[
        { name: "year", label: "Filtrar por ano", required: true, options: Array.from({ length: lastYear - 2024 + 1 }, (_, index) => String(2024 + index)) },
        { name: "month", label: "Filtrar por mês", required: true, options: months.map((label, index) => ({ value: String(index + 1).padStart(2, "0"), label })) },
        { name: "status", label: "Todos os status", options: ["Registrada", "Revisada", "Estimada"] },
      ]}><NewReadingSheet /></SanitationFilters>

      {/* Table */}
      {readings.length === 0 ? (
        <div className="min-h-0 flex-1 p-10 text-center text-gray-400 text-sm">
          <FileText className="h-10 w-10 mx-auto mb-3 text-gray-200" />
          Nenhuma leitura encontrada.
        </div>
      ) : (
        <SanitationTable columns={[
          { label: "Identificador", width: 15 }, { label: "Competência", width: 13 },
          { label: "Anterior", width: 10, align: "right" }, { label: "Atual", width: 10, align: "right" },
          { label: "Consumo (m³)", width: 12, align: "right" }, { label: "Leiturista", width: 20 },
          { label: "Status", width: 13, align: "center" }, { label: "Ações", width: 7, align: "right" },
        ]}>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {readings.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-3 py-2 text-xs font-mono font-medium text-gray-900 dark:text-white">{r.unit.code}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.competence}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 text-right">{r.previousValue.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 text-right">{r.currentValue.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs font-bold text-gray-900 dark:text-white text-right">{r.consumption.toFixed(2)}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.readerName || "-"}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end">
                      <EditReadingSheet reading={r} />
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
