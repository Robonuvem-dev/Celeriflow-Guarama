import Link from "next/link";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { patients as patientTable } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthProfessionals, healthUnits } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { TreatmentReportEditor } from "../TreatmentReportEditor";

export default async function NewTreatmentReportPage() {
  const context = await getTenantContextForModule("SAUDE");
  const scope = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const database = context.database ?? db;
  const [patients, units, professionalRows, performers] = await Promise.all([
    database.select({ id: patientTable.id, person: { fullName: people.fullName } }).from(patientTable).innerJoin(people, eq(people.id, patientTable.personId)).where(and(eq(patientTable.status, "Ativo"), scope ? inArray(patientTable.referenceUnitId, scope) : undefined)).orderBy(asc(people.fullName)).limit(500),
    database.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(and(eq(healthUnits.isActive, true), scope ? inArray(healthUnits.id, scope) : undefined)).orderBy(asc(healthUnits.name)),
    database.select({ id: healthProfessionals.id, employee: { name: employees.name } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.employeeId, context.user.employeeId || "__SEM_PROFISSIONAL__"), eq(healthProfessionals.isActive, true), eq(employees.isActive, true))).limit(1),
    database.select({ id: healthProfessionals.id, employee: { name: employees.name } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.isActive, true), eq(employees.isActive, true), scope ? or(inArray(healthProfessionals.unitId, scope), sql`EXISTS (SELECT 1 FROM "HealthProfessionalAssignment" a WHERE a."professionalId"=${healthProfessionals.id} AND a."isActive"=true AND ${inArray(sql`a."unitId"`, scope)})`) : undefined)).orderBy(asc(employees.name)),
  ]);
  const professional = professionalRows[0];
  return <main className="space-y-4 p-4"><Link href="/saude/producao/laudos" className="text-sm underline">Laudos AIH/APAC</Link><h1 className="text-xl font-semibold">Incluir laudo AIH/APAC</h1>{professional ? <TreatmentReportEditor patients={patients.map(patient => ({ id: patient.id, name: patient.person.fullName }))} units={units} professional={{ id: professional.id, name: professional.employee.name }} performers={performers.map(performer => ({ id: performer.id, name: performer.employee.name }))}/> : <p className="rounded border bg-amber-50 p-3 text-sm">Entre com o profissional de Saúde responsável para emitir o laudo clínico.</p>}</main>;
}
