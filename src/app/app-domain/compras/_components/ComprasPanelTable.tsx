"use client";

import type { ReactNode } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import type { OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import { ComprasOperationalList } from "./ComprasOperationalList";

export function ComprasPanelTable({ title, triggerLabel, description, columns, rows, preferenceId, actions, editable = false }: {
  title: string;
  triggerLabel?: string;
  description?: string;
  columns: OperationalColumn[];
  rows: OperationalRow[];
  preferenceId: string;
  actions?: ReactNode;
  editable?: boolean;
}) {
  return <span className="inline-flex h-6 min-w-0 max-w-full items-center [&>button]:h-6 [&>button]:min-w-0 [&>button]:max-w-full [&>button]:truncate [&>button]:px-1 [&>button]:text-[13px]"><OperationalTablePanel title={title} triggerLabel={triggerLabel ?? `Abrir ${title.toLocaleLowerCase("pt-BR")} (${rows.length})`} description={description}>
    <div className="contents" onSubmit={(event) => event.stopPropagation()}>
      <ComprasOperationalList label={title} description={description} columns={columns} preferenceId={preferenceId} actions={actions} editable={editable}
        rows={rows.map((row) => ({ ...row, search: Object.values(row.values).join(" ") }))} />
    </div>
  </OperationalTablePanel></span>;
}
