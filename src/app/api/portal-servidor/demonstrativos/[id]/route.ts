import { NextResponse } from "next/server";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { readOwnVerifiedReceipt } from "@/lib/portal-servidor/receipt-verification";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE" || !await arePortalPayrollStatementsEnabled(access.context.prisma)) return NextResponse.json({ error: "Indisponível." }, { status: 403 });
  try {
    const id = (await params).id;
    const receipt = await readOwnVerifiedReceipt(access.context.prisma, access.employee.id, id);
    await writeAuditEvent(access.context.prisma, { actorUsuarioId: access.context.user.id, eventType: auditEventTypes.documentDownload, targetType: "EMPLOYEE_PAYROLL_RECEIPT", targetId: id });
    return new NextResponse(receipt.bytes, { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "Content-Disposition": "inline; filename=recibo-pagamento.pdf", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Demonstrativo indisponível." }, { status: 404 }); }
}
