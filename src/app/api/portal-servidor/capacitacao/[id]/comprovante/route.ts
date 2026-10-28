import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { coursePolicySchema } from "@/lib/portal-servidor/career-service";
import { renderHrReport } from "@/lib/rh/report-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalRequest } from "@/db/repositories/portal-servidor/records";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    const id = (await params).id;
    const executor = access.context.database ?? db;
    const request = await portalRequest(executor, sql`id=${id} AND "employeeId"=${access.employee.id} AND kind='CAPACITACAO_INSCRICAO'`);
    if (!request) throw new AccessError("Inscrição indisponível.", 404);
    const payload = z.object({ courseName: z.string(), employeeName: z.string(), policy: coursePolicySchema }).parse(request.payload);
    const file = await renderHrReport({ title: "Comprovante de inscrição em capacitação", headers: ["Campo", "Valor"], rows: [["Inscrição", request.id], ["Participante", payload.employeeName], ["Curso", payload.courseName], ["Período", `${payload.policy.startsAt} a ${payload.policy.endsAt}`], ["Local", payload.policy.location], ["Carga horária", `${payload.policy.hours} horas`], ["Data da inscrição", request.createdAt.toISOString()], ["Situação", request.status], ["Emissão de certificado", "Depende da conclusão e presença reconhecidas pelo RH."]] }, "PDF");
    await writeAuditEvent(executor, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_COURSE_ENROLLMENT", targetId: request.id });
    return new NextResponse(new Uint8Array(file.bytes), { headers: { "Content-Type": file.contentType, "Content-Disposition": "attachment; filename=comprovante-capacitacao.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível emitir o comprovante." }, { status: error instanceof AccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } }); }
}
