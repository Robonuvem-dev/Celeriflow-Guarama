import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { db } from "@/db/client";
import { listPageAssessments } from "@/db/repositories/taxation-pages/assessments";
import ScheduledGuidesClient from "./ScheduledGuidesClient";
import { fiscalPaymentOptionsSchema } from "@/lib/tributacao/fiscal-payment-option-schema";

export const dynamic = "force-dynamic";
export default async function ScheduledGuidesPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context;
  const rows = await listPageAssessments(context.database ?? db, { allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds, calendar: true });
  return <ScheduledGuidesClient assessments={rows.map(row => { const snapshot = taxScopeSnapshot(row.calculationSnapshot); return { id: row.id, label: `${row.year} · ${row.tax.name} · ${row.assessmentNumber} · ${row.taxpayer.company?.corporateName ?? row.taxpayer.person?.fullName ?? row.taxpayerId}`, updatedAt: row.updatedAt.toISOString(), amount: row.finalValueDecimal?.toFixed(2) ?? "", activeGuides: row.guides.length, paymentOptions: fiscalPaymentOptionsSchema.parse(snapshot.paymentOptions ?? []), schedule: Array.isArray(snapshot.schedule) ? snapshot.schedule.map(item => { const data = taxScopeSnapshot(item); return { number: Number(data.number), amount: String(data.amount), dueDate: String(data.dueDate ?? "") }; }) : [] }; })}/>;
}
