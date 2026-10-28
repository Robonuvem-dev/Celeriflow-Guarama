import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { vaccinationRecords as records, vaccines as vaccineTable } from "@/db/schema/health-vaccination";
import { patients as patientTable } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { employees } from "@/db/schema/administration";
import { healthProfessionals, healthUnits } from "@/db/schema/health-workforce";
import { pharmacyPatients } from "@/db/repositories/health-pharmacy-pages/common";
import { Syringe } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { HealthSimpleListClient } from "../HealthSimpleListClient";
import { exportVaccinationAction } from "./actions";
import { VaccineApplicationForm } from "./VaccineApplicationForm";
import { vaccinationFormOptions } from "@/lib/saude/vaccination-form-options";

const field = "h-8 min-w-0 rounded border border-slate-200 bg-white px-2 text-xs";
const PAGE_SIZE = 20;
type Params = { q?: string | string[]; filter?: string | string[]; page?: string | string[]; patientId?: string | string[]; appointmentId?: string | string[]; medicalRecordId?: string | string[] };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const positivePage = (value: string | undefined) => value && /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : 1;

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const context = await getTenantContextForModule("SAUDE");
  const db = context.database;
  const unitIds = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const params = await searchParams;
  if (first(params.patientId)) {
    const query = new URLSearchParams();
    if (first(params.appointmentId)) query.set("appointmentId", first(params.appointmentId)!);
    if (first(params.medicalRecordId)) query.set("medicalRecordId", first(params.medicalRecordId)!);
    redirect(`/saude/vacinacao/carteira/${encodeURIComponent(first(params.patientId)!)}?${query}`);
  }
  const q = (first(params.q) || "").trim().slice(0, 120);
  const filter = (first(params.filter) || "").trim().slice(0, 120);
  const professionalPerson = alias(people, "vaccination_professional_person");
  const scope = unitIds ? inArray(records.unitId, unitIds) : undefined;
  const itemWhere = and(scope, filter ? eq(vaccineTable.name, filter) : undefined, q ? or(ilike(people.fullName, `%${q}%`), ilike(vaccineTable.name, `%${q}%`), ilike(professionalPerson.fullName, `%${q}%`), ilike(records.lotNumber, `%${q}%`)) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(records).innerJoin(patientTable, eq(patientTable.id, records.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).innerJoin(vaccineTable, eq(vaccineTable.id, records.vaccineId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, records.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).leftJoin(professionalPerson, eq(professionalPerson.id, employees.personId)).where(itemWhere);
  const page = Math.min(positivePage(first(params.page)), Math.max(1, Math.ceil(total / PAGE_SIZE)));
  const [itemRows, exportRows, vaccines, patients, applicationOptions] = await Promise.all([
    db.select({ record: records, patient: patientTable, person: people, vaccine: vaccineTable, professional: healthProfessionals, employee: employees, professionalPerson, unit: healthUnits }).from(records).innerJoin(patientTable, eq(patientTable.id, records.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).innerJoin(vaccineTable, eq(vaccineTable.id, records.vaccineId)).innerJoin(healthProfessionals, eq(healthProfessionals.id, records.professionalId)).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).leftJoin(professionalPerson, eq(professionalPerson.id, employees.personId)).innerJoin(healthUnits, eq(healthUnits.id, records.unitId)).where(itemWhere).orderBy(desc(records.createdAt)).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE),
    db.select({ record: records, patient: patientTable, person: people, vaccine: vaccineTable }).from(records).innerJoin(patientTable, eq(patientTable.id, records.patientId)).innerJoin(people, eq(people.id, patientTable.personId)).innerJoin(vaccineTable, eq(vaccineTable.id, records.vaccineId)).where(scope).orderBy(desc(records.createdAt)).limit(500),
    db.select().from(vaccineTable).where(and(eq(vaccineTable.isActive, true), isNotNull(vaccineTable.materialId))).orderBy(asc(vaccineTable.name)),
    pharmacyPatients(db, unitIds, undefined, 500),
    vaccinationFormOptions(context),
  ]);
  const items = itemRows.map(row => ({ ...row.record, patient: { ...row.patient, person: row.person }, vaccine: row.vaccine, professional: { ...row.professional, employee: { ...row.employee, person: row.professionalPerson } }, unit: row.unit }));
  const exportItems = exportRows.map(row => ({ ...row.record, patient: { ...row.patient, person: row.person }, vaccine: row.vaccine }));

  return (
    <PageFrame className="flex h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-2 overflow-hidden px-1 py-1 md:px-2">
      <PageHeader title="Vacinação Básica" icon={<Syringe className="size-4 shrink-0 text-emerald-600" />} className="dark:border-gray-700 dark:bg-gray-800 dark:[&>h1]:text-white" />
      <nav className="flex shrink-0 flex-wrap gap-3 text-xs"><Link href="/saude/vacinacao/carteiras" className="rounded border bg-white p-2 font-semibold underline">Carteiras e busca ativa</Link><Link href="/saude/vacinacao/gestao" className="rounded border bg-white p-2 font-semibold underline">Imunobiológicos, calendário, diluentes e estoque</Link><Link href="/saude/vacinacao/esavi" className="rounded border bg-white p-2 font-semibold underline">ESAVI e condutas</Link></nav>
      <div className="grid shrink-0 gap-2 lg:grid-cols-[2fr_1fr_1fr]">
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Registrar aplicação</summary><VaccineApplicationForm options={applicationOptions} patients={patients.map(patient => ({ id: patient.id, name: patient.person.fullName }))} idempotencyKey={randomUUID()} /></details>
        <div className="rounded border bg-white p-2 text-xs"><h2 className="font-semibold">Frascos e perdas</h2><Link href="/saude/vacinacao/gestao" className="mt-2 block underline">Abrir/preparar frasco, registrar perda de doses e conciliar saldos</Link></div>
        <details className="rounded border bg-white p-2 text-xs"><summary className="cursor-pointer font-semibold">Enviar ficha e-SUS</summary><form action={exportVaccinationAction} className="mt-2 grid gap-1"><select name="recordId" required className={field}><option value="">Ficha</option>{exportItems.map(x => <option key={x.id} value={x.id}>{x.patient.person.fullName} · {x.vaccine.name} · {x.date.toLocaleDateString("pt-BR")}</option>)}</select><p className="text-[10px] text-slate-500">Exige conexão ativa e endpoint controlado.</p><button className="h-8 rounded bg-slate-800 px-2 font-semibold text-white">Enviar</button></form></details>
      </div>
      <HealthSimpleListClient rows={items.map((item) => ({ id: item.id, cells: { date: item.date.toLocaleString("pt-BR"), patient: item.patient.person.fullName, vaccine: item.vaccine.name, professional: item.professional.employee.person?.fullName || "-", unit: item.unit.name, dose: String(item.doseNumber), lot: item.lotNumber || "-", strategy: item.strategy || "-" } }))} columns={[{ key: "date", label: "Data", width: "medium" }, { key: "patient", label: "Paciente" }, { key: "vaccine", label: "Vacina", responsive: "sm" }, { key: "professional", label: "Profissional", responsive: "md" }, { key: "unit", label: "Unidade", responsive: "lg" }, { key: "dose", label: "Dose", align: "center", width: "narrow" }, { key: "lot", label: "Lote", responsive: "md", width: "medium" }]} label="aplicações" searchPlaceholder="Buscar paciente, vacina, profissional ou lote" filterKey="vaccine" filterLabel="Todas as vacinas" serverPagination={{ page, total, pathname: "/app-domain/saude/vacinacao", search: q, filter, filterOptions: vaccines.map(x => x.name) }} />
    </PageFrame>
  );
}
