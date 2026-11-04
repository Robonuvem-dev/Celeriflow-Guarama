import "server-only";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { db } from "@/db/client";
import { gedHash } from "./ged-storage";
import type { AppContext } from "@/lib/platform/tenant-context";
import { getBlobDocumentPrefix } from "@/lib/platform/blob";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { readGedProviderConfig } from "./ged-provider-config";
import { gedUsesVercelSandbox, runGedInternalTask } from "./ged-internal-runtime";

const run = promisify(execFile);
export const gedWordSchema = z.object({ text: z.string().max(1000), x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().positive().max(1), height: z.number().positive().max(1) });
export type GedWord = z.infer<typeof gedWordSchema>;

/** Bounded decoder for uncompressed Windows BMP, including indexed palettes. */
export function decodeGedBmp(bytes: Buffer) {
  if (bytes.length < 54 || bytes.subarray(0, 2).toString() !== "BM" || bytes.readUInt32LE(14) < 40) throw new Error("BMP inválido.");
  const offset = bytes.readUInt32LE(10), width = bytes.readInt32LE(18), signedHeight = bytes.readInt32LE(22), height = Math.abs(signedHeight), bits = bytes.readUInt16LE(28);
  if (width < 1 || height < 1 || width * height > 16000000 || ![1, 4, 8, 24, 32].includes(bits) || bytes.readUInt32LE(30) !== 0 || bytes.readUInt16LE(26) !== 1) throw new Error("BMP: utilize formato sem compressão, até 16 milhões de pixels.");
  const stride = Math.ceil(width * bits / 32) * 4;
  const paletteStart = 14 + bytes.readUInt32LE(14);
  if (offset + stride * height > bytes.length || offset < paletteStart) throw new Error("BMP truncado.");
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = offset + (signedHeight > 0 ? height - y - 1 : y) * stride;
    let source: number;
    if (bits >= 24) source = row + x * (bits / 8);
    else {
      const value = bytes[row + Math.floor(x * bits / 8)];
      const paletteIndex = bits === 8 ? value : bits === 4 ? (x % 2 ? value & 15 : value >> 4) : (value >> (7 - x % 8)) & 1;
      source = paletteStart + paletteIndex * 4;
      if (source + 4 > offset) throw new Error("Paleta BMP inválida.");
    }
    const target = (y * width + x) * 3;
    pixels[target] = bytes[source + 2]; pixels[target + 1] = bytes[source + 1]; pixels[target + 2] = bytes[source];
  }
  return { pixels, width, height };
}

export async function embedGedText(text: string) {
  if (!text.trim() || text.length > 2_000_000) throw new Error("Texto sem conteúdo ou superior ao limite semântico.");
  const endpoint = (await readGedProviderConfig()).semanticEndpoint;
  const url = endpoint ? new URL(endpoint) : null;
  if (url && url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Endpoint semântico inválido.");
  const schema = z.object({ model: z.string().min(1).max(200), vector: z.array(z.number().finite()).min(32).max(4096) });
  let result: z.infer<typeof schema> | undefined;
  for (let offset = 0; offset < text.length; offset += 28000) {
    const chunk = text.slice(offset, offset + 28000);
    if (!chunk.trim()) continue;
    let raw: unknown;
    if (url) {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.GED_SEMANTIC_API_KEY ? { Authorization: `Bearer ${process.env.GED_SEMANTIC_API_KEY}` } : {}) }, body: JSON.stringify({ text: chunk }), signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error("O serviço semântico está indisponível.");
      raw = await response.json();
    } else raw = await runGedInternalTask("embed", { text: chunk });
    const embedding = schema.parse(raw);
    const norm = Math.hypot(...embedding.vector);
    if (!norm) throw new Error("O serviço semântico retornou vetor vazio.");
    if (!result) result = { model: embedding.model, vector: embedding.vector.map(() => 0) };
    if (result.model !== embedding.model || result.vector.length !== embedding.vector.length) throw new Error("O modelo semântico mudou durante o processamento; repita a indexação.");
    for (let index = 0; index < result.vector.length; index++) result.vector[index] += embedding.vector[index] / norm * chunk.length;
  }
  if (!result) throw new Error("Texto sem conteúdo semântico.");
  const norm = Math.hypot(...result.vector);
  if (!norm) throw new Error("Não foi possível normalizar o vetor semântico.");
  return { model: result.model, vector: result.vector.map(value => value / norm) };
}

