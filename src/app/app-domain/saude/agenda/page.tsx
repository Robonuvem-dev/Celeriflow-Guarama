import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthAppointments, healthCareSchedules, healthWaitlists } from "@/db/schema/health-agenda";
import { patients as patientTable } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { employees } from "@/db/schema/administration";
import { healthUnits, healthProfessionals } from "@/db/schema/health-workforce";
import { healthSchedulingGroups, healthSpecialties, healthServices, healthSpecialtyGroups, healthSpecialtyGroupMembers, healthSpecialtyGroupServices, healthUnitSpecialties, healthServiceAssignments } from "@/db/schema/health-administration";
import { Calendar } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import AgendaClient from "./AgendaClient";
import AgendaEngineClient from "./AgendaEngineClient";

type Params = { q?: string | string[] };
const first = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v;

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await getTenantContextForModule("SAUDE");
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const q = ((await searchParams).q ? first((await searchParams).q) : "") || "";
  const term = q.trim().slice(0, 120);
  const birthMatch = /^\d{4}-\d{2}-\d{2}$/.test(term) ? new Date(`${term}T12:00:00`) : null;
  const database = context.database ?? db;
  const appointmentWhere = and(unitIds ? inArray(healthAppointments.unitId, unitIds) : undefined, term ? or(
    sql`strpos(lower(${people.fullName}), lower(${term})) > 0`, sql`strpos(${people.cpf}, ${term}) > 0`, sql`strpos(${patientTable.cns}, ${term}) > 0`, sql`strpos(lower(${people.motherName}), lower(${term})) > 0`, birthMatch && !Number.isNaN(birthMatch.getTime()) ? eq(people.birthDate, birthMatch) : undefined, sql`strpos(lower(${employees.name}), lower(${term})) > 0`, sql`strpos(lower(${healthAppointments.status}), lower(${term})) > 0`) : undefined);
  const [itemRows, patients, units, professionals, schedulingGroups, specialtyRows, serviceRows, specialtyList, scheduleRows, waitlistRows, boardRows] = await Promise.all([
    database.select({ id: healthAppointments.id, date: healthAppointments.date, specialty: healthAppointments.specialty, specialtyRef: { name: healthSpecialties.name }, priority: healthAppointments.priority, status: healthAppointments.status, patientId: patientTable.id, person: { fullName: people.fullName }, unit: { name: healthUnits.name }, employee: { name: employees.name } }).from(healthAppointments).innerJoin(patientTable, eq(patientTable.id, healthAppointments.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).innerJoin(healthUnits, eq(healthUnits.id, healthAppointments.unitId)).leftJoin(healthSpecialties, eq(healthSpecialties.id, healthAppointments.specialtyId)).leftJoin(healthProfessionals, eq(healthProfessionals.id, healthAppointments.professionalId)).leftJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(appointmentWhere).orderBy(desc(healthAppointments.date), desc(healthAppointments.id)).limit(500),
    database.select({ id: patientTable.id, cns: patientTable.cns, person: { fullName: people.fullName } }).from(patientTable).innerJoin(people, eq(people.id, patientTable.personId)).where(eq(patientTable.status, "Ativo")).orderBy(asc(people.fullName)),
    database.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(and(eq(healthUnits.isActive, true), unitIds ? inArray(healthUnits.id, unitIds) : undefined)).orderBy(asc(healthUnits.name)),
    database.select({ id: healthProfessionals.id, unitId: healthProfessionals.unitId, specialty: healthProfessionals.specialty, employee: { name: employees.name, isActive: employees.isActive } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.isActive, true), unitIds ? or(inArray(healthProfessionals.unitId, unitIds), sql`EXISTS (SELECT 1 FROM "HealthProfessionalAssignment" a WHERE a."professionalId"=${healthProfessionals.id} AND a."isActive"=true AND ${inArray(sql`a."unitId"`, unitIds)})`) : undefined)).orderBy(asc(employees.name)),
    database.select({ id: healthSchedulingGroups.id, name: healthSchedulingGroups.name, unitId: healthSchedulingGroups.unitId, specialtyGroupId: healthSchedulingGroups.specialtyGroupId }).from(healthSchedulingGroups).innerJoin(healthUnits, eq(healthUnits.id, healthSchedulingGroups.unitId)).where(and(eq(healthSchedulingGroups.isActive, true), unitIds ? inArray(healthSchedulingGroups.unitId, unitIds) : undefined)).orderBy(asc(healthUnits.name), asc(healthSchedulingGroups.name)),
    database.select({ groupId: healthSpecialtyGroupMembers.groupId, specialty: { id: healthSpecialties.id, name: healthSpecialties.name } }).from(healthSpecialtyGroupMembers).innerJoin(healthSpecialtyGroups, eq(healthSpecialtyGroups.id, healthSpecialtyGroupMembers.groupId)).innerJoin(healthSpecialties, eq(healthSpecialties.id, healthSpecialtyGroupMembers.specialtyId)).where(and(eq(healthSpecialtyGroups.isActive, true), eq(healthSpecialties.isActive, true))).orderBy(asc(healthSpecialties.name)),
    database.select({ groupId: healthSpecialtyGroupServices.groupId, service: { id: healthServices.id, name: healthServices.name } }).from(healthSpecialtyGroupServices).innerJoin(healthSpecialtyGroups, eq(healthSpecialtyGroups.id, healthSpecialtyGroupServices.groupId)).innerJoin(healthServices, eq(healthServices.id, healthSpecialtyGroupServices.serviceId)).where(and(eq(healthSpecialtyGroups.isActive, true), eq(healthServices.isActive, true))).orderBy(asc(healthServices.name)),
    database.select({ id: healthSpecialties.id, name: healthSpecialties.name }).from(healthSpecialties).where(eq(healthSpecialties.isActive, true)).orderBy(asc(healthSpecialties.name)).limit(200),
    database.select({ schedule: healthCareSchedules, unit: { name: healthUnits.name }, specialty: { name: healthSpecialties.name }, employee: { name: employees.name } }).from(healthCareSchedules).innerJoin(healthUnits, eq(healthUnits.id, healthCareSchedules.unitId)).leftJoin(healthSpecialties, eq(healthSpecialties.id, healthCareSchedules.specialtyId)).leftJoin(healthProfessionals, eq(healthProfessionals.id, healthCareSchedules.professionalId)).leftJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(unitIds ? inArray(healthCareSchedules.unitId, unitIds) : undefined).orderBy(asc(healthCareSchedules.date), asc(healthCareSchedules.weekday)).limit(200),
    database.select({ waitlist: healthWaitlists, person: { fullName: people.fullName }, specialty: { name: healthSpecialties.name } }).from(healthWaitlists).innerJoin(patientTable, eq(patientTable.id, healthWaitlists.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).leftJoin(healthCareSchedules, eq(healthCareSchedules.id, healthWaitlists.scheduleId)).leftJoin(healthSpecialties, eq(healthSpecialties.id, healthWaitlists.specialtyId)).where(and(eq(healthWaitlists.status, "Aguardando"), unitIds ? or(inArray(healthCareSchedules.unitId, unitIds), inArray(patientTable.referenceUnitId, unitIds)) : undefined)).orderBy(desc(healthWaitlists.priority), asc(healthWaitlists.createdAt)).limit(200),
    database.select({ id: healthAppointments.id, date: healthAppointments.date, status: healthAppointments.status, calledAt: healthAppointments.calledAt, person: { fullName: people.fullName }, unit: { name: healthUnits.name } }).from(healthAppointments).innerJoin(patientTable, eq(patientTable.id, healthAppointments.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).innerJoin(healthUnits, eq(healthUnits.id, healthAppointments.unitId)).where(and(unitIds ? inArray(healthAppointments.unitId, unitIds) : undefined, inArray(healthAppointments.status, ["Aguardando", "Em Atendimento"]))).orderBy(desc(healthAppointments.calledAt), asc(healthAppointments.date)).limit(30),
  ]);
  const [unitLinks, serviceAssignments, scheduledAppointments] = await Promise.all([
    database.select({ specialtyId: healthUnitSpecialties.specialtyId, unitId: healthUnitSpecialties.unitId }).from(healthUnitSpecialties).where(and(eq(healthUnitSpecialties.isActive, true), inArray(healthUnitSpecialties.specialtyId, specialtyRows.map(row => row.specialty.id)))),
    database.select({ serviceId: healthServiceAssignments.serviceId, unitId: healthServiceAssignments.unitId }).from(healthServiceAssignments).where(and(eq(healthServiceAssignments.isActive, true), inArray(healthServiceAssignments.serviceId, serviceRows.map(row => row.service.id)))),
    database.select({ id: healthAppointments.id, scheduleId: healthAppointments.scheduleId }).from(healthAppointments).where(and(inArray(healthAppointments.scheduleId, scheduleRows.map(row => row.schedule.id)), inArray(healthAppointments.status, ["Agendado", "Confirmado", "Aguardando", "Em Atendimento"]))),
  ]);
  const items = itemRows.map(({ patientId, person, employee, ...row }) => ({ ...row, patient: { id: patientId, person }, professional: employee ? { employee } : null }));
  const specialties = specialtyRows.map(row => ({ ...row, specialty: { ...row.specialty, unitLinks: unitLinks.filter(link => link.specialtyId === row.specialty.id).map(({ unitId }) => ({ unitId })) } })), services = serviceRows.map(row => ({ ...row, service: { ...row.service, assignments: serviceAssignments.filter(assignment => assignment.serviceId === row.service.id).map(({ unitId }) => ({ unitId })) } }));
  const schedules = scheduleRows.map(row => ({ ...row.schedule, unit: row.unit, specialty: row.specialty, professional: row.employee ? { employee: row.employee } : null, appointments: scheduledAppointments.filter(appointment => appointment.scheduleId === row.schedule.id) })), waitlist = waitlistRows.map(row => ({ ...row.waitlist, patient: { person: row.person }, specialty: row.specialty })), board = boardRows.map(({ person, ...row }) => ({ ...row, patient: { person } }));
  const weekdayName = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-1 overflow-hidden">
      <PageHeader title="Agenda e Agendamentos" icon={<Calendar className="size-4 shrink-0 text-emerald-600" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <form method="get" className="flex shrink-0 gap-2 px-1"><input name="q" defaultValue={term} placeholder="Buscar nome, CPF, CNS, nascimento (AAAA-MM-DD), mãe, profissional ou situação" className="h-8 w-full rounded border border-slate-200 px-2 text-xs" /><button className="h-8 rounded bg-slate-800 px-3 text-xs font-semibold text-white">Buscar</button></form>
      <details className="mx-1 shrink-0 rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Painel de chamada ({board.length})</summary><div className="mt-1 max-h-40 overflow-y-auto">{board.map(b => <p key={b.id} className="border-b py-1"><strong>{b.patient.person.fullName}</strong> · {b.unit?.name} · {b.status}{b.calledAt ? ` · chamado às ${b.calledAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>)}{board.length === 0 && <p className="text-slate-400">Ninguém aguardando.</p>}</div></details>
      <AgendaEngineClient
        schedules={schedules.map(s => ({ id: s.id, kind: s.kind, unit: s.unit.name, specialty: s.specialty?.name || null, professional: s.professional?.employee.name || null, when: s.date ? s.date.toLocaleDateString("pt-BR") : s.weekday !== null ? `Toda ${weekdayName[s.weekday || 0]}` : "-", slots: `${s.appointments.length}/${s.totalSlots}`, status: s.status }))}
        waitlist={waitlist.map(w => ({ id: w.id, patient: w.patient.person.fullName, specialty: w.specialty?.name || null, priority: w.priority, status: w.status, createdAt: w.createdAt.toLocaleDateString("pt-BR") }))}
        patients={patients.map(p => ({ id: p.id, label: p.person.fullName }))}
        units={units.map(u => ({ id: u.id, label: u.name }))}
        professionals={professionals.filter(p => p.employee.isActive).map(p => ({ id: p.id, label: p.employee.name }))}
        specialties={specialtyList.map(s => ({ id: s.id, label: s.name }))}
        appointments={items.filter(i => ["Agendado", "Confirmado"].includes(i.status)).map(i => ({ id: i.id, label: `${i.patient.person.fullName} · ${i.date.toLocaleDateString("pt-BR")}` }))}
        canCreate={canPerformModuleOperation(context.user, "SAUDE", "create")}
        canUpdate={canPerformModuleOperation(context.user, "SAUDE", "update")}
      />
      <AgendaClient
        appointments={items.map(item => ({ ...item, date: item.date.toISOString() }))}
        patients={patients}
        units={units}
        professionals={professionals.filter(professional => professional.employee.isActive).map(({ employee, ...professional }) => ({ ...professional, employee: { name: employee.name } }))}
        schedulingGroups={schedulingGroups}
        specialties={specialties}
        services={services}
        canCreate={canPerformModuleOperation(context.user, "SAUDE", "create")}
        canUpdate={canPerformModuleOperation(context.user, "SAUDE", "update")}
      />
    </PageFrame>
  );
}
