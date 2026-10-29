"use client";

import { useState } from "react";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";

/** Pagination of an already authorized, fully loaded detail collection. */
export function HealthReadTable({ id, label, columns, rows }: { id: string; label: string; columns: OperationalColumn[]; rows: OperationalRow[] }) {
  const [page, setPage] = useState(1);
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label={label} pagination={<OperationalPagination page={activePage} total={rows.length} onPageChange={setPage} />}>
    <OperationalTable preferenceId={id} caption={label} columns={columns} rows={rows.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE)} />
  </OperationalListFrame>;
}
