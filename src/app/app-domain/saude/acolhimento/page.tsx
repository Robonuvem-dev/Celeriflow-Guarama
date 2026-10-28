import { HeartPulse } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import AcolhimentoClient from "./AcolhimentoClient";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { healthAppointments, healthTriages } from "@/db/schema/health-agenda";
import { patients as patientTable } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthUnits, healthProfessionals } from "@/db/schema/health-workforce";

export default async function Page() {
  const context = await getTenantContextForModule("SAUDE");
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const database = context.database ?? db;
  const [appointmentRows, patients, units, professionalRows] = await Promise.all([
    database.select({ id: healthAppointments.id, date: healthAppointments.date, origin: healthAppointments.origin, status: healthAppointments.status, priority: healthAppointments.priority, arrivedAt: healthAppointments.arrivedAt, calledAt: healthAppointments.calledAt, person: { fullName: people.fullName }, unit: { name: healthUnits.name }, triage: { riskClassification: healthTriages.riskClassification, chiefComplaint: healthTriages.chiefComplaint } }).from(healthAppointments).innerJoin(patientTable, eq(patientTable.id, healthAppointments.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).innerJoin(healthUnits, eq(healthUnits.id, healthAppointments.unitId)).leftJoin(healthTriages, eq(healthTriages.appointmentId, healthAppointments.id)).where(and(eq(healthAppointments.status, "Aguardando"), unitIds ? inArray(healthAppointments.unitId, unitIds) : undefined)).orderBy(asc(healthAppointments.arrivedAt), asc(healthAppointments.date)).limit(200),
    database.select({ id: patientTable.id, cns: patientTable.cns, person: { fullName: people.fullName } }).from(patientTable).innerJoin(people, eq(people.id, patientTable.personId)).where(eq(patientTable.status, "Ativo")).orderBy(asc(people.fullName)),
    database.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(and(eq(healthUnits.isActive, true), unitIds ? inArray(healthUnits.id, unitIds) : undefined)).orderBy(asc(healthUnits.name)),
    context.user.employeeId ? database.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.employeeId, context.user.employeeId), eq(healthProfessionals.isActive, true))).limit(1) : [],
  ]);
  const appointments = appointmentRows.map(({ person, ...row }) => ({ ...row, patient: { person } })), professional = professionalRows[0];
  return <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden"><PageHeader title="Acolhimento e Fila Assistencial" icon={<HeartPulse className="size-4 text-rose-600" />} /><AcolhimentoClient appointments={appointments.map(item => ({ ...item, date: item.date.toISOString(), arrivedAt: item.arrivedAt?.toISOString() || null, calledAt: item.calledAt?.toISOString() || null }))} patients={patients} units={units} canCreate={canPerformModuleOperation(context.user, "SAUDE", "create")} canUpdate={canPerformModuleOperation(context.user, "SAUDE", "update")} hasProfessional={Boolean(professional)} /></PageFrame>;
}
