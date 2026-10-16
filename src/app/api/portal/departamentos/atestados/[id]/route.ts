import { NextRequest, NextResponse } from "next/server";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { readDepartmentCertificateReceipt } from "@/lib/portal-servidor/department-certificates";
import { renderHrReport } from "@/lib/rh/report-service";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModuleOperation("SST", "create"), row = await readDepartmentCertificateReceipt(context, (await params).id);
    const file = await renderHrReport({ title: "Comprovante de recebimento departamental de atestado", headers: ["Campo", "Valor"], rows: [["Protocolo", row.protocolNumber], ["Servidor", row.employee.name], ["Matrícula", row.employee.registration || ""], ["Apresentação", row.presentedAt.toISOString()], ["Período", `${row.startsAt.toISOString()} a ${row.endsAt.toISOString()}`], ["Situação", row.status], ["Natureza", "Recebimento para análise SST; comprovante não contém diagnóstico ou parecer clínico."]] }, "PDF");
    return new NextResponse(new Uint8Array(file.bytes), { headers: { "Content-Type": file.contentType, "Content-Disposition": "attachment; filename=comprovante-atestado.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível emitir o comprovante." }, { status: error instanceof AccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } }); }
}
