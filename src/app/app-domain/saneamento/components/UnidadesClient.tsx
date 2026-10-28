"use client";

import { PowerOff } from "lucide-react";
import { NewUnitSheet } from "./NewUnitSheet";
import { EditUnitSheet } from "./EditUnitSheet";
import { inactivateConsumerUnit } from "../actions";
import { SanitationTable, SanitationPagination } from "./SanitationTable";
import { SanitationFilters } from "./SanitationFilters";
import { useSanitationList } from "./useSanitationList";
import { getUnitAddress } from "@/lib/saneamento/unit-address";
import type { SanitationPagination as Pagination } from "@/lib/saneamento/list-query";

type Unit = {
  id: string;
  code: string;
  address: string;
  streetAddress: string | null;
  neighborhood: string | null;
  postalCode: string | null;
  category: string;
  status: string;
  ownerName: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  Ativa: "bg-green-100 text-green-700",
  Cortada: "bg-red-100 text-red-700",
  Suspensa: "bg-yellow-100 text-yellow-700",
  Inativa: "bg-gray-100 text-gray-500",
};

export function UnidadesClient({ units, pagination }: { units: Unit[]; pagination: Pagination }) {
  const list = useSanitationList(pagination);
  const { query, total } = pagination;

  async function handleInactivate(id: string, code: string) {
    if (!confirm(`Inativar a unidade ${code}? Esta ação pode ser revertida editando o status.`)) return;
    try {
      const result = await inactivateConsumerUnit(id);
      if (result.error) alert(result.error);
    } catch {
      alert("Erro ao inativar unidade.");
    }
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800" aria-label="Lista de unidades consumidoras" aria-busy={list.pending}>
      <SanitationFilters query={query} onFilter={list.filter} placeholder="Buscar unidade, titular, bairro ou CEP..." filters={[
        { name: "status", label: "Todos os status", options: ["Ativa", "Cortada", "Suspensa", "Inativa"] },
        { name: "category", label: "Todas as categorias", options: ["Residencial", "Comercial", "Industrial", "Pública", "Rural"] },
      ]}><NewUnitSheet /></SanitationFilters>

      {/* Table */}
      {units.length === 0 ? (
        <div className="min-h-0 flex-1 p-10 text-center text-gray-400 text-sm">
          Nenhuma unidade consumidora encontrada.
        </div>
      ) : (
        <SanitationTable columns={[
          { label: "Identificador", width: 13 }, { label: "Rua e número", width: 20 },
          { label: "Bairro", width: 13 }, { label: "CEP", width: 9 },
          { label: "Titular", width: 18 }, { label: "Categoria", width: 10 },
          { label: "Status", width: 9 }, { label: "Ações", width: 8, align: "right" },
        ]}>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {units.map((unit) => {
                const address = getUnitAddress(unit);
                return <tr key={unit.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                  <td className="px-3 py-2 text-xs font-mono font-medium text-gray-900 dark:text-white">{unit.code}</td>
                  <td title={address.streetAddress} className="text-gray-500">{address.streetAddress}</td>
                  <td title={address.neighborhood} className="text-gray-500">{address.neighborhood || "—"}</td>
                  <td className="text-gray-500">{address.postalCode || "—"}</td>
                  <td title={unit.ownerName ?? ""} className="px-3 py-2 text-xs text-gray-500">{unit.ownerName || "-"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{unit.category}</td>
                  <td className="px-3 py-2">
                    <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[unit.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {unit.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <EditUnitSheet unit={unit} />
                      <button
                        onClick={() => handleInactivate(unit.id, unit.code)}
                        className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded transition-colors"
                        title="Inativar"
                        disabled={unit.status === "Inativa"}
                      >
                        <PowerOff className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
        </SanitationTable>
      )}

      <SanitationPagination page={query.page} total={total} pageSize={20} onPageChange={list.setPage} />
</section>
  );
}
