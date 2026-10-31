import { createHash } from "node:crypto";
import JSZip from "jszip";
import mammoth from "mammoth";
import { getFile, getBlobDocumentPrefix } from "@/lib/platform/blob";
import { gedFileType, type GedZone } from "./ged-policy";

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
export async function inspectGedBytes(filename: string, bytes: Buffer) {
  const mimeType = gedFileType(filename);
  if (!bytes.length || bytes.length > GED_MAX_BYTES) throw new Error("Arquivo vazio ou superior a 20 MiB.");
  let valid = false;
  if (mimeType === "application/pdf") valid = bytes.subarray(0, 5).toString() === "%PDF-";
  if (mimeType === "image/png") valid = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") valid = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (mimeType === "text/plain") { new TextDecoder("utf-8", { fatal: true }).decode(bytes); valid = !bytes.includes(0); }
  if (mimeType.includes("wordprocessingml")) {
    const zip = await JSZip.loadAsync(bytes);
    const entries = Object.values(zip.files) as Array<JSZip.JSZipObject & { _data?: { uncompressedSize?: number } }>;
    if (entries.length > 2000 || entries.reduce((n, e) => n + (e.dir ? 0 : e._data?.uncompressedSize ?? GED_MAX_BYTES * 2), 0) > 30 * 1024 * 1024) throw new Error("DOCX excede o limite de descompressão.");
    valid = Boolean(zip.file("[Content_Types].xml") && zip.file("word/document.xml"));
  }
  if (!valid) throw new Error("O conteúdo não corresponde ao formato informado.");
  return { mimeType, hashSha256: gedHash(bytes), byteLength: bytes.length };
}
export async function extractGedText(filename: string, bytes: Buffer): Promise<Array<{ page: number; text: string; method: string }>> {
  const { mimeType } = await inspectGedBytes(filename, bytes);
  if (mimeType === "text/plain") return [{ page: 1, text: bytes.toString("utf8"), method: "TEXT" }];
  if (mimeType.includes("wordprocessingml")) {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return [{ page: 1, text: result.value, method: "DOCX" }];
  }
  if (mimeType !== "application/pdf") return requestGedOcr(bytes, mimeType, []);
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, stopAtErrors: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 200) throw new Error("Divida PDFs com mais de 200 páginas.");
    const pages: Array<{ page: number; text: string; method: string }> = [];
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
  const endpoint = process.env.GED_OCR_ENDPOINT;
  if (!endpoint) throw new Error("Configure GED_OCR_ENDPOINT para reconhecer digitalizados e zonas.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Endpoint OCR inválido.");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.GED_OCR_API_KEY ? { Authorization: `Bearer ${process.env.GED_OCR_API_KEY}` } : {}) },
    body: JSON.stringify({ contentBase64: bytes.toString("base64"), mimeType, pages, language: "por", ...(zone ? { zones: [zone], coordinateSystem: "normalized-top-left" } : {}) }), signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error("O serviço OCR não concluiu o reconhecimento.");
  const { z } = await import("zod");
  const result = z.object({ pages: z.array(z.object({ page: z.number().int().min(1).max(200), text: z.string().max(100_000), confidence: z.number().min(0).max(1).nullable().optional(), label: z.string().optional() })).max(200) }).parse(await response.json());
  const seen = new Set<number>();
  for (const item of result.pages) {
    if (seen.has(item.page) || (pages.length && !pages.includes(item.page)) || (zone && (item.page !== zone.page || item.label !== zone.label))) throw new Error("Resposta OCR não corresponde às páginas/região solicitadas.");
    seen.add(item.page);
  }
  if (!result.pages.length || (pages.length && pages.some(page => !seen.has(page)))) throw new Error("O OCR não retornou todas as páginas solicitadas.");
  return result.pages.map(p => ({ ...p, method: zone ? "OCR_ZONE" : "OCR" }));
}
