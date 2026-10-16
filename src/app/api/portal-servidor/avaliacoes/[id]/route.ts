import { NextRequest, NextResponse } from "next/server";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { evaluationResultRows, listOwnPublishedEvaluationResults } from "@/lib/portal-servidor/evaluation-results";
import { renderHrReport } from "@/lib/rh/report-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    const id = (await params).id;
    const result = (await listOwnPublishedEvaluationResults(access.context)).find(row => row.id === id);
    if (!result) throw new AccessError("Resultado indisponível.", 404);
    const file = await renderHrReport({ title: "Resultado de avaliação funcional", headers: ["Campo", "Valor"], rows: evaluationResultRows(result) }, "PDF");
    await writeAuditEvent(access.context.prisma, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_EVALUATION_RESULT", targetId: id });
    return new NextResponse(new Uint8Array(file.bytes), { headers: { "Content-Type": file.contentType, "Content-Disposition": "attachment; filename=resultado-avaliacao.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível emitir o resultado." }, { status: error instanceof AccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } }); }
}
