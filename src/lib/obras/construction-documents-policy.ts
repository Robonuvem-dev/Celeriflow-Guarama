import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";

import { templateFields } from "./construction-document-labels";
export { constructionDocumentKinds, templateFields } from "./construction-document-labels";
export const documentKindSchema = z.enum(["VIABILITY", "PERMIT", "OCCUPANCY"]);
export const templateSchema = z.object({ kind: documentKindSchema, title: z.string().trim().min(3).max(160), body: z.string().trim().min(10).max(20000), stamp: z.string().trim().min(3).max(600), signaturePolicy: z.enum(["INTERNAL_ALLOWED", "ICP_REQUIRED"]) });
export const annotationSchema = z.object({ kind: z.enum(["TEXT", "NOTE", "ARROW", "RECTANGLE", "ELLIPSE"]), page: z.number().int().min(1), x: z.number().finite().min(0), y: z.number().finite().min(0), width: z.number().finite().min(1).max(2000).default(100), height: z.number().finite().min(1).max(2000).default(40), text: z.string().max(2000).default(""), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#d62828"), fontSize: z.number().min(6).max(72).default(12), arrowDirection: z.enum(["DOWN_RIGHT", "UP_RIGHT", "DOWN_LEFT", "UP_LEFT"]).default("DOWN_RIGHT") }).refine((a) => !["TEXT", "NOTE"].includes(a.kind) || a.text.trim().length > 0, "Informe o texto da anotação.");
export type ConstructionAnnotation = z.infer<typeof annotationSchema>;
export function renderConstructionTemplate(body: string, values: Record<string, string>) {
  return body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key: string) => {
    if (!templateFields.includes(key as typeof templateFields[number]) || values[key] === undefined) throw new Error(`Campo de modelo desconhecido: ${key}`);
    return values[key];
  });
}
export function constructionFileHash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
export function assertConstructionArtifactSigned(version: { status: string; hashSha256: string }, signatures: { status: string; isRequired: boolean; documentHash: string }[]) {
  const required = signatures.filter((s) => s.isRequired);
  if (version.status !== "SIGNED" || !required.length || required.some((s) => s.status !== "SIGNED" || s.documentHash !== version.hashSha256)) throw new Error("Publicação e download exigem todas as assinaturas válidas da versão emitida.");
}
function pdfText(value: string) { return value.replace(/[^\x20-\x7e\xa0-\xff\n]/g, "?"); }
export async function generateConstructionPdf(input: { title: string; body: string; stamp: string; validationCode: string; demonstration: boolean }) {
  const pdf = await PDFDocument.create(); const font = await pdf.embedFont(StandardFonts.Helvetica);
  let page = pdf.addPage([595, 842]); let y = 790;
  const line = (text: string, size = 11) => {
    if (y < 80) { page = pdf.addPage([595, 842]); y = 790; }
    page.drawText(pdfText(text), { x: 45, y, size, font }); y -= size + 7;
  };
  const wrapped = (text: string, size = 11) => {
    for (const paragraph of text.split("\n")) {
      let current = "";
      for (const word of pdfText(paragraph).split(/\s+/)) {
        if (font.widthOfTextAtSize(`${current} ${word}`, size) > 500 && current) { line(current, size); current = ""; }
        // Long uninterrupted fields are split to avoid clipping outside the page.
        for (let rest = word; rest.length;) { const part = rest.slice(0, 70); rest = rest.slice(70); current += `${current ? " " : ""}${part}`; if (rest) { line(current, size); current = ""; } }
      }
      line(current, size);
    }
  };
  wrapped(input.title, 18); y -= 10; wrapped(input.body); y -= 15; wrapped(input.stamp, 10);
  wrapped(`Validação: /api/construcao-civil/documentos/validar?code=${input.validationCode}`, 8);
  if (input.demonstration) wrapped("AMBIENTE DEMONSTRATIVO - assinatura interna GED; sem homologação oficial ou PAdES.", 9);
  for (const [index, sheet] of pdf.getPages().entries()) sheet.drawText(`Construção Civil | ${index + 1}/${pdf.getPageCount()}`, { x: 45, y: 35, font, size: 8 });
  return pdf.save();
}

