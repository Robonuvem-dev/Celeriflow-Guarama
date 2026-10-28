import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listFunctionalBirthdays } from "@/lib/portal-servidor/birthday-service";
import { renderHrReport } from "@/lib/rh/report-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    const month = z.coerce.number().int().min(1).max(12).parse(request.nextUrl.searchParams.get("month"));
    const result = await listFunctionalBirthdays(access.context, month);
    if (!result.enabled) throw new AccessError("Relação de aniversariantes indisponível para seu acesso.", 403);
    const file = await renderHrReport({ title: `Aniversariantes publicados — mês ${month}`, headers: ["Nome", "Dia/mês"], rows: result.rows.map(row => [row.name, `${String(row.day).padStart(2, "0")}/${String(row.month).padStart(2, "0")}`]) }, "PDF");
    await writeAuditEvent(access.context.database ?? db, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.reportIssued, targetType: "FUNCTIONAL_BIRTHDAY_REPORT", targetId: String(month) });
    return new NextResponse(new Uint8Array(file.bytes), { headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="aniversariantes-${month}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AccessError ? error.message : error instanceof z.ZodError ? "Informe um mês entre 1 e 12." : "Não foi possível emitir o relatório." }, { status: error instanceof AccessError ? error.status : error instanceof z.ZodError ? 400 : 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
