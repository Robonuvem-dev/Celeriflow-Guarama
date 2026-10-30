export function csvCell(value: unknown) {
  const text = String(value ?? "");
  // Neutralize spreadsheet formulas when exported values originate from users.
  return '"' + (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') + '"';
}
export function htmlCell(value: unknown) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
export function renderAssetReport(title: string, columns: string[], rows: unknown[][], signatures: { name: string; role: string }[], format: string) {
  if (format === "csv") return "\uFEFF" + [columns, ...rows, ...signatures.map(s => ["Assinatura", s.name, s.role])].map(row => row.map(csvCell).join(";")).join("\r\n");
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${htmlCell(title)}</title><style>body{font:14px Arial}table{border-collapse:collapse;width:100%}td,th{border:1px solid #aaa;padding:6px}footer{margin-top:40px}section{margin-top:40px;display:inline-block;margin-right:40px}@media print{.hint{display:none}}</style><h1>${htmlCell(title)}</h1><p class="hint">Use a opção Imprimir do navegador para emitir ou salvar em PDF.</p><table><thead><tr>${columns.map(v => `<th>${htmlCell(v)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(v => `<td>${htmlCell(v)}</td>`).join("")}</tr>`).join("")}</tbody></table><footer>${signatures.map(s => `<section>________________________<br>${htmlCell(s.name)}<br>${htmlCell(s.role)}</section>`).join("")}</footer></html>`;
}
