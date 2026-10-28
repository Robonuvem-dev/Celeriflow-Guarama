import { NextResponse } from "next/server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { readObligationExport } from "@/lib/rh/obligation-export";
import { db } from "@/db/client";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  const { id } = await params;
  const file = await readObligationExport(context.database ?? db, id, accessiblePayrollWhere(context.user));
  return new NextResponse(new Uint8Array(file.bytes), { headers: { "Content-Type": file.extension === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="rh-${file.policy.obligation.toLowerCase()}-${file.year}.${file.extension}"`, "Cache-Control": "private, no-store", "X-Content-SHA256": file.fileSha256 } });
}
