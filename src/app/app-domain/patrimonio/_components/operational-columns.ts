import type { OperationalColumn } from "@/lib/operational-tables";

// Domain configuration only: geometry, details and rendering belong to the common table.
export function operationalColumns(definitions: readonly (readonly [key: string, label: string, initialWidth: number, minWidth: number, type?: OperationalColumn["type"], align?: OperationalColumn["align"]])[]): OperationalColumn[] {
  return definitions.map(([key, label, initialWidth, minWidth, type = "text", align = "left"]) => ({
    key, label, initialWidth, minWidth, maxWidth: type === "actions" ? initialWidth : undefined,
    type, align, resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow",
  }));
}
