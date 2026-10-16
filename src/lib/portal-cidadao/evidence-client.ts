"use client";
import { upload } from "@vercel/blob/client";

export async function uploadPortalEvidence(file: File, input: { serviceId: string; code: string; requestId?: string }) {
  if (!file.size || file.size > 10 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) throw new Error("Envie PDF, JPG ou PNG de até 10 MB.");
  const payload = { ...input, requestId: input.requestId || "", filename: file.name };
  const preparation = await fetch(`/api/portal/servicos/anexos?${new URLSearchParams({ serviceId: input.serviceId, code: input.code, requestId: input.requestId || "" })}`);
  const settings = await preparation.json(); if (!preparation.ok) throw new Error(settings.error);
  const filename = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
  const blob = await upload(`${settings.prefix}${crypto.randomUUID()}-${filename}`, file, { access: "private", handleUploadUrl: "/api/portal/servicos/anexos", clientPayload: JSON.stringify(payload) });
  const confirmation = await fetch("/api/portal/servicos/anexos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "confirmar", url: blob.url, payload }) });
  const result = await confirmation.json(); if (!confirmation.ok) throw new Error(result.error);
  return result as { uploadId: string; filename: string };
}
