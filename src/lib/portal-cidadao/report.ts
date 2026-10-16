import { PDFDocument, StandardFonts } from "pdf-lib";

export async function serviceReportPdf(title: string, lines: string[]) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]), y = 795;
  for (const raw of [title, "", ...lines]) {
    for (const paragraph of raw.replace(/[^\x09\x0A\x0D\x20-\xFF]/g, " ").split(/\r?\n/)) {
      let current = "";
      const chunks = paragraph.split(/\s+/).flatMap((word) => word.length > 60 ? word.match(/.{1,60}/g) || [] : [word]);
      const draw = () => { if (y < 45) { page = pdf.addPage([595, 842]); y = 795; } page.drawText(current, { x: 40, y, size: 10, font }); y -= 16; current = ""; };
      for (const word of chunks) { const candidate = current ? `${current} ${word}` : word; if (font.widthOfTextAtSize(candidate, 10) > 515 && current) draw(); current = current ? `${current} ${word}` : word; }
      draw();
    }
    y -= 5;
  }
  return new Uint8Array(await pdf.save());
}
