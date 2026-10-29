import type { OperationalColumn } from "@/lib/operational-tables";

export function comprasColumn(key: string, label: string, minWidth: number, initialWidth: number, type: OperationalColumn["type"] = "text", align: OperationalColumn["align"] = "left"): OperationalColumn {
  return { key, label, minWidth, initialWidth, type, align, maxWidth: type === "actions" ? initialWidth : undefined, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow" };
}
