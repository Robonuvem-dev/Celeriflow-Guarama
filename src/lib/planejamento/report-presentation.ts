import type { InternalReportDataset, ReportRow } from "@/lib/financeiro/report-delivery";

/** Keep landscape tables readable and preserve long legal text across continuation rows. */
export function planningPdfDataset(dataset: InternalReportDataset): InternalReportDataset {
  return { ...dataset, sections: dataset.sections.flatMap((section) => {
    const headers = [...new Set(section.rows.flatMap((row) => Object.keys(row)))];
    const identifiers = headers.slice(0, 2);
    const bands = headers.length <= 6 ? [headers] : Array.from({ length: Math.ceil((headers.length - 2) / 4) }, (_, index) => [...identifiers, ...headers.slice(2 + index * 4, 6 + index * 4)]);
    return bands.map((columns, band) => ({ title: bands.length > 1 ? `${section.title} · parte ${band + 1}/${bands.length}` : section.title, rows: section.rows.flatMap((row) => {
      const parts = Math.max(1, ...columns.map((key) => typeof row[key] === "string" ? Math.ceil(String(row[key]).length / 400) : 1));
      return Array.from({ length: parts }, (_, part): ReportRow => Object.fromEntries(columns.map((key) => {
        const value = row[key] ?? "";
        if (typeof value === "number") return [key, part === 0 || identifiers.includes(key) ? value : ""];
        return [key, value.length <= 400 && identifiers.includes(key) ? value : value.slice(part * 400, (part + 1) * 400)];
      })));
    }) }));
  }) };
}
