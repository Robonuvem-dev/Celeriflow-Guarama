"use client";

import { useState, type ReactNode } from "react";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";

export function PlanningLocalList({ id, label, columns, rows, toolbar }: {
  id: string; label: string; columns: OperationalColumn[]; rows: OperationalRow[]; toolbar?: ReactNode;
}) {
  const [requested, setPage] = useState(1);
  const page = Math.min(requested, Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label={label} toolbar={toolbar} pagination={<OperationalPagination page={page} total={rows.length} onPageChange={setPage} />}>
    <OperationalTable preferenceId={id} caption={label} columns={columns} rows={rows.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE)} emptyMessage="Nenhum registro encontrado." />
  </OperationalListFrame>;
}
