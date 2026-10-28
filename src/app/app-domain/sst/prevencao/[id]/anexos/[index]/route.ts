import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getPrevention } from "@/lib/sst/prevention-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { sstDatabase } from "@/lib/sst/database";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; index: string }> }) {
  try {
    const { id, index } = await params, context = await getTenantContextForModule("SST");
    const row = await getPrevention(context, id);
    const attachment = "attachments" in row.payload && /^\d+$/.test(index) ? row.payload.attachments[Number(index)] : null;
    if (!attachment) return new Response("Anexo não encontrado.", { status: 404 });
    await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: auditEventTypes.documentDownload, targetType: "SST_PREVENTION_ATTACHMENT", targetId: `${id}:${index}` });
    return new Response(Buffer.from(attachment.base64, "base64"), { headers: { "Content-Type": attachment.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { if (error instanceof AccessError) return new Response(error.message, { status: error.status }); return new Response("Não foi possível obter o anexo.", { status: 500 }); }
}
