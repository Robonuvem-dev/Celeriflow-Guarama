import { NextRequest, NextResponse } from "next/server";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { buildHrReport, hrReportInputSchema, renderHrReport } from "@/lib/rh/report-service";

export async function GET(request: NextRequest) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  const values = Object.fromEntries(request.nextUrl.searchParams);
  if (!values.competence) delete values.competence;
  if (!values.referenceDate) delete values.referenceDate;
  const input = hrReportInputSchema.parse(values);
  const report = await buildHrReport(context.prisma, input, accessiblePayrollWhere(context.user));
  const output = await renderHrReport(report, input.format);
  return new NextResponse(new Uint8Array(output.bytes), { headers: { "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="rh-${input.kind.toLowerCase()}.${output.extension}"`, "Cache-Control": "private, no-store" } });
}
