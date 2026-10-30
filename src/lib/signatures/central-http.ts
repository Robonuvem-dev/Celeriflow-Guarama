import { AccessError } from "@/lib/platform/tenant-context";
import { CentralError } from "./central-error";
import { CENTRAL_MAX_BYTES } from "./central-storage";

export const centralNoStore = { "Cache-Control": "no-store" };
export function centralHttpError(error: unknown) {
  if (error instanceof CentralError || error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status, headers: centralNoStore });
  // Never expose driver errors, secrets, file content or provider responses.
  console.error("[signature-central]", "CENTRAL_OPERATION_UNAVAILABLE");
  return Response.json({ error: "Serviço temporariamente indisponível. Tente novamente com o mesmo requestId." }, { status: 503, headers: centralNoStore });
}
export async function centralMultipart(request: Request) {
  const length = request.headers.get("content-length");
  if (length && Number(length) > CENTRAL_MAX_BYTES + 64 * 1024) throw new CentralError("Requisição excede 3 MiB por arquivo.", 413);
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new CentralError("Envie multipart/form-data.");
  // Bound the actual stream too: content-length is not trusted.
  const reader = request.body?.getReader();
  if (!reader) throw new CentralError("Corpo vazio.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > CENTRAL_MAX_BYTES + 64 * 1024) { await reader.cancel(); throw new CentralError("Requisição excede o limite.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  let data: FormData;
  try { data = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new CentralError("Multipart inválido."); }
  for (const key of new Set(data.keys())) if (data.getAll(key).length !== 1) throw new CentralError("Campos duplicados não são permitidos.");
  return data;
}
export function centralText(data: FormData, name: string) {
  const value = data.get(name);
  if (value !== null && typeof value !== "string") throw new CentralError(`Campo ${name} inválido.`);
  if (value && value.length > 2048) throw new CentralError(`Campo ${name} excede o limite.`);
  return value ?? "";
}
export function centralFile(data: FormData, required: boolean) {
  const file = data.get("file");
  if (!file && !required) return undefined;
  if (!(file instanceof File)) throw new CentralError("Envie um arquivo por requisição.");
  if (file.size > CENTRAL_MAX_BYTES) throw new CentralError("Arquivo excede 3 MiB.", 413);
  return file;
}
