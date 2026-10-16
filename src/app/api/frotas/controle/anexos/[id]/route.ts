import { getTenantContextForModule, getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { downloadFleetAttachment, withdrawFleetAttachment } from "@/lib/frotas/control-attachments";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params, data = await downloadFleetAttachment(await getTenantContextForModule("FROTAS"), id); const name = data.item.filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-"); return new Response(data.bytes, { headers: { "Content-Type": data.item.mimeType, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); } catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Anexo indisponível ou fora do setor." }, { status: error instanceof AccessError ? error.status : 404 }); }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try { const { id } = await params; await withdrawFleetAttachment(await getTenantContextForModuleOperation("FROTAS", "update"), id); return Response.json({ recorded: true }); } catch (error) { return Response.json({ error: error instanceof AccessError ? error.message : "Retirada não autorizada." }, { status: error instanceof AccessError ? error.status : 403 }); }
}
