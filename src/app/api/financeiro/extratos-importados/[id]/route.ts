import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { AccessError, getTenantContextForModule, getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { renderBankStatementPdf } from "@/lib/financeiro/statement-print";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return await downloadStatement(request, await params); }
  catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Não foi possível emitir o extrato importado." }, { status: 500 });
  }
}

async function downloadStatement(request: Request, { id }: { id: string }) {
  const format = new URL(request.url).searchParams.get("format");
  if (format && format !== "PDF") return NextResponse.json({ error: "Formato inválido." }, { status: 400 });
  const context = format === "PDF" ? await getTenantContextForModuleOperation("FINANCEIRO", "issueReports") : await getTenantContextForModule("FINANCEIRO");
  const record = await context.prisma.bankStatementImport.findFirst({ where: { id, ...(isSystemAdministrator(context.user) ? {} : { bankAccount: { budgetUnitId: { in: context.user.allowedBudgetUnitIds } } }) }, include: { bankAccount: { select: { bankName: true, agency: true, accountNumber: true } }, items: { orderBy: [{ date: "asc" }, { id: "asc" }] } } });
  if (!record) return NextResponse.json({ error: "Extrato indisponível." }, { status: 404 });
  if (record.originalBytes && createHash("sha256").update(record.originalBytes).digest("hex") !== record.checksum) return NextResponse.json({ error: "A integridade do arquivo não confere." }, { status: 409 });
  if (format === "PDF") {
    const bytes = await renderBankStatementPdf(record, record.bankAccount, record.items);
    await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.financialReportExport, targetType: "BANK_STATEMENT_IMPORT", targetId: record.id });
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="extrato-importado.pdf"', "Cache-Control": "private, no-store" } });
  }
  if (!record.originalBytes) return NextResponse.json({ error: "O original deste lote legado não foi preservado." }, { status: 409 });
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.documentDownload, targetType: "BANK_STATEMENT_IMPORT", targetId: record.id });
  const name = (record.fileName || `extrato-${record.id}.${record.format.toLowerCase()}`).replace(/[\r\n"\\/]/g, "_");
  return new NextResponse(new Uint8Array(record.originalBytes), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "private, no-store", "X-Content-SHA256": record.checksum } });
}
