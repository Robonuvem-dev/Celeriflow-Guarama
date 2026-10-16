import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { constructionFileHash } from "./construction-documents-policy";
import { getFile, uploadProcessFile } from "@/lib/platform/blob";
import { getCeleriFlowInstanceId } from "@/lib/platform/instance";

function backupRoot() {
  return path.resolve(process.env.CONSTRUCTION_DOCUMENT_BACKUP_DIR || path.join(process.cwd(), ".agent", "construction-document-backup"), getCeleriFlowInstanceId().replace(/[^a-zA-Z0-9_-]/g, "_"));
}
export async function backupConstructionPdf(bytes: Uint8Array) {
  if (bytes.length > 10 * 1024 * 1024) throw new Error("PDF excede o limite de 10 MB.");
  const hash = constructionFileHash(bytes); const root = backupRoot(); await mkdir(root, { recursive: true });
  const backupPath = path.join(root, `${hash}.pdf`);
  try { await writeFile(backupPath, bytes, { flag: "wx" }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  if (constructionFileHash(await readFile(backupPath)) !== hash) throw new Error("Backup físico falhou na verificação de integridade.");
  return { backupPath, hashSha256: hash };
}
export async function storeConstructionPdf(bytes: Uint8Array, filename: string) {
  const { backupPath, hashSha256: hash } = await backupConstructionPdf(bytes);
  // Standalone demonstration uses a private, content-addressed physical store.
  // Configured installations additionally persist the identical bytes in Blob.
  const fileUrl = process.env.BLOB_READ_WRITE_TOKEN ? (await uploadProcessFile(new File([Buffer.from(bytes)], filename, { type: "application/pdf" }))).url : `construction-local:${hash}`;
  return { fileUrl, backupPath, hashSha256: hash };
}
export async function readConstructionPdf(fileUrl: string, expectedHash: string) {
  let bytes: Uint8Array;
  if (fileUrl.startsWith("construction-local:")) {
    const hash = fileUrl.slice("construction-local:".length);
    if (!/^[a-f0-9]{64}$/.test(hash) || hash !== expectedHash) throw new Error("Referência física inválida.");
    bytes = await readFile(path.join(backupRoot(), `${hash}.pdf`));
  } else {
    const file = await getFile(fileUrl); if (!file?.stream) throw new Error("PDF indisponível no armazenamento.");
    bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  }
  if (constructionFileHash(bytes) !== expectedHash) throw new Error("O PDF armazenado diverge do hash GED.");
  return bytes;
}
