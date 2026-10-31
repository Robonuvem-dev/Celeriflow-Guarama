export async function gedCommand(command: string, id = "", data: Record<string, unknown> = {}) {
  const response = await fetch("/api/assinatura-digital/ged", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, id, data }) });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || "Não foi possível concluir a operação.");
  return result.result;
}
export function gedDownloadUrl(id: string, versionId?: string, inline = false) {
  return `/api/assinatura-digital/ged/download?items=${encodeURIComponent(JSON.stringify([{ id, versionId }]))}${inline ? "&inline=1" : ""}`;
}
