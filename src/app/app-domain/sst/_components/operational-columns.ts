import type { OperationalColumn } from "@/lib/operational-tables";

export function sstColumn(key: string, label: string, initialWidth: number, minWidth: number, type: OperationalColumn["type"] = "text", align: OperationalColumn["align"] = "left"): OperationalColumn {
  return { key, label, initialWidth, minWidth, maxWidth: type === "actions" ? initialWidth : undefined, type, align, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow" };
}
