import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AccessError, getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { readOwnRecruitmentApplications, recruitmentNoticeSchema } from "@/lib/rh/recruitment-service";
import { renderHrReport } from "@/lib/rh/report-service";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { db } from "@/db/client";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getCurrentTenantContext(), id = (await params).id;
    const application = (await readOwnRecruitmentApplications(context)).find(row => row.id === id);
    if (!application) throw new AccessError("Inscrição indisponível.", 404);
    const source = z.object({ noticeName: z.string(), fullName: z.string(), policy: recruitmentNoticeSchema, email: z.string(), acceptedAt: z.iso.datetime() }).parse(application.snapshot);
    const file = await renderHrReport({ title: "Comprovante de inscrição em concurso/processo seletivo", headers: ["Campo", "Valor"], rows: [["Edital", `${source.noticeName} · ${source.policy.number}`], ["Inscrição", String(application.number)], ["Candidato", source.fullName], ["CPF declarado", application.cpf], ["Cargo", source.policy.roles.find(role => role.code === application.roleCode)?.name || application.roleCode], ["Recebimento", application.createdAt.toISOString()], ["Aceite", source.acceptedAt], ["Situação", application.status], ["Decisão", application.decision || "Aguardando análise"], ["Referência", application.id], ["Natureza", "Comprova recebimento da inscrição; não comprova aprovação ou classificação no certame."]] }, "PDF");
    await writeAuditEvent(context.database ?? db, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "RECRUITMENT_APPLICATION_RECEIPT", targetId: application.id });
    return new NextResponse(new Uint8Array(file.bytes), { headers: { "Content-Type": file.contentType, "Content-Disposition": "attachment; filename=comprovante-inscricao.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível emitir o comprovante." }, { status: error instanceof AccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } }); }
}
