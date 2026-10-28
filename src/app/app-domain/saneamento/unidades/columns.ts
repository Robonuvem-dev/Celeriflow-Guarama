import type { OperationalColumn } from "@/lib/operational-tables";

export const unitColumns: readonly OperationalColumn[] = [
  { key: "identifier", label: "Identificador", type: "identifier", initialWidth: 152, minWidth: 104, maxWidth: 200, resizable: true, sortable: false, details: "overflow" },
  { key: "street", label: "Rua e número", type: "text", initialWidth: 280, minWidth: 112, resizable: true, sortable: false, details: "overflow" },
  { key: "neighborhood", label: "Bairro", type: "text", initialWidth: 164, minWidth: 76, resizable: true, sortable: false, details: "overflow" },
  { key: "postalCode", label: "CEP", type: "identifier", initialWidth: 112, minWidth: 86, maxWidth: 160, resizable: true, sortable: false, details: "overflow" },
  { key: "owner", label: "Titular", type: "text", initialWidth: 236, minWidth: 92, resizable: true, sortable: false, details: "overflow" },
  { key: "category", label: "Categoria", type: "text", initialWidth: 128, minWidth: 88, maxWidth: 200, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 104, minWidth: 80, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  // Two 24px actions, 4px gap and 12px cell padding. This utility column is
  // intentionally fixed so resizing data columns cannot hide either action.
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];
