import { del, get, put } from "@vercel/blob";
import JSZip from "jszip";
import { getCeleriFlowInstanceId } from "@/lib/platform/instance";
import { centralHash } from "./central-evidence";
import { CentralError } from "./central-error";

export const CENTRAL_MAX_BYTES = 3 * 1024 * 1024;
export const CENTRAL_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export function centralBlobPrefix() { return `instances/${getCeleriFlowInstanceId()}/signature-central/`; }
export function assertCentralBlobPath(path: string) {
  if (!path.startsWith(centralBlobPrefix()) || !/^[a-zA-Z0-9/._-]+$/.test(path) || path.includes("..")) throw new Error("Arquivo fora do namespace da Central.");
}
export interface CentralBlobStore {
  put(path: string, bytes: Buffer, mime: string): Promise<void>;
  get(path: string): Promise<Buffer | null>;
  delete(path: string): Promise<void>;
}
export const centralBlobStore: CentralBlobStore = {
  async put(path, bytes, mime) {
    assertCentralBlobPath(path);
    await put(path, bytes, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: mime });
  },
  async get(path) {
    assertCentralBlobPath(path);
    const result = await get(path, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  },
  async delete(path) { assertCentralBlobPath(path); await del(path); },
};
const formats: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", txt: "text/plain", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", odt: "application/vnd.oasis.opendocument.text" };
export async function readCentralFile(file: File) {
  if (!file.size || file.size > CENTRAL_MAX_BYTES) throw new CentralError("Envie um arquivo de até 3 MiB.", file.size > CENTRAL_MAX_BYTES ? 413 : 400);
  const filename = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160);
  const extension = filename.split(".").pop()?.toLowerCase() ?? "", mimeType = formats[extension];
  if (!mimeType || (file.type && file.type !== mimeType && file.type !== "application/octet-stream")) throw new CentralError("Tipo de arquivo não permitido ou incompatível.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size || bytes.length > CENTRAL_MAX_BYTES) throw new CentralError("Tamanho de arquivo inválido.");
  let valid = false;
  if (extension === "pdf") valid = bytes.subarray(0, 5).toString() === "%PDF-";
  if (extension === "jpg" || extension === "jpeg") valid = bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (extension === "png") valid = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === "doc") valid = bytes.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"));
  if (extension === "txt") { try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); valid = !bytes.includes(0); } catch { valid = false; } }
  if (extension === "docx" || extension === "odt") {
    // Check directory before decompression to reject zip bombs. Only the tiny
    // mimetype entry is inflated; Office document bodies are never inflated here.
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(bytes); } catch { throw new CentralError("Arquivo compactado inválido."); }
    const entries = Object.values(zip.files);
    if (entries.length > 2000) throw new CentralError("Arquivo compactado excede os limites.");
    valid = extension === "docx" ? Boolean(zip.file("[Content_Types].xml") && zip.file("word/document.xml")) : Boolean(zip.file("content.xml") && zip.file("META-INF/manifest.xml"));
    if (extension === "odt") {
      const entry = zip.file("mimetype") as (JSZip.JSZipObject & { _data?: { uncompressedSize: number } }) | null;
      valid = valid && Boolean(entry && (entry._data?.uncompressedSize ?? Infinity) < 128 && await entry.async("string") === mimeType);
    }
  }
  if (!valid) throw new CentralError("O conteúdo físico não corresponde ao tipo do arquivo.");
  return { bytes, filename, mimeType, byteLength: bytes.length, hashSha256: centralHash(bytes) };
}
