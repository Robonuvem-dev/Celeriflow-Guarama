import { createHash } from "node:crypto";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { followupBatchForActor } from "@/lib/saude/followup-exchange-service";
import { canonicalFollowupJson } from "@/lib/saude/followup-contract";
import { followupCsvCell, followupPresentation } from "@/lib/saude/followup-presentation";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports"), id = decodeURIComponent((await params).id);
  const database = context.database ?? db;
  const batch = await followupBatchForActor(database, context, id);
  const format = z.enum(["json", "csv"]).parse(new URL(request.url).searchParams.get("formato") || "json");
  let body: string;
  if (format === "json") body = canonicalFollowupJson(batch.payload);
  else {
    const header = ["Contrato", "Versão", "Remessa", "Ordem", "Tipo de origem", "Identificador de origem", "Paciente", "Paciente ID", "CNS paciente", "Profissional", "Atualização da origem", "Retrato em", "Chave de repetição", "Resultado", "Motivo", "Conteúdo de origem"];
    const rows = batch.items.map(item => {
      const summary = followupPresentation(item.originType, item.payload), result = batch.receipt?.results.find(result => result.batchItemId === item.id);
      return [batch.contractName, batch.schemaVersion, batch.id, item.ordinal, item.originType, item.originId, summary.patientName, summary.patientId, summary.patientCns, summary.professionalName, summary.sourceUpdatedAt, summary.snapshotAt, item.idempotencyKey, result?.status || "AGUARDANDO_PROCESSAMENTO", result?.message || "", JSON.stringify(item.payload)];
    });
    body = `\uFEFF${[header, ...rows].map(row => row.map(followupCsvCell).join(";")).join("\r\n")}\r\n`;
  }
  const hash = createHash("sha256").update(body, "utf8").digest("hex");
  await insertAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "HEALTH_FOLLOWUP_BATCH", targetId: batch.id });
  return new Response(body, { headers: { "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="remessa-${batch.id}.${format}"`, "X-Content-SHA256": hash, "Cache-Control": "private, no-store" } });
}