export async function convertGedOffice(filename: string, bytes: Buffer): Promise<Buffer> {
  const providers = await readGedProviderConfig();
  const endpoint = providers.conversionEndpoint;
  if (endpoint) {
    const url = new URL(endpoint); if (url.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Endpoint de conversão inválido.");
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GED_CONVERSION_API_KEY ?? ""}` }, body: JSON.stringify({ filename: basename(filename), contentBase64: bytes.toString("base64"), output: "pdf" }), signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error("Conversão indisponível.");
    const data = z.object({ pdfBase64: z.string().max(28000000) }).parse(await response.json());
    const pdf = Buffer.from(data.pdfBase64, "base64"); if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Conversor retornou saída inválida."); return pdf;
  }
  if (gedUsesVercelSandbox()) {
    const data = z.object({ pdfBase64: z.string().max(28000000) }).parse(await runGedInternalTask("convert", { filename: basename(filename), contentBase64: bytes.toString("base64"), output: "pdf" }));
    const pdf = Buffer.from(data.pdfBase64, "base64");
    if (pdf.length > 20 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Conversor interno retornou saída inválida.");
    return pdf;
  }
  const directory = await mkdtemp(join(tmpdir(), "ged-conversion-"));
  try {
    const name = basename(filename).replace(/[^a-zA-Z0-9._-]/g, "-"); await writeFile(join(directory, name), bytes);
    const { pathToFileURL } = await import("node:url");
    await run(providers.libreOfficePath || "soffice", [`-env:UserInstallation=${pathToFileURL(join(directory, "profile")).href}`, "--headless", "--convert-to", "pdf", "--outdir", directory, join(directory, name)], { timeout: 90000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    const pdf = await readFile(join(directory, name.replace(/\.[^.]+$/, ".pdf"))); if (pdf.length > 20 * 1024 * 1024) throw new Error("PDF convertido superior a 20 MiB."); return pdf;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function validateGedPdfA(bytes: Buffer) {
  const providers = await readGedProviderConfig();
  if (!providers.pdfaEndpoint && gedUsesVercelSandbox()) return z.object({ compliant: z.boolean(), profile: z.string(), report: z.string().max(2000000) }).parse(await runGedInternalTask("pdfa", { contentBase64: bytes.toString("base64") }));
  if (providers.pdfaEndpoint) {
    const url = new URL(providers.pdfaEndpoint); if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Endpoint PDF/A inválido.");
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GED_PDFA_API_KEY ?? ""}` }, body: JSON.stringify({ contentBase64: bytes.toString("base64") }), signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error("Validação PDF/A indisponível.");
    return z.object({ compliant: z.boolean(), profile: z.string(), report: z.string().max(2000000) }).parse(await response.json());
  }
  const directory = await mkdtemp(join(tmpdir(), "ged-pdfa-"));
  try {
    const path = join(directory, "original.pdf"); await writeFile(path, bytes);
    let noncompliantExit = false;
    const { stdout } = await run(providers.veraPdfPath || "verapdf", ["--format", "xml", path], { timeout: 90000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }).catch((error: unknown) => {
      const failure = error as { code?: unknown; killed?: boolean; stdout?: unknown };
      if (failure.code !== 1 || failure.killed || typeof failure.stdout !== "string") throw error;
      noncompliantExit = true;
      return { stdout: failure.stdout };
    });
    if (stdout.length > 2_000_000 || /<!DOCTYPE/i.test(stdout) || XMLValidator.validate(stdout) !== true) throw new Error("Relatório veraPDF inválido.");
    const report = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: true }).parse(stdout);
    const jobs = report.report?.jobs?.job; const job = Array.isArray(jobs) ? jobs[0] : jobs;
    const validations = job?.validationReport; const validation = Array.isArray(validations) ? validations[0] : validations;
    if (typeof validation?.isCompliant !== "boolean" || !/^PDF\/A-/i.test(validation.profileName ?? "")) throw new Error("Resposta PDF/A do veraPDF não reconhecida.");
    if (noncompliantExit && validation.isCompliant) throw new Error("Resultado veraPDF incompatível com o código de saída.");
    return { compliant: validation.isCompliant as boolean, profile: String(validation.profileName), report: stdout };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function imagesToGedPdf(images: Buffer[]) {
  const pdf = await PDFDocument.create();
  for (const bytes of images) {
    const bmp = bytes.subarray(0, 2).toString() === "BM" ? decodeGedBmp(bytes) : null;
    const imageBytes = bmp ? await sharp(bmp.pixels, { raw: { width: bmp.width, height: bmp.height, channels: 3 } }).png().toBuffer() : bytes;
    const metadata = await sharp(imageBytes, { limitInputPixels: 16000000 }).metadata();
    for (let index = 0; index < (metadata.pages ?? 1); index++) {
      const png = await sharp(imageBytes, { page: index, limitInputPixels: 16000000 }).rotate().png().toBuffer();
      const image = await pdf.embedPng(png); const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
      const page = pdf.addPage([image.width * scale, image.height * scale]); page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
      if (pdf.getPageCount() > 200) throw new Error("Limite de 200 páginas.");
    }
  }
  return Buffer.from(await pdf.save());
}

