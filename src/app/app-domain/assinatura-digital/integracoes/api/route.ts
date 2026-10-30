import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { AccessError } from "@/lib/platform/access-error";
import { getCentralA1PublicConfiguration, listCentralA1Integrations, saveCentralA1Integration, suspendCentralA1Integration } from "@/lib/signatures/central-a1";

function failure(error: unknown) {
  const message = error instanceof AccessError ? error.message : error instanceof z.ZodError ? "Revise os campos e informe apenas certificados públicos PEM." : error instanceof Error && !/query|constraint|duplicate|openssl|error:/i.test(error.message) ? error.message : "Não foi possível salvar. Verifique certificado, cadeia, referência ENV e possíveis duplicidades.";
  return NextResponse.json({ error: message }, { status: error instanceof AccessError ? error.status : 400, headers: { "Cache-Control": "no-store" } });
}
async function mutationBody(request: Request): Promise<unknown> {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new AccessError("Origem da requisição não permitida.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Envie metadados em JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Corpo da requisição ausente.");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 384000) { await reader.cancel(); throw new Error("Metadados excedem o limite permitido."); }
      parts.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } finally { reader.releaseLock(); }
}
export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModule("ASSINATURA_DIGITAL");
    const id = new URL(request.url).searchParams.get("id");
    return NextResponse.json(id ? { configuration: await getCentralA1PublicConfiguration(context, id) } : { integrations: await listCentralA1Integrations(context) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const raw = await mutationBody(request);
    const operation = raw && typeof raw === "object" && "id" in raw && raw.id ? "update" : "create";
    const context = await getTenantContextForModuleOperation("ASSINATURA_DIGITAL", operation);
    // The service owns strict validation of the entire DTO.
    return NextResponse.json({ integration: await saveCentralA1Integration(context, raw as Parameters<typeof saveCentralA1Integration>[1]) });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("ASSINATURA_DIGITAL", "update");
    const { id } = z.object({ id: z.string().min(1).max(128), active: z.literal(false) }).strict().parse(await mutationBody(request));
    await suspendCentralA1Integration(context, id);
    return NextResponse.json({ success: true });
  } catch (error) { return failure(error); }
}
