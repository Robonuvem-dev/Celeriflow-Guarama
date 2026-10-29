"use client";

import { useState, type ReactNode } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";

/** Pagination state lives outside the panel's mounted/unmounted content. */
export function RhTablePanel({ title, triggerLabel, description, columns, rows, preferenceId, pagination, toolbar, actions, emptyMessage, initialPage = 1 }: {
  title: string; triggerLabel?: string; description?: string;
  columns: OperationalColumn[]; rows: OperationalRow[]; preferenceId: string;
  pagination?: ReactNode; toolbar?: ReactNode; actions?: ReactNode; emptyMessage?: string; initialPage?: number;
}) {
  const [requestedPage, setPage] = useState(initialPage);
  const page = Math.min(Math.max(1, requestedPage), Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  return <div onSubmit={event => event.stopPropagation()}><OperationalTablePanel title={title} triggerLabel={triggerLabel} description={description}>
    <OperationalListFrame label={title} toolbar={toolbar} actions={actions} pagination={pagination ?? <OperationalPagination page={page} total={rows.length} onPageChange={setPage} />}>
      <OperationalTable columns={columns} rows={pagination ? rows : rows.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE)} preferenceId={preferenceId} caption={title} emptyMessage={emptyMessage} />
    </OperationalListFrame>
  </OperationalTablePanel></div>;
}
