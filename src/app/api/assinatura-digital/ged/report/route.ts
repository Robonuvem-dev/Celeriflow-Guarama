import { getGedContext } from "@/lib/documents/ged-access";
import { gedQuerySchema } from "@/lib/documents/ged-policy";
import { listManagedDocuments } from "@/db/repositories/documents/ged";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const context = await getGedContext(); const params = new URL(request.url).searchParams;
    const query = gedQuerySchema.parse(JSON.parse(params.get("query") || "{}"));
    const first = await listManagedDocuments(context, query, 1); if (first.total > 2000) throw new Error("Refine a consulta para exportar até 2000 resultados.");
    const rows = [...first.documents];
    for (let page = 2; page <= Math.ceil(first.total / 20); page++) rows.push(...(await listManagedDocuments(context, query, page)).documents);
    const database = context.database ?? db;
    const values: Array<Record<string, string | number>> = [];
    for (const row of rows) {
      const metadata = await database.execute<{ values: unknown; tags: unknown }>(sql`SELECT "values",tags FROM "GedMetadata" WHERE "documentId"=${row.id}`);
      values.push({ Documento: row.title, Arquivo: row.filename, Pasta: row.folderName || "Raiz", Versao: row.versionNumber, Situacao: row.editorialStatus, Relevancia: row.score ?? 0, Indices: JSON.stringify(metadata.rows[0]?.values ?? {}), Etiquetas: JSON.stringify(metadata.rows[0]?.tags ?? []), Trecho: row.snippet ?? "", SHA256: row.hashSha256 });
    }
    const headers = { "Cache-Control": "private, no-store" };
    const format = params.get("format") || "csv";
    if (format === "xlsx") {
      const { Workbook } = await import("exceljs"); const book = new Workbook(); const sheet = book.addWorksheet("Documentos");
      sheet.addRow(["Consulta", JSON.stringify(query)]); sheet.addRow(["Emissão", new Date().toISOString()]);
      if (values.length) { sheet.addRow(Object.keys(values[0])); values.forEach(row => sheet.addRow(Object.values(row))); }
      return new Response(new Uint8Array(await book.xlsx.writeBuffer()), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="pesquisa-ged.xlsx"' } });
    }
    if (format === "pdf") {
      const { default: PDFDocument } = await import("pdfkit"); const doc = new PDFDocument({ margin: 40 }); const chunks: Buffer[] = [];
      const done = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
      doc.fontSize(16).text("Resultado de pesquisa documental"); doc.fontSize(9).text(`Emissão: ${new Date().toISOString()}\nFiltros: ${JSON.stringify(query)}\nResultados: ${values.length}`);
      for (const row of values) { doc.moveDown(); for (const [key, value] of Object.entries(row)) doc.text(`${key}: ${value}`); }
      doc.end(); return new Response(new Uint8Array(await done), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="pesquisa-ged.pdf"' } });
    }
    const cell = (value: unknown) => `"${String(value ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const csv = ["Consulta;" + cell(JSON.stringify(query)), "Emissão;" + cell(new Date().toISOString()), values.length ? Object.keys(values[0]).map(cell).join(";") : "Sem resultados", ...values.map(row => Object.values(row).map(cell).join(";"))].join("\r\n");
    return new Response("\uFEFF" + csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="pesquisa-ged.csv"' } });
  } catch (error) { return Response.json({ error: error instanceof Error && !/query|constraint|postgres|https?:\/\//i.test(error.message) ? error.message : "Não foi possível exportar a consulta." }, { status: 400 }); }
}
