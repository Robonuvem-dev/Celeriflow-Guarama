import type { OperationalColumn } from "@/lib/operational-tables";

export const invoiceColumns: readonly OperationalColumn[] = [
  { key: "number", label: "Número", type: "identifier", initialWidth: 200, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "unit", label: "Identificador", type: "identifier", initialWidth: 180, minWidth: 104, resizable: true, sortable: false, details: "overflow" },
  { key: "competence", label: "Competência", type: "text", initialWidth: 130, minWidth: 108, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "amount", label: "Valor (R$)", type: "text", initialWidth: 150, minWidth: 100, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "dueDate", label: "Vencimento", type: "text", initialWidth: 130, minWidth: 100, maxWidth: 180, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "status", label: "Status", type: "status", initialWidth: 120, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
];

export const readingColumns: readonly OperationalColumn[] = [
  { key: "unit", label: "Identificador", type: "identifier", initialWidth: 180, minWidth: 104, resizable: true, sortable: false, details: "overflow" },
  { key: "competence", label: "Competência", type: "text", initialWidth: 130, minWidth: 108, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "previous", label: "Anterior", type: "text", initialWidth: 110, minWidth: 80, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "current", label: "Atual", type: "text", initialWidth: 110, minWidth: 70, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "consumption", label: "Consumo (m³)", type: "text", initialWidth: 140, minWidth: 112, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "reader", label: "Leiturista", type: "text", initialWidth: 220, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 120, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 40, minWidth: 40, maxWidth: 40, resizable: false, sortable: false, details: "none", align: "right" },
];

export const serviceColumns: readonly OperationalColumn[] = [
  { key: "number", label: "Nº OS", type: "identifier", initialWidth: 160, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 200, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "unit", label: "Identificador", type: "identifier", initialWidth: 180, minWidth: 104, resizable: true, sortable: false, details: "overflow" },
  { key: "technician", label: "Técnico", type: "text", initialWidth: 200, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "priority", label: "Prioridade", type: "status", initialWidth: 120, minWidth: 98, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 150, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 40, minWidth: 40, maxWidth: 40, resizable: false, sortable: false, details: "none", align: "right" },
];

export const portalColumns: readonly OperationalColumn[] = [
  { key: "type", label: "Solicitação", type: "text", initialWidth: 240, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "requester", label: "Solicitante", type: "text", initialWidth: 220, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Data", type: "text", initialWidth: 110, minWidth: 100, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "source", label: "Origem", type: "text", initialWidth: 130, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 140, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "active", label: "Situação", type: "status", initialWidth: 100, minWidth: 82, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];

export const qualityColumns: readonly OperationalColumn[] = [
  { key: "point", label: "Ponto", type: "text", initialWidth: 200, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Coleta", type: "text", initialWidth: 110, minWidth: 100, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "parameter", label: "Parâmetro", type: "text", initialWidth: 160, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "result", label: "Resultado", type: "text", initialWidth: 110, minWidth: 92, resizable: true, sortable: false, details: "overflow" },
  { key: "limit", label: "Limite", type: "text", initialWidth: 110, minWidth: 80, resizable: true, sortable: false, details: "overflow" },
  { key: "compliance", label: "Conformidade", type: "status", initialWidth: 140, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "active", label: "Situação", type: "status", initialWidth: 100, minWidth: 82, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];

export const reportColumns: readonly OperationalColumn[] = [
  { key: "name", label: "Relatório", type: "text", initialWidth: 300, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 200, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "period", label: "Período", type: "text", initialWidth: 150, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "format", label: "Formato", type: "text", initialWidth: 110, minWidth: 86, resizable: true, sortable: false, details: "overflow" },
  { key: "active", label: "Status", type: "status", initialWidth: 100, minWidth: 82, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];
