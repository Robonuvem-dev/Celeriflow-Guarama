import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { cemeteryQuerySchema } from "@/lib/cemeteries/query-policy";
import { cemeteryBurialReport } from "@/lib/cemeteries/queries";
import { generateCemeteryBurialPdf } from "@/lib/cemeteries/report-pdf";
import { writeAuditEvent } from "@/lib/platform/audit-evidence";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContextForModuleOperation("CEMITERIOS", "issueReports");
    const query = cemeteryQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const rows = await cemeteryBurialReport(context.prisma, query);
    const funeralName = query.funeralHome ? (await context.prisma.taxFuneralHome.findUnique({ where: { id: query.funeralHome } }))?.name || query.funeralHome : "todas";
    const bytes = await generateCemeteryBurialPdf(rows.map(r => ({ receipt: r.receiptCode, deceased: r.deceased.fullName, deathDate: r.deceased.deathDate.toLocaleDateString("pt-BR", { timeZone: "UTC" }), performedAt: r.performedAt!.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), cemetery: r.cemetery?.name || "Não informado", grave: r.grave?.code || "Não informada", funeralHome: r.funeralHome?.name || "Não informada", status: r.status })), `Sepultamento: ${query.start || "início do histórico"} até ${query.end || "fim do histórico"} | Funerária: ${funeralName}`, new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
    const id = randomUUID();
    await context.prisma.$transaction(async tx => {
      await tx.cemeteryChangeHistory.create({ data: { targetType: "RELATORIO_SEPULTADOS", targetId: id, fieldName: "emissao_pdf", newValue: { filters: query, total: rows.length, hashSha256: createHash("sha256").update(bytes).digest("hex") }, actorUsuarioId: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: "REPORT_ISSUED", targetType: "CEMETERY_REPORT", targetId: id });
    });
    return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=sepultados.pdf", "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Relatório indisponível." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
