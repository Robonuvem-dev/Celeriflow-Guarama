import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type CemeteryReportRow = { receipt: string; deceased: string; deathDate: string; performedAt: string; cemetery: string; grave: string; funeralHome: string; status: string };
export async function generateCemeteryBurialPdf(rows: CemeteryReportRow[], criteria: string, issuedAt: string) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([595.28, 841.89]);
  let y = 790;
  function line(text: string, heading = false) {
    const selectedFont = heading ? bold : font;
    const words = text.replace(/\s+/g, " ").split(" ");
    let buffer = "";
    const draw = (value: string) => {
      if (y < 55) { page = document.addPage([595.28, 841.89]); y = 790; }
      page.drawText(value, { x: 40, y, size: 10, font: selectedFont, color: rgb(0.08, 0.08, 0.08) }); y -= 15;
    };
    for (const word of words) {
      if (font.widthOfTextAtSize(`${buffer} ${word}`, 10) <= 515) { buffer += `${buffer ? " " : ""}${word}`; continue; }
      if (buffer) draw(buffer);
      buffer = "";
      for (const char of word) {
        if (font.widthOfTextAtSize(buffer + char, 10) > 515) { draw(buffer); buffer = ""; }
        buffer += char;
      }
    }
    if (buffer) draw(buffer);
  }
  try {
    line("Prefeitura Municipal de Ibema - Relatório de sepultados", true);
    line(criteria); line(`Emissão: ${issuedAt} | Total: ${rows.length}`); y -= 10;
    for (const [index, row] of rows.entries()) {
      line(`${index + 1}. ${row.deceased} | Comprovante: ${row.receipt}`, true);
      line(`Óbito: ${row.deathDate} | Sepultamento efetivo: ${row.performedAt}`);
      line(`Cemitério: ${row.cemetery} | Sepultura: ${row.grave}`);
      line(`Funerária: ${row.funeralHome} | Situação atual: ${row.status}`); y -= 8;
    }
    if (!rows.length) line("Nenhum sepultamento concluído para os critérios informados.");
    const pages = document.getPages();
    pages.forEach((p, i) => p.drawText(`Página ${i + 1} de ${pages.length}`, { x: 40, y: 25, size: 9, font }));
    return await document.save();
  } catch { throw new Error("O PDF não conseguiu representar os caracteres do cadastro. Use o relatório de impressão HTML, que preserva o texto completo."); }
}
