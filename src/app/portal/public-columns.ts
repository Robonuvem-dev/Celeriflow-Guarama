import type { OperationalColumn } from "@/lib/operational-tables";
import type { PublicCollection } from "@/lib/transparencia/query-contract";

export type PublicColumn = [key: string, label: string, width: number, minimum: number, type?: OperationalColumn["type"], align?: OperationalColumn["align"]];

export function publicOperationalColumns(columns: PublicColumn[]): OperationalColumn[] {
  return columns.map(([key, label, initialWidth, minWidth, type = "text", align = "left"]) => ({
    key, label, initialWidth, minWidth, maxWidth: type === "actions" ? initialWidth : undefined,
    type, align, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow",
  }));
}

// Minima budget for a readable preview plus the common full-value control.
// Even the 15-column personnel collection + entity + actions fits 1224px.
export function transparencyOperationalColumns(columns: PublicCollection["columns"], consolidated: boolean): PublicColumn[] {
  return [
    ...(consolidated ? [["__entity", "Entidade", 120, 72] as PublicColumn] : []),
    ...columns.map((column): PublicColumn => [
      column.key, column.label,
      column.kind === "money" ? 144 : column.kind === "date" ? 116 : 160,
      column.kind === "money" ? 88 : column.kind === "date" ? 76 : 64,
      column.key === "status" ? "status" : "text",
      column.kind === "money" || column.kind === "number" ? "right" : "left",
    ]),
    ["__actions", "Acesso", 128, 128, "actions"],
  ];
}
