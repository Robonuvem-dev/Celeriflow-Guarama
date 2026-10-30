import type { CentralSignatureMethod, CentralSignatureRecord, CentralSigner, CentralA1Integration } from "@/lib/contracts/signature-central";

export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_BATCH_FILES = 20;
export const FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.txt,.doc,.docx,.odt";
export type BatchItem = { requestId: string; file: File; status: "pending" | "sending" | "success" | "error"; error?: string; record?: CentralSignatureRecord };
export type BatchOptions = { signerId: string; documentTypeId: string; method: CentralSignatureMethod; integrationId: string; password: string };

export function fileError(file: File): string | undefined {
  if (!file.size) return "O arquivo está vazio.";
  if (file.size > MAX_FILE_BYTES) return "O arquivo excede 3 MiB.";
  if (!/\.(pdf|jpe?g|png|txt|docx?|odt)$/i.test(file.name)) return "Formato não permitido. Use PDF, JPEG, PNG, TXT, DOC, DOCX ou ODT.";
}

export function signerProblem(signer: CentralSigner | undefined, now = Date.now()): string {
  if (!signer) return "Selecione um assinador.";
  if (!signer.active) return "Assinador inativo.";
  if (!Number.isFinite(Date.parse(signer.validUntil)) || Date.parse(signer.validUntil) <= now) return "Prazo do assinador vencido.";
  if (!signer.hasPassword) return "Assinador sem senha pessoal cadastrada.";
  return "";
}

export function integrationProblem(integration: CentralA1Integration | undefined, method: CentralSignatureMethod, now = Date.now()): string {
  if (method === "INTERNAL") return "";
  if (!integration || integration.kind !== method) return "Selecione uma integração compatível com o método.";
  if (!integration.active) return "Integração inativa.";
  if (!Number.isFinite(Date.parse(integration.validFrom)) || !Number.isFinite(Date.parse(integration.validTo)) || Date.parse(integration.validFrom) > now || Date.parse(integration.validTo) <= now) return "Certificado fora da validade.";
  return "";
}

// O chamador mantém a mesma lista/UUIDs inclusive após falha de rede. Sucessos não são reenviados.
export async function submitBatch(items: readonly BatchItem[], options: BatchOptions, update: (item: BatchItem) => void, request: typeof fetch = fetch): Promise<void> {
  for (const item of items) {
    if (item.status === "success") continue;
    const invalid = fileError(item.file);
    if (invalid) { update({ ...item, status: "error", error: invalid }); continue; }
    update({ ...item, status: "sending", error: undefined });
    const body = new FormData();
    body.set("file", item.file);
    body.set("signerId", options.signerId);
    body.set("documentTypeId", options.documentTypeId);
    body.set("method", options.method);
    if (options.method !== "INTERNAL") body.set("integrationId", options.integrationId);
    body.set("password", options.password);
    body.set("requestId", item.requestId);
    try {
      const response = await request("/api/assinatura-digital/assinar", { method: "POST", body, cache: "no-store" });
      const result = await response.json() as { record?: CentralSignatureRecord; error?: string };
      if (!response.ok || !result.record?.id) throw new Error(result.error || "Resposta de assinatura indisponível. Tente novamente com o mesmo lote.");
      update({ ...item, status: "success", error: undefined, record: result.record });
    } catch (error) {
      update({ ...item, status: "error", error: error instanceof Error ? error.message : "Falha de comunicação. Tente novamente." });
    }
  }
}

export async function downloadCentralFile(id: string, kind: "documentos" | "comprovantes", filename: string): Promise<void> {
  const response = await fetch(`/api/assinatura-digital/${kind}/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || (response.status === 410 ? "O prazo de 90 dias expirou. O comprovante continua disponível." : "Não foi possível baixar. Verifique sua autorização e tente novamente."));
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
