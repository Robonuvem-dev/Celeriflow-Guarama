import type { OperationalColumn } from "@/lib/operational-tables";

/** Domain configuration only; rendering and geometry belong to the common table. */
export function rhColumn(key: string, label: string, initialWidth: number, minWidth: number, type: OperationalColumn["type"] = "text", align: OperationalColumn["align"] = "left"): OperationalColumn {
  return { key, label, initialWidth, minWidth, maxWidth: type === "actions" ? initialWidth : undefined, type, align, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow" };
}
