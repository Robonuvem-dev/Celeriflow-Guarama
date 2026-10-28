import { BarChart3 } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { HealthReportsClient } from "./HealthReportsClient";
import { db } from "@/db/client";
import { healthReportPageOptions } from "@/db/repositories/health-pages/catalogs";

export default async function HealthReportsPage() {
  const context = await getTenantContextForModule("SAUDE");
  const unitScope = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const { units, specialties, professionals, teams, financingRows, municipalities, covenantStatuses, appointmentStatuses } = await healthReportPageOptions(context.database ?? db, unitScope);
  return <PageFrame className="flex h-full min-h-0 max-w-none flex-1 flex-col gap-2 overflow-hidden"><PageHeader title="Relatórios Administrativos" icon={<BarChart3 className="size-4 shrink-0 text-emerald-700" />} className="mb-0 shrink-0" /><HealthReportsClient canIssue={canPerformModuleOperation(context.user, "SAUDE", "issueReports")} options={{ units, specialties, professionals: professionals.map(item => ({ id: item.id, name: item.employee.name })), teams: teams.map(item => ({ id: item.id, name: `${item.name} · ${item.unit.name}` })), financing: financingRows.flatMap(item => item.financing ? [item.financing] : []), municipalities: municipalities.map(item => ({ value: item.city, label: `${item.city}/${item.state}` })), covenantStatuses: covenantStatuses.map(item => item.status), appointmentStatuses: appointmentStatuses.map(item => item.status) }} /></PageFrame>;
}
