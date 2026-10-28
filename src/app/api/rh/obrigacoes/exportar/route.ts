import { NextRequest, NextResponse } from "next/server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { generateObligationExport } from "@/lib/rh/obligation-export";
import { databaseConnection } from "@/db/client";

export async function POST(request: NextRequest) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  const values = Object.fromEntries(await request.formData());
  try {
    const output = await generateObligationExport(databaseConnection, context.user.id, values, accessiblePayrollWhere(context.user));
    return new NextResponse(new Uint8Array(output.bytes), { headers: { "Content-Type": output.extension === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="rh-${output.policy.obligation.toLowerCase()}-${values.year}.${output.extension}"`, "Cache-Control": "private, no-store", "X-Content-SHA256": output.fileSha256, "X-RH-Export-Event": output.eventId, "X-RH-Official-Layout": "false" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível gerar o arquivo." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
