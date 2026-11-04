import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { formulaSafeCell } from "@/lib/reports/tabular-renderers";
import type { SocialReport } from "./report-contract";

export async function renderSocialReport(report: SocialReport, format: "pdf" | "csv" | "xlsx") {
  if (format === "csv") {
    const quote = (value: string) => `"${String(formulaSafeCell(value)).replaceAll('"', '""')}"`;
    const rows = [[report.title, report.period], [report.note], ...report.sections.flatMap(section => [[section.title], section.headers, ...section.rows])];
    return { bytes: Buffer.from("\uFEFF" + rows.map(row => row.map(quote).join(";")).join("\r\n")), contentType: "text/csv; charset=utf-8" };
  }
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const meta = workbook.addWorksheet("Referência"); meta.addRows([[report.title], [report.period], [report.note]]);
    report.sections.forEach((section, index) => { const sheet = workbook.addWorksheet(`S${index + 1}`); sheet.addRow([section.title]); sheet.addRow(section.headers); for (const row of section.rows) sheet.addRow(row.map(v => formulaSafeCell(v))); sheet.getRow(2).font = { bold: true }; sheet.columns.forEach(c => { c.width = 26; }); sheet.views = [{ state: "frozen", ySplit: 2 }]; });
    return { bytes: Buffer.from(await workbook.xlsx.writeBuffer()), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }
  const pdf = new PDFDocument({ size: "A4", margin: 36, bufferPages: true }); const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => { pdf.on("data", chunk => chunks.push(Buffer.from(chunk))); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject); });
  pdf.fontSize(15).text(`Assistência Social — ${report.title}`); pdf.fontSize(10).text(report.period); pdf.fontSize(8).text(report.note); pdf.moveDown();
  for (const section of report.sections) { pdf.fontSize(12).text(section.title); pdf.fontSize(8).text(`${section.rows.length} registros`); for (const [index, row] of section.rows.entries()) { pdf.moveDown(0.5); pdf.fontSize(9).text(`${index + 1}. ${row.map((v, i) => `${section.headers[i]}: ${v}`).join(" | ")}`); } pdf.moveDown(); }
  const range = pdf.bufferedPageRange(); for (let p = 0; p < range.count; p++) { pdf.switchToPage(p); pdf.fontSize(8).text(`${p + 1}/${range.count}`, 36, pdf.page.height - 25, { lineBreak: false }); }
  pdf.end(); return { bytes: await result, contentType: "application/pdf" };
}
