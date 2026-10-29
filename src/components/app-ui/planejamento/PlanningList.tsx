import type { ReactNode } from "react";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";

export function planningColumn(key: string, label: string, minWidth: number, initialWidth: number, extra: Partial<OperationalColumn> = {}): OperationalColumn {
  return { key, label, minWidth, initialWidth, type: "text", resizable: true, sortable: false, details: "overflow", ...extra };
}

export function PlanningList({ id, label, columns, rows, page, total, pathname, values, pageParam, toolbar, actions, emptyMessage }: {
  id: string; label: string; columns: OperationalColumn[]; rows: OperationalRow[];
  page: number; total: number; pathname: string; values?: Record<string, string | number | undefined | null>; pageParam?: string;
  toolbar?: ReactNode; actions?: ReactNode; emptyMessage?: string;
}) {
  return <OperationalListFrame label={label} toolbar={toolbar} actions={actions}
    pagination={<OperationalLinkPagination page={page} total={total} pathname={pathname} values={values} pageParam={pageParam} />}>
    <OperationalTable preferenceId={id} caption={label} columns={columns} rows={rows} emptyMessage={emptyMessage ?? "Nenhum registro encontrado."} />
  </OperationalListFrame>;
}
