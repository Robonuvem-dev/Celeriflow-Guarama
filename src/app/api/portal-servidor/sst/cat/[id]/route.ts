import { NextRequest, NextResponse } from "next/server";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { readOwnAccident } from "@/lib/portal-servidor/own-accident";
import { renderHrReport } from "@/lib/rh/report-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    const cat = await readOwnAccident(access.context, (await params).id);
    const file = await renderHrReport({ title: "Comprovante de comunicação de acidente de trabalho", headers: ["Campo", "Valor"], rows: [["Referência da comunicação", cat.id], ["Servidor", cat.employeeName], ["Matrícula", cat.registration], ["Unidade", cat.unitName], ["Ocorrência", cat.occurredAt.toISOString()], ["Recebimento", cat.createdAt.toISOString()], ["Categoria", cat.kind], ["Descrição comunicada", cat.description], ["Situação administrativa", cat.status], ["Natureza do comprovante", "Comunicação interna e acompanhamento SST. Não comprova transmissão ao INSS/eSocial."]] }, "PDF");
    await writeAuditEvent(access.context.prisma, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_CAT_RECEIPT", targetId: cat.id });
    return new NextResponse(new Uint8Array(file.bytes), { headers: { "Content-Type": file.contentType, "Content-Disposition": "attachment; filename=comprovante-cat.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível emitir o comprovante." }, { status: error instanceof AccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } }); }
}
