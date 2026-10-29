"use client";

import { NewReadingSheet } from "./NewReadingSheet";
import { EditReadingSheet } from "./EditReadingSheet";
import { OperationalPagination, OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { readingColumns } from "./list-columns";
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

export function LeiturasClient({ readings, pagination }: { readings: Reading[]; pagination: Pagination }) {
  const list = useSanitationList(pagination);
  const { query, total } = pagination;
  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const lastYear = Math.max(new Date().getFullYear() + 5, Number(query.year));
  const rows: OperationalRow[] = readings.map((reading) => ({
    id: reading.id, label: `${reading.unit.code} · ${reading.competence}`,
    values: { unit: reading.unit.code, competence: reading.competence, previous: reading.previousValue.toFixed(2), current: reading.currentValue.toFixed(2), consumption: reading.consumption.toFixed(2), reader: reading.readerName || "—", status: reading.status },
    actions: <div className={styles.rowActions}><EditReadingSheet reading={reading} /></div>,
  }));
  return <OperationalListFrame label="Lista de leituras" actions={<NewReadingSheet />}
    toolbar={<SanitationFilters query={query} onFilter={list.filter} placeholder="Buscar identificador, competência..." filters={[
      { name: "year", label: "Filtrar por ano", required: true, options: Array.from({ length: lastYear - 2024 + 1 }, (_, index) => String(2024 + index)) },
      { name: "month", label: "Filtrar por mês", required: true, options: months.map((label, index) => ({ value: String(index + 1).padStart(2, "0"), label })) },
      { name: "status", label: "Todos os status", options: ["Registrada", "Revisada", "Estimada"] },
    ]} />}
    pagination={<OperationalPagination page={query.page} total={total} pending={list.pending} onPageChange={list.setPage} />}>
    <OperationalTable columns={readingColumns} rows={rows} preferenceId="sanitation-readings" caption="Leituras e consumo" emptyMessage="Nenhuma leitura encontrada." />
  </OperationalListFrame>;
}
