import type { OperationalColumn } from "@/lib/operational-tables";

/** Domain column configuration; sizing and cell rendering belong to the shared table. */
export function financeColumn(key: string, label: string, minWidth: number, initialWidth = minWidth + 40, type: OperationalColumn["type"] = "text", align: OperationalColumn["align"] = "left"): OperationalColumn {
  return { key, label, minWidth, initialWidth, maxWidth: type === "actions" ? initialWidth : Math.max(initialWidth * 3, 320), type, align, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow" };
}
