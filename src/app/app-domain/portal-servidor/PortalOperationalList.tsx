"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";

export function PortalOperationalList({ id, label, columns, rows, toolbar, actions, page, total, values, pathname }: {
  id: string; label: string; columns: OperationalColumn[]; rows: OperationalRow[]; toolbar?: ReactNode; actions?: ReactNode;
  page?: number; total?: number; values?: Record<string, string | number | undefined | null>; pathname?: string;
}) {
  const [localPage, setLocalPage] = useState(1);
  const activePage = page ?? Math.min(localPage, Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  const visible = page === undefined ? rows.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE) : rows;
  return <OperationalListFrame label={label} toolbar={toolbar} actions={actions} pagination={page === undefined ? <OperationalPagination page={activePage} total={rows.length} onPageChange={setLocalPage} /> : <OperationalLinkPagination page={page} total={total ?? rows.length} values={values} pathname={pathname} />}>
    <OperationalTable columns={columns} rows={visible} preferenceId={`portal-servidor-${id}`} caption={label} emptyMessage="Nenhum registro disponível neste filtro." />
  </OperationalListFrame>;
}
