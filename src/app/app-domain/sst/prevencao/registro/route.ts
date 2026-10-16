import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { savePrevention } from "../actions";
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Origem da solicitação inválida." }, { status: 403 });
    await getTenantContextForModuleOperation("SST", "create");
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Corpo do registro obrigatório." }, { status: 400 });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 15 * 1024 * 1024) { await reader.cancel(); return Response.json({ error: "Limite total excedido." }, { status: 413 }); }
      chunks.push(value);
    }
    const raw: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return Response.json({ error: "Formato inválido." }, { status: 400 });
    const form = new FormData();
    for (const key of ["budgetUnitId", "title", "submissionKey", "payload"]) {
      const value = (raw as Record<string, unknown>)[key];
      if (typeof value !== "string") return Response.json({ error: "Campos obrigatórios inválidos." }, { status: 400 });
      form.set(key, value);
    }
    return Response.json(await savePrevention(form), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Não foi possível receber o registro." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
