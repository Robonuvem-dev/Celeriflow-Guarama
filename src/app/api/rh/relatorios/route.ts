import { NextRequest, NextResponse } from "next/server";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { buildHrReport, hrReportInputSchema, renderHrReport } from "@/lib/rh/report-service";
import { db } from "@/db/client";
import { hrReportCatalog } from "@/lib/rh/report-catalog";
import { personnelDisplayText } from "@/lib/rh/personnel-presentation";
import { canAccessPersonnelClinicalData } from "@/lib/rh/clinical-access";

export async function GET(request: NextRequest) {
  const context = await getTenantContextForModuleOperation("RH", "issueReports");
  const values = Object.fromEntries(request.nextUrl.searchParams);
  const catalogEntry = hrReportCatalog.find(item => item.id === Number(values.report ?? values.poc));
  if (catalogEntry?.kind) values.kind = catalogEntry.kind;
  if (!values.competence) delete values.competence;
  if (!values.referenceDate) delete values.referenceDate;
  if (!values.compareDate) delete values.compareDate;
  if (!values.rubricCodes) delete values.rubricCodes;
  for (const field of ["from", "until", "year", "month", "employeeId", "departmentId", "payrollId", "labelColumns", "labelHeight", "labelMargin", "labelFields", "order", "competenceFrom", "competenceUntil"]) if (!values[field]) delete values[field];
  const input = hrReportInputSchema.parse(values);
  const report = await buildHrReport(context.database ?? db, input, accessiblePayrollWhere(context.user), isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds, { clinicalRead: canAccessPersonnelClinicalData(context.user), user: context.user });
  const output = await renderHrReport(report, input.format);
  return new NextResponse(new Uint8Array(output.bytes), { headers: { "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="rh-${personnelDisplayText(input.kind).toLowerCase()}.${output.extension}"`, "Cache-Control": "private, no-store" } });
}
