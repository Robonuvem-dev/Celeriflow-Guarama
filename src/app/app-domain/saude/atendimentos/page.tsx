import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ClipboardList } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import AtendimentosClient from "./AtendimentosClient";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { medicalRecords } from "@/db/schema/health-care";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthProfessionals, healthProfessionalAssignments, healthUnits } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { healthAppointments } from "@/db/schema/health-agenda";

export default async function Page() {
  const context = await getTenantContextForModule("SAUDE");
  const scopedUnitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const database = context.database ?? db;
  const [itemRows, professionalRows] = await Promise.all([
    database.select({ id: medicalRecords.id, date: medicalRecords.date, type: medicalRecords.type, chiefComplaint: medicalRecords.chiefComplaint, completedAt: medicalRecords.completedAt, outcome: medicalRecords.outcome, person: { fullName: people.fullName }, employee: { name: employees.name }, unit: { name: healthUnits.name } }).from(medicalRecords).innerJoin(patients, eq(patients.id, medicalRecords.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, medicalRecords.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).innerJoin(healthUnits, eq(healthUnits.id, medicalRecords.unitId)).where(scopedUnitIds ? inArray(medicalRecords.unitId, scopedUnitIds) : undefined).orderBy(desc(medicalRecords.date), desc(medicalRecords.id)),
    context.user.employeeId
      ? database.select({ id: healthProfessionals.id, unitId: healthProfessionals.unitId, employee: { name: employees.name, isActive: employees.isActive } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.employeeId, context.user.employeeId), eq(healthProfessionals.isActive, true))).limit(1)
      : [],
  ]);
  const items = itemRows.map(({ person, employee, ...row }) => ({ ...row, patient: { person }, professional: { employee } }));
  const currentProfessional = professionalRows[0];
  const professional = currentProfessional?.employee.isActive ? currentProfessional : null;
  const assignments = professional ? await database.select({ unitId: healthProfessionalAssignments.unitId }).from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, professional.id), eq(healthProfessionalAssignments.isActive, true))) : [];
  const professionalUnitIds = professional ? [...new Set([professional.unitId, ...assignments.map(item => item.unitId)].filter((value): value is string => Boolean(value)))] : [];
  const appointmentUnitIds = professionalUnitIds.length ? scopedUnitIds ? professionalUnitIds.filter(id => scopedUnitIds.includes(id)) : professionalUnitIds : scopedUnitIds;
  const appointmentRows = professional
    ? await database.select({ id: healthAppointments.id, date: healthAppointments.date, specialty: healthAppointments.specialty, status: healthAppointments.status, professionalId: healthAppointments.professionalId, medicalRecord: { id: medicalRecords.id }, person: { fullName: people.fullName }, unit: { name: healthUnits.name } }).from(healthAppointments).innerJoin(patients, eq(patients.id, healthAppointments.patientId)).innerJoin(people, eq(people.id, patients.personId)).innerJoin(healthUnits, eq(healthUnits.id, healthAppointments.unitId)).leftJoin(medicalRecords, eq(medicalRecords.appointmentId, healthAppointments.id)).where(and(inArray(healthAppointments.status, ["Aguardando", "Em Atendimento"]), or(eq(healthAppointments.professionalId, professional.id), isNull(healthAppointments.professionalId)), appointmentUnitIds ? inArray(healthAppointments.unitId, appointmentUnitIds) : undefined)).orderBy(asc(healthAppointments.date), asc(healthAppointments.id))
    : [];
  const appointments = appointmentRows.map(({ person, ...row }) => ({ ...row, patient: { person } }));

  return (
    <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      <PageHeader title="Atendimentos e Prontuários" icon={<ClipboardList className="size-4 shrink-0 text-emerald-600" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <AtendimentosClient
        records={items.map(item => ({ ...item, date: item.date.toISOString(), completedAt: item.completedAt?.toISOString() || null }))}
        appointments={appointments.map(appointment => ({ ...appointment, date: appointment.date.toISOString() }))}
        currentProfessional={professional ? { id: professional.id, name: professional.employee.name } : null}
        canRegister={canPerformModuleOperation(context.user, "SAUDE", "update")}
      />
    </PageFrame>
  );
}
