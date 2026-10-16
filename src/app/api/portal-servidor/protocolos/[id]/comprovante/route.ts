import { NextRequest, NextResponse } from "next/server";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { readOwnFunctionalRequest } from "@/lib/portal-servidor/functional-requests";
import { renderHrReport } from "@/lib/rh/report-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    const { request, payload, process } = await readOwnFunctionalRequest(access.context.prisma, access.employee.id, (await params).id);
    const file = await renderHrReport({ title: "Comprovante de protocolo funcional", headers: ["Campo", "Valor"], rows: [["Protocolo", process.protocolNumber], ["Titular", access.employee.name], ["Serviço", payload.serviceName], ["Finalidade", "Interno da Entidade"], ["Recebimento", request.createdAt.toISOString()], ["Formulário", String(payload.configuration.version)], ["Requerimento", payload.description], ["Tramitação", process.status], ["Decisão", request.status], ["Execução", payload.execution], ["Anexos recebidos", String(payload.attachments.length)], ["Prazo de origem", process.expectedCompletionAt?.toISOString() || "Conforme roteiro configurado"]] }, "PDF");
    await writeAuditEvent(access.context.prisma, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_PROTOCOL_RECEIPT", targetId: request.id });
    return new NextResponse(new Uint8Array(file.bytes), { headers: { "Content-Type": file.contentType, "Content-Disposition": "attachment; filename=comprovante-protocolo.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível emitir o comprovante." }, { status: error instanceof AccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } }); }
}