// Coordinates are PDF points, measured from the top-left of the displayed page.
// A separate revision is produced: source bytes are never overwritten.
export async function annotateConstructionPdf(original: Uint8Array, input: unknown[]) {
  const annotations = z.array(annotationSchema).min(1).max(300).parse(input);
  const pdf = await PDFDocument.load(original); const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const a of annotations) {
    const page = pdf.getPage(a.page - 1); if (!page) throw new Error("Página da anotação inexistente.");
    if (a.x + a.width > page.getWidth() || a.y + a.height > page.getHeight()) throw new Error("Anotação fora dos limites da página.");
    const color = rgb(parseInt(a.color.slice(1, 3), 16) / 255, parseInt(a.color.slice(3, 5), 16) / 255, parseInt(a.color.slice(5, 7), 16) / 255);
    const y = page.getHeight() - a.y - a.height;
    if (a.kind === "RECTANGLE" || a.kind === "NOTE") page.drawRectangle({ x: a.x, y, width: a.width, height: a.height, borderColor: color, borderWidth: 1.5, ...(a.kind === "NOTE" ? { color: rgb(1, 1, .8), opacity: .8 } : {}) });
    if (a.kind === "ELLIPSE") page.drawEllipse({ x: a.x + a.width / 2, y: y + a.height / 2, xScale: a.width / 2, yScale: a.height / 2, borderColor: color, borderWidth: 1.5 });
    if (a.kind === "TEXT" || a.kind === "NOTE") {
      const text = pdfText(a.text); const lines = text.split("\n");
      if (lines.length * (a.fontSize + 2) > a.height || lines.some((line) => font.widthOfTextAtSize(line, a.fontSize) > a.width - 4)) throw new Error("O texto não cabe na área da anotação; amplie a forma ou reduza a fonte.");
      page.drawText(text, { x: a.x + 2, y: y + a.height - a.fontSize, font, size: a.fontSize, lineHeight: a.fontSize + 2, color });
    }
    if (a.kind === "ARROW") {
      const right = a.arrowDirection.endsWith("RIGHT"); const down = a.arrowDirection.startsWith("DOWN");
      const start = { x: a.x + (right ? 0 : a.width), y: y + (down ? a.height : 0) }; const end = { x: a.x + (right ? a.width : 0), y: y + (down ? 0 : a.height) };
      page.drawLine({ start, end, color, thickness: 2 });
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      for (const offset of [-.5, .5]) page.drawLine({ start: end, end: { x: end.x - 12 * Math.cos(angle + offset), y: end.y - 12 * Math.sin(angle + offset) }, color, thickness: 2 });
    }
  }
  return { bytes: await pdf.save(), annotations, originalHash: constructionFileHash(original) };
}

export async function stampApprovedConstructionProject(original: Uint8Array, input: { institutionalStamp: string; protocol: string; reviewReference: string; permitNumber: string | null; validationCode: string }) {
  const pdf = await PDFDocument.load(original); const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) {
    const width = page.getWidth(); const height = Math.min(78, page.getHeight() / 3);
    page.drawRectangle({ x: 12, y: 12, width: width - 24, height, color: rgb(1, 1, 1), opacity: .95, borderColor: rgb(.7, .1, .1), borderWidth: 1.2 });
    const lines = ["PROJETO APROVADO - COPIA DERIVADA DEMONSTRATIVA", input.institutionalStamp, `Processo ${input.protocol} | Deferimento ${input.reviewReference}`, input.permitNumber ? `Alvara publicado: ${input.permitNumber}` : "Referencia: protocolo e deferimento; alvara ainda nao publicado", `Validacao GED: ${input.validationCode}`, "SEM HOMOLOGACAO OFICIAL / SEM PADES - assinatura interna GED requerida"];
    let y = 12 + height - 12;
    for (const line of lines) {
      const normalized = pdfText(line.replaceAll("\n", " ")); const size = Math.min(8, (width - 34) / Math.max(1, font.widthOfTextAtSize(normalized, 1)));
      page.drawText(normalized, { x: 17, y, size, font, color: rgb(.55, .05, .05) }); y -= 10;
    }
  }
  return pdf.save();
}
