import type { BankStatementImport, BankStatementItem, BankAccount } from "@prisma/client";
import { Prisma } from "@prisma/client";
import PDFDocument from "pdfkit";
import { parseOfxStatement } from "./ofx-parser";
import { parseOfcStatement } from "./ofc-parser";

export async function renderBankStatementPdf(record: BankStatementImport, account: Pick<BankAccount, "bankName" | "agency" | "accountNumber">, items: BankStatementItem[]) {
  const rows = ["OFX", "OFC"].includes(record.format) && record.originalBytes
    ? (record.format === "OFC" ? parseOfcStatement(record.originalBytes) : parseOfxStatement(record.originalBytes)).transactions.map(item => ({ date: item.date, description: item.description, reference: item.reference ?? item.id, amount: item.amount }))
    : items.map(item => ({ date: item.date, description: item.description ?? "", reference: item.reference ?? "", amount: item.valueDecimal.abs().mul(["Saída", "DEBIT"].includes(item.direction) ? -1 : 1) }));
  const credits = rows.filter(row => row.amount.isPositive()).reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
  const debits = rows.filter(row => row.amount.isNegative()).reduce((sum, row) => sum.plus(row.amount.abs()), new Prisma.Decimal(0));
  const pdf = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  const bytes = new Promise<Buffer>((resolve, reject) => { pdf.on("data", chunk => chunks.push(Buffer.from(chunk))); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject); });
  pdf.fontSize(15).text("Extrato bancário importado");
  pdf.fontSize(10).text(`${account.bankName} · agência ${account.agency} · conta ${account.accountNumber}`);
  pdf.fontSize(8).text(`Arquivo: ${record.fileName ?? record.id} · ${record.format} · importado em ${record.importedAt.toISOString()}`);
  pdf.text(`SHA-256 do arquivo: ${record.checksum}`);
  if (!record.originalBytes) pdf.text("Original legado indisponível; impressão dos lançamentos persistidos.");
  pdf.moveDown();
  for (const row of rows) { pdf.fontSize(9).text(`${row.date.toISOString().slice(0, 10)} · ${row.amount.isNegative() ? "Débito" : "Crédito"} ${row.amount.abs().toFixed(2)} BRL · ${row.reference}`).text(row.description); pdf.moveDown(0.5); }
  pdf.moveDown().fontSize(10).text(`${rows.length} lançamentos · créditos ${credits.toFixed(2)} BRL · débitos ${debits.toFixed(2)} BRL · movimento líquido ${credits.minus(debits).toFixed(2)} BRL`);
  pdf.fontSize(8).text("Movimento líquido não representa saldo bancário sem saldo inicial conciliado.");
  const range = pdf.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) { pdf.switchToPage(page); pdf.fontSize(8).text(`${page - range.start + 1}/${range.count}`, 40, pdf.page.height - 25, { lineBreak: false }); }
  pdf.end();
  return bytes;
}
