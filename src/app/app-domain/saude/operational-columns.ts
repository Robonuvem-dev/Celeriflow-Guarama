import type { OperationalColumn } from "@/lib/operational-tables";

/** Domain column configuration; geometry and interactions belong to OperationalTable. */
export function healthColumn(key: string, label: string, initialWidth: number, minWidth: number, type: OperationalColumn["type"] = "text", align: OperationalColumn["align"] = "left", maxWidth?: number): OperationalColumn {
  return { key, label, initialWidth, minWidth, maxWidth, type, align, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow" };
}
