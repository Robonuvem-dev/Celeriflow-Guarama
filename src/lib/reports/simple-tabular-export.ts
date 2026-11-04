import { formulaSafeCell } from "./tabular-renderers";

export type SimpleTabularFormat = "pdf" | "xlsx" | "xls" | "docx" | "doc" | "txt" | "csv";
export type SimpleTabularData = { title: string; columns: string[]; rows: (string | number | null)[][] };
type SimpleTabularExport = { body: Uint8Array | string; contentType: string; extension: string };

export async function exportSimpleTable(table: SimpleTabularData, format: SimpleTabularFormat): Promise<SimpleTabularExport> {
  const rows = [table.columns, ...table.rows];
  if (format === "csv") {
    const cell = (value: string | number | null) => `"${String(formulaSafeCell(value ?? "")).replace(/"/g, '""')}"`;
    return { body: `\uFEFF${rows.map(row => row.map(cell).join(";")).join("\r\n")}\r\n`, contentType: "text/csv; charset=utf-8", extension: "csv" };
  }
  if (format === "txt") {
    const clean = (value: string | number | null) => String(value ?? "").replace(/[\t\r\n]+/g, " ");
    return { body: `${clean(table.title)}\r\n${rows.map(row => row.map(clean).join("\t")).join("\r\n")}\r\n`, contentType: "text/plain; charset=utf-8", extension: "txt" };
  }
  if (format === "xlsx" || format === "xls") {
    const { default: ExcelJS } = await import("exceljs");
    const book = new ExcelJS.Workbook();
    book.title = table.title;
    const sheet = book.addWorksheet("Dados");
    rows.forEach(row => sheet.addRow(row.map(value => formulaSafeCell(value ?? ""))));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns = table.columns.map(name => ({ width: Math.min(48, Math.max(14, name.length + 2)) }));
    return {
      body: new Uint8Array(await book.xlsx.writeBuffer()),
      contentType: format === "xls" ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: format,
    };
  }
  if (format === "docx" || format === "doc") {
    const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } = await import("docx");
    const document = new Document({ sections: [{ children: [
      new Paragraph({ children: [new TextRun({ text: table.title, bold: true })] }),
      ...(table.columns.length ? [new Table({ rows: rows.map((row, index) => new TableRow({
        tableHeader: index === 0,
        children: table.columns.map((_, column) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row[column] ?? ""), bold: index === 0 })] })] })),
      })) })] : []),
    ] }] });
    return {
      body: new Uint8Array(await Packer.toBuffer(document)),
      contentType: format === "doc" ? "application/msword" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: format,
    };
  }
  if (format !== "pdf") throw new Error("Formato de exportação não suportado.");
  const { default: PDFDocument } = await import("pdfkit");
  const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, info: { Title: table.title } });
  const chunks: Buffer[] = [];
  const body = new Promise<Uint8Array>((resolve, reject) => {
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    document.on("error", reject);
  });
  document.fontSize(16).text(table.title).moveDown();
  document.fontSize(9).text(table.columns.join(" | ")).moveDown(0.5);
  table.rows.forEach(row => document.text(table.columns.map((name, index) => `${name}: ${row[index] ?? ""}`).join(" | ")).moveDown(0.5));
  document.end();
  return { body: await body, contentType: "application/pdf", extension: "pdf" };
}
