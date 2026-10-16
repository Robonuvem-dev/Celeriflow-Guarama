import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { followupBatchForActor } from "@/lib/saude/followup-exchange-service";
import { canonicalFollowupJson } from "@/lib/saude/followup-contract";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports"), id = decodeURIComponent((await params).id);
  const batch = await followupBatchForActor(context.prisma, context, id);
  if (!batch.receipt) return Response.json({ error: "Remessa ainda não processada pelo receptor." }, { status: 409 });
  const receipt = batch.receipt;
  const payload = { batchId: batch.id, contract: batch.contractName, schemaVersion: batch.schemaVersion, hashSha256: batch.hashSha256, receiver: receipt.receiverSnapshot, protocol: receipt.protocol, status: receipt.status, total: receipt.total, accepted: receipt.accepted, rejected: receipt.rejected, unchanged: receipt.unchanged, processedByUsuarioId: receipt.processedByUsuarioId, processedAt: receipt.createdAt.toISOString(), results: receipt.results.map(result => ({ ordinal: result.batchItem.ordinal, originType: result.batchItem.originType, originId: result.batchItem.originId, status: result.status, message: result.message, receivedRecordId: result.recordId })) };
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "HEALTH_FOLLOWUP_RECEIPT", targetId: receipt.id });
  return new Response(canonicalFollowupJson(payload), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="retorno-${batch.id}.json"`, "Cache-Control": "private, no-store" } });
}
