import { createHash } from "node:crypto";
import JSZip from "jszip";
import mammoth from "mammoth";
import { getFile, getBlobDocumentPrefix } from "@/lib/platform/blob";
import { gedFileType, type GedZone } from "./ged-policy";
import { gedWordSchema, type GedWord } from "./ged-processing";

export const GED_MAX_BYTES = 20 * 1024 * 1024;
export function gedUploadPath(userId: string, id: string, filename: string) {
  const safe = filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "arquivo";
  return `${getBlobDocumentPrefix()}ged/${userId}/${id}/${safe}`;
}
export function gedHash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
export async function readGedBytes(url: string, expectedHash?: string) {
  const result = await getFile(url);
  if (!result || result.statusCode !== 200 || !result.stream) throw new Error("Original indisponível no armazenamento documental.");
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > GED_MAX_BYTES) { await reader.cancel(); throw new Error("Arquivo superior a 20 MiB."); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (expectedHash && gedHash(bytes) !== expectedHash) throw new Error("A integridade do arquivo diverge da versão registrada.");
  return bytes;
}
export function decodeGedPlainText(bytes: Buffer) {
  const bom = bytes.subarray(0, 2).toString("hex");
  let text: string;
  if (bom === "fffe" || bom === "feff") text = new TextDecoder(bom === "fffe" ? "utf-16le" : "utf-16be", { fatal: true }).decode(bytes);
  else { try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { text = new TextDecoder("windows-1252", { fatal: true }).decode(bytes); } }
  if (text.includes("\0") || /[\u0001-\u0008\u000E-\u001F]/.test(text)) throw new Error("TXT contém dados binários ou controles inválidos.");
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}
export async function inspectGedBytes(filename: string, bytes: Buffer) {
  const mimeType = gedFileType(filename);
  if (!bytes.length || bytes.length > GED_MAX_BYTES) throw new Error("Arquivo vazio ou superior a 20 MiB.");
  let valid = false;
  if (mimeType === "application/pdf") valid = bytes.subarray(0, 5).toString() === "%PDF-";
  if (mimeType === "image/png") valid = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") valid = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (mimeType === "text/plain") { decodeGedPlainText(bytes); valid = true; }
  if (["application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint"].includes(mimeType)) valid = bytes.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1";
  if (mimeType === "application/rtf") valid = bytes.subarray(0, 5).toString() === "{\\rtf";
  if (mimeType === "text/html") valid = /<(?:!doctype|html|head|body|p|div|table)\b/i.test(bytes.toString("utf8").slice(0, 8192)) && !bytes.includes(0);
  if (mimeType === "image/bmp") { const { decodeGedBmp } = await import("./ged-processing"); decodeGedBmp(bytes); valid = true; }
  if (["image/gif", "image/tiff"].includes(mimeType)) {
    const { default: sharp } = await import("sharp"); const image = await sharp(bytes, { limitInputPixels: 16000000 }).metadata();
    valid = Boolean(image.width && image.height && ["gif", "tiff", "magick", "bmp"].includes(image.format ?? ""));
  }
  if (mimeType.includes("openxmlformats") || mimeType.includes("oasis.opendocument")) {
    const zip = await JSZip.loadAsync(bytes);
    const entries = Object.values(zip.files) as Array<JSZip.JSZipObject & { _data?: { uncompressedSize?: number } }>;
    if (entries.length > 2000 || entries.reduce((n, e) => n + (e.dir ? 0 : e._data?.uncompressedSize ?? GED_MAX_BYTES * 2), 0) > 30 * 1024 * 1024) throw new Error("DOCX excede o limite de descompressão.");
    valid = mimeType.includes("oasis.opendocument") ? Boolean(zip.file("mimetype") && zip.file("content.xml")) : Boolean(zip.file("[Content_Types].xml") && (zip.file("word/document.xml") || zip.file("xl/workbook.xml") || zip.file("ppt/presentation.xml")));
  }
  if (!valid) throw new Error("O conteúdo não corresponde ao formato informado.");
  return { mimeType, hashSha256: gedHash(bytes), byteLength: bytes.length };
}
export async function extractGedText(filename: string, bytes: Buffer): Promise<Array<{ page: number; text: string; method: string; words?: GedWord[] }>> {
  const { mimeType } = await inspectGedBytes(filename, bytes);
  if (mimeType === "text/plain") return [{ page: 1, text: decodeGedPlainText(bytes), method: "TEXT" }];
  if (mimeType.includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return [{ page: 1, text: result.value, method: "DOCX" }];
  }
  if (mimeType.startsWith("image/") && !["image/png", "image/jpeg"].includes(mimeType)) {
    const { imagesToGedPdf } = await import("./ged-processing"); return extractGedText("converted.pdf", await imagesToGedPdf([bytes]));
  }
  if (mimeType.startsWith("image/")) return requestGedOcr(bytes, mimeType, []);
  if (mimeType !== "application/pdf") {
    const { convertGedOffice } = await import("./ged-processing"); return extractGedText("converted.pdf", await convertGedOffice(filename, bytes));
  }
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, stopAtErrors: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 200) throw new Error("Divida PDFs com mais de 200 páginas.");
    const pages: Array<{ page: number; text: string; method: string; words?: GedWord[] }> = [];
    let length = 0;
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      const text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
      length += text.length;
      if (length > 2_000_000) throw new Error("Texto superior ao limite de processamento.");
      pages.push({ page, text, method: "PDF_TEXT" });
    }
    const missing = pages.filter(p => !p.text.trim()).map(p => p.page);
    if (missing.length) {
      const ocr = await requestGedOcr(bytes, mimeType, missing);
      for (const page of ocr) { const target = pages.find(p => p.page === page.page); if (target) Object.assign(target, page); }
    }
    return pages;
  } finally { await task.destroy(); }
}

export async function requestGedOcr(bytes: Buffer, mimeType: string, pages: number[], zone?: GedZone) {
  const { readGedProviderConfig } = await import("./ged-provider-config");
  const endpoint = (await readGedProviderConfig()).ocrEndpoint;
  const input = { contentBase64: bytes.toString("base64"), mimeType, pages, language: "por", ...(zone ? { zones: [zone], coordinateSystem: "normalized-top-left" } : {}) };
  let raw: unknown;
  if (endpoint) {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Endpoint OCR inválido.");
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.GED_OCR_API_KEY ? { Authorization: `Bearer ${process.env.GED_OCR_API_KEY}` } : {}) }, body: JSON.stringify(input), signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error("O serviço OCR não concluiu o reconhecimento.");
    raw = await response.json();
  } else {
    const { runGedInternalTask } = await import("./ged-internal-runtime");
    raw = await runGedInternalTask("ocr", input);
  }
  const { z } = await import("zod");
   const result = z.object({ pages: z.array(z.object({ page: z.number().int().min(1).max(200), text: z.string().max(100_000), confidence: z.number().min(0).max(1).nullable().optional(), label: z.string().optional(), words: z.array(gedWordSchema).max(20000).optional() })).max(200) }).parse(raw);
  const seen = new Set<number>();
  for (const item of result.pages) {
    if (seen.has(item.page) || (pages.length && !pages.includes(item.page)) || (zone && (item.page !== zone.page || item.label !== zone.label))) throw new Error("Resposta OCR não corresponde às páginas/região solicitadas.");
    seen.add(item.page);
  }
  if (!result.pages.length || (pages.length && pages.some(page => !seen.has(page)))) throw new Error("O OCR não retornou todas as páginas solicitadas.");
  return result.pages.map(p => ({ ...p, method: zone ? "OCR_ZONE" : "OCR" }));
}