export async function searchableGedPdf(bytes: Buffer, mimeType: string, pages: Array<{ page: number; words?: GedWord[] }>) {
  const pdf = await PDFDocument.load(mimeType === "application/pdf" ? bytes : await imagesToGedPdf([bytes]));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const recognized of pages) {
    const page = pdf.getPage(recognized.page - 1);
    for (const word of recognized.words ?? []) {
      const text = word.text.replace(/[^\x20-\x7E\xA0-\xFF]/g, " "); if (!text.trim()) continue;
      const size = Math.max(1, word.height * page.getHeight() * 0.8);
      page.drawText(text, { x: word.x * page.getWidth(), y: page.getHeight() * (1 - word.y - word.height), size: Math.min(size, (word.width * page.getWidth()) / Math.max(0.01, font.widthOfTextAtSize(text, 1))), font, color: rgb(0, 0, 0), opacity: 0 });
    }
  }
  return Buffer.from(await pdf.save());
}

export async function saveGedArtifact(context: AppContext, documentId: string, versionId: string, kind: string, bytes: Buffer, report: unknown = {}) {
  await requireManagedDocument(context, documentId);
  if (bytes.length > 20 * 1024 * 1024) throw new Error("Derivado superior a 20 MiB.");
  const { put } = await import("@vercel/blob"); const hash = gedHash(bytes);
  const pathname = `${getBlobDocumentPrefix()}ged-derived/${documentId}/${versionId}/${kind}-${hash}.pdf`;
  const blob = await put(pathname, bytes, { access: "private", contentType: "application/pdf", addRandomSuffix: false, allowOverwrite: true });
  const database = context.database ?? db;
  await database.execute(sql`INSERT INTO "GedArtifact"(id,"versionId",kind,url,pathname,hash,"mimeType",report) VALUES(${randomUUID()},${versionId},${kind},${blob.url},${pathname},${hash},'application/pdf',${JSON.stringify(report)}::jsonb) ON CONFLICT("versionId",kind) DO UPDATE SET url=excluded.url,pathname=excluded.pathname,hash=excluded.hash,report=excluded.report`);
}
