"use client";

import type { ReactNode } from "react";
import type { OperationalColumn } from "@/lib/operational-tables";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";

export type SocialColumn = [key: string, label: string, width: number, minimum: number, type?: OperationalColumn["type"], align?: OperationalColumn["align"]];

// Domain configuration only: geometry, details and pagination remain in the common primitives.
export function SocialOperationalList({ id, columns, rows, page, total, onPageChange, toolbar, actions }: {
  id: string; columns: SocialColumn[]; rows: OperationalRow[]; page: number; total: number;
  onPageChange: (page: number) => void; toolbar?: ReactNode; actions?: ReactNode;
}) {
  const configuration: OperationalColumn[] = columns.map(([key, label, initialWidth, minWidth, type = "text", align = "left"]) => ({
    key, label, initialWidth, minWidth, maxWidth: type === "actions" ? initialWidth : undefined,
    type, align, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow",
  }));
  return <OperationalListFrame toolbar={toolbar} actions={actions} pagination={<OperationalPagination page={page} total={total} onPageChange={onPageChange} />}>
    <OperationalTable columns={configuration} rows={rows} preferenceId={`social-${id}`} caption={`Assistência Social — ${id}`} emptyMessage="Nenhum registro encontrado no seu escopo de acesso." />
  </OperationalListFrame>;
}
