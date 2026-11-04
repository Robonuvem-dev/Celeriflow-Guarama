import { createHash } from "node:crypto";
import mammoth from "mammoth";
import JSZip from "jszip";
import { GED_MAX_BYTES, gedFileType } from "./ged-policy";
import type { GedWord } from "./ocr-policy";
import { requestGedOcr } from "./ocr-client";

export function gedHash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
export function decodeGedPlainText(bytes: Buffer): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be", { fatal: true }).decode(bytes.subarray(2));
  }
  let isUtf16Le = false;
  let isUtf16Be = false;
  if (bytes.length >= 4) {
    const zeroesEven = (bytes[0] === 0 ? 1 : 0) + (bytes[2] === 0 ? 1 : 0);
    const zeroesOdd = (bytes[1] === 0 ? 1 : 0) + (bytes[3] === 0 ? 1 : 0);
    if (zeroesOdd >= 2 && zeroesEven === 0) isUtf16Le = true;
    else if (zeroesEven >= 2 && zeroesOdd === 0) isUtf16Be = true;
  }
  if (isUtf16Le) {
    try { return new TextDecoder("utf-16le", { fatal: true }).decode(bytes); } catch {}
  }
  if (isUtf16Be) {
    try { return new TextDecoder("utf-16be", { fatal: true }).decode(bytes); } catch {}
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-1252", { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder("iso-8859-1").decode(bytes);
    }
  }
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
    if (length < 20) {
      const ocrPages = await requestGedOcr(bytes, mimeType, []);
      if (ocrPages.length) return ocrPages;
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
export async function downloadGedBlob(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível carregar o arquivo armazenado.");
  return Buffer.from(await response.arrayBuffer());
}
