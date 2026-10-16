import type { PublicCollection, PublicDataset, TransparencyQuery } from "./query-contract";
import { filterPublicDataset } from "./query-contract";

export function exportTransparencyCsv(collection: PublicCollection, dataset: PublicDataset, query: TransparencyQuery) {
  if (dataset.status !== "AVAILABLE" || !dataset.complete) throw new Error("Fonte não confirmada para exportação integral.");
  const result = filterPublicDataset(collection, dataset, query);
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    const safe = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const columns = ["Fonte", "Origem", "Entidade", "Exercício","Campos excluídos dos totais","Escopo de período", ...collection.columns.map(column => column.label)];
  return "\uFEFF" + [columns, ...result.rows.map(record => [dataset.source, dataset.provenance, record.entity, record.year,record.excludedFromTotals?.join(",")||"",record.periodIndependent?"Referência anual, independente da data do movimento":"Data do registro", ...collection.columns.map(column => record.values[column.key])])].map(row => row.map(cell).join(";")).join("\r\n") + "\r\n";
}
