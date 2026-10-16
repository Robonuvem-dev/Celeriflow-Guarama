import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxAssessmentAccessFilter, taxScopeSnapshot } from "@/lib/tributacao/scope";
import ScheduledGuidesClient from "./ScheduledGuidesClient";
import { fiscalPaymentOptionsSchema } from "@/lib/tributacao/fiscal-payment-option-schema";

export const dynamic = "force-dynamic";
export default async function ScheduledGuidesPage() {
  const { prisma, user } = await getTenantContextForModule("TRIBUTACAO");
  const rows = await prisma.taxAssessment.findMany({ where: { ...taxAssessmentAccessFilter(isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds), status: { notIn: ["Cancelado", "Pago", "Extinto", "Suspenso", "Dívida Ativa"] } }, include: { tax: { select: { name: true } }, taxpayer: { select: { person: { select: { fullName: true } }, company: { select: { corporateName: true } } } }, guides: { where: { status: { not: "Cancelada" } }, select: { id: true } } }, orderBy: [{ year: "desc" }, { createdAt: "desc" }] });
  return <ScheduledGuidesClient assessments={rows.map(row => { const snapshot = taxScopeSnapshot(row.calculationSnapshot); return { id: row.id, label: `${row.year} · ${row.tax.name} · ${row.assessmentNumber} · ${row.taxpayer.company?.corporateName ?? row.taxpayer.person?.fullName ?? row.taxpayerId}`, updatedAt: row.updatedAt.toISOString(), amount: row.finalValueDecimal?.toFixed(2) ?? "", activeGuides: row.guides.length, paymentOptions: fiscalPaymentOptionsSchema.parse(snapshot.paymentOptions ?? []), schedule: Array.isArray(snapshot.schedule) ? snapshot.schedule.map(item => { const data = taxScopeSnapshot(item); return { number: Number(data.number), amount: String(data.amount), dueDate: String(data.dueDate ?? "") }; }) : [] }; })}/>;
}
