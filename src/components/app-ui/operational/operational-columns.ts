import type { OperationalColumn } from "@/lib/operational-tables";

export function operationalColumn(
  key: string,
  label: string,
  minWidth = 100,
  initialWidth = minWidth + 40,
  options: {
    type?: OperationalColumn["type"];
    align?: OperationalColumn["align"];
    details?: "none" | "overflow";
    sortable?: boolean;
    resizable?: boolean;
  } = {}
): OperationalColumn {
  const type = options.type || "text";
  const align = options.align || (type === "actions" ? "right" : "left");
  return {
    key,
    label,
    minWidth,
    initialWidth,
    maxWidth: type === "actions" ? initialWidth : Math.max(initialWidth * 3, 320),
    type,
    align,
    resizable: options.resizable !== undefined ? options.resizable : type !== "actions",
    sortable: options.sortable !== undefined ? options.sortable : false,
    details: options.details || (type === "actions" ? "none" : "overflow"),
  };
}

export function operationalColumns(
  definitions: ReadonlyArray<
    readonly [string, string, number?, number?, OperationalColumn["type"]?, OperationalColumn["align"]?]
  >
): OperationalColumn[] {
  return definitions.map(([key, label, minWidth = 100, initialWidth = minWidth + 40, type = "text", align = "left"]) => ({
    key,
    label,
    minWidth,
    initialWidth,
    maxWidth: type === "actions" ? initialWidth : Math.max(initialWidth * 3, 320),
    type,
    align,
    resizable: type !== "actions",
    sortable: false,
    details: type === "actions" ? "none" : "overflow",
  }));
}
