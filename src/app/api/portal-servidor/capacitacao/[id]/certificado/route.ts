import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { coursePolicySchema } from "@/lib/portal-servidor/career-service";
import { renderHrReport } from "@/lib/rh/report-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    const id = (await params).id;
    const enrollment = await access.context.prisma.hrPortalRequest.findFirst({ where: { id, employeeId: access.employee.id, kind: "CAPACITACAO_INSCRICAO", status: "CONCLUIDA" } });
    const event = enrollment && await access.context.prisma.hrIntegrationEvent.findUnique({ where: { sourceKey: `PORTAL:CERTIFICADO:${enrollment.id}` } });
    if (!event || event.status !== "PROCESSADO") throw new AccessError("Certificado indisponível.", 404);
    const payload = z.object({ employeeId: z.string(), employeeName: z.string(), courseName: z.string(), policy: coursePolicySchema, certificateCode: z.uuid(), issuedAt: z.iso.datetime(), attendancePercentage: z.number() }).parse(event.payload);
    if (payload.employeeId !== access.employee.id) throw new AccessError("Certificado indisponível.", 404);
    const report = await renderHrReport({ title: "Certificado de capacitação", headers: ["Participante", "Curso", "Carga horária", "Período", "Local", "Presença reconhecida", "Emitente", "Emissão", "Código documental"], rows: [[payload.employeeName, payload.courseName, `${payload.policy.hours} horas`, `${payload.policy.startsAt.slice(0, 10)} a ${payload.policy.endsAt.slice(0, 10)}`, payload.policy.location, `${payload.attendancePercentage}%`, payload.policy.issuerName, payload.issuedAt.slice(0, 10), payload.certificateCode]] }, "PDF");
    await writeAuditEvent(access.context.prisma, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_COURSE_CERTIFICATE", targetId: event.id });
    return new NextResponse(new Uint8Array(report.bytes), { headers: { "Content-Type": report.contentType, "Content-Disposition": "attachment; filename=certificado-capacitacao.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível emitir o certificado." }, { status: error instanceof AccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } }); }
}
