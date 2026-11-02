import { NextResponse } from "next/server";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { readOwnVerifiedReceipt } from "@/lib/portal-servidor/receipt-verification";
import { recordEmployeePortalActivity, employeePortalRequestMetadata } from "@/lib/portal-servidor/activity-audit";
import { db, databaseConnection } from "@/db/client";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE" || !await arePortalPayrollStatementsEnabled(access.context.database ?? db)) return NextResponse.json({ error: "Indisponível." }, { status: 403 });
  try {
    const id = (await params).id;
    const receipt = await readOwnVerifiedReceipt(databaseConnection, access.employee.id, id);
    await recordEmployeePortalActivity(access.context.database ?? db, { action: "PAYSLIP_PRINT", userId: access.context.user.id, employeeId: access.employee.id, targetId: id, ...employeePortalRequestMetadata(_request) });
    return new NextResponse(receipt.bytes, { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "Content-Disposition": "inline; filename=recibo-pagamento.pdf", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Demonstrativo indisponível." }, { status: 404 }); }
}
