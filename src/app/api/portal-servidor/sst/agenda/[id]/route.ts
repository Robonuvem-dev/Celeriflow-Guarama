import { NextRequest, NextResponse } from "next/server";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { readOwnMedicalAppointment } from "@/lib/portal-servidor/medical-agenda";
import { renderHrReport } from "@/lib/rh/report-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    const appointment = await readOwnMedicalAppointment(access.context, (await params).id);
    const report = await renderHrReport({ title: "Comprovante de agendamento SST", headers: ["Servidor", "Matrícula", "Unidade", "Profissional", "Finalidade", "Início", "Fim", "Situação", "Identificador"], rows: [[appointment.employee.name, appointment.employee.registration || "", appointment.availability.unitName, appointment.availability.professional.fullName, appointment.purpose, appointment.startsAt.toISOString(), appointment.endsAt.toISOString(), appointment.status, appointment.id]] }, "PDF");
    await writeAuditEvent(access.context.prisma, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_MEDICAL_APPOINTMENT", targetId: appointment.id });
    return new NextResponse(new Uint8Array(report.bytes), { headers: { "Content-Type": report.contentType, "Content-Disposition": "attachment; filename=agendamento-sst.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível emitir o comprovante." }, { status: error instanceof AccessError ? error.status : 500 }); }
}
