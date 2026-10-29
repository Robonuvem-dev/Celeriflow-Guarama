import Link from "next/link";
import { db as defaultDatabase } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { healthTfdRequests, healthTfdClinicalReports } from "@/db/schema/health-tfd";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthUnits, healthProfessionals } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { healthSusProcedures } from "@/db/schema/health-catalogs";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { healthColumn } from "../../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

export default async function TfdReportsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const context = await getTenantContextForModule("SAUDE"), params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const status = typeof params.status === "string" ? params.status.slice(0, 30) : "";
  const db = context.database ?? defaultDatabase, unitsScope = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const scope = unitsScope ? inArray(healthTfdRequests.originUnitId, unitsScope) : undefined;
  const where = and(scope, status ? eq(healthTfdRequests.status, status) : undefined, q ? or(ilike(healthTfdRequests.destination, `%${q}%`), ilike(people.fullName, `%${q}%`)) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(healthTfdRequests).innerJoin(patients, eq(patients.id, healthTfdRequests.patientId)).innerJoin(people, eq(people.id, patients.personId)).where(where);
  const page = Math.min(Math.max(1, Math.floor(Number(params.page)) || 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const requestRows = await db.select({ request: healthTfdRequests, patient: patients, person: { fullName: people.fullName }, originUnit: healthUnits, clinicalReport: { version: healthTfdClinicalReports.version, diagnosis: healthTfdClinicalReports.diagnosis } }).from(healthTfdRequests).innerJoin(patients, eq(patients.id, healthTfdRequests.patientId)).innerJoin(people, eq(people.id, patients.personId)).leftJoin(healthUnits, eq(healthUnits.id, healthTfdRequests.originUnitId)).leftJoin(healthTfdClinicalReports, eq(healthTfdClinicalReports.requestId, healthTfdRequests.id)).where(where).orderBy(desc(healthTfdRequests.createdAt)).offset((page - 1) * OPERATIONAL_PAGE_SIZE).limit(OPERATIONAL_PAGE_SIZE);
  const requests = requestRows.map(row => ({ ...row.request, patient: { ...row.patient, person: row.person }, originUnit: row.originUnit, clinicalReport: row.clinicalReport }));
  const [units, professionals, procedures] = await Promise.all([
    db.select({ id: healthUnits.id, name: healthUnits.name }).from(healthUnits).where(unitsScope ? inArray(healthUnits.id, unitsScope) : undefined).orderBy(asc(healthUnits.name)),
    db.select({ id: healthProfessionals.id, employee: { name: employees.name } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(sql`EXISTS (SELECT 1 FROM ${healthTfdClinicalReports} JOIN ${healthTfdRequests} ON ${healthTfdRequests.id}=${healthTfdClinicalReports.requestId} WHERE ${healthTfdClinicalReports.professionalId}=${healthProfessionals.id} AND ${scope ?? sql`true`})`).orderBy(asc(employees.name)),
    db.select({ id: healthSusProcedures.id, code: healthSusProcedures.code, description: healthSusProcedures.description }).from(healthSusProcedures).where(sql`EXISTS (SELECT 1 FROM ${healthTfdClinicalReports} JOIN ${healthTfdRequests} ON ${healthTfdRequests.id}=${healthTfdClinicalReports.requestId} WHERE ${healthTfdClinicalReports.procedureId}=${healthSusProcedures.id} AND ${scope ?? sql`true`})`).orderBy(asc(healthSusProcedures.code)),
  ]);
  return <OperationalListFrame label="Laudos TFD" toolbar={<form className={styles.searchForm}><input aria-label="Paciente ou destino" name="q" defaultValue={q} placeholder="Paciente ou destino" className={styles.searchInput}/><select aria-label="Situação" name="status" defaultValue={status}><option value="">Todas as situações</option>{["SOLICITADA", "APROVADA", "AUTORIZADA", "GLOSADA", "ALTERACAO", "NEGADA", "CANCELADA", "ARQUIVADA"].map(value => <option key={value}>{value}</option>)}</select><button className={styles.filterButton}>Filtrar</button></form>} actions={<><Link href="/saude/tfd">Transporte TFD</Link><OperationalFilters label="Emitir relatório">
    <details className="rounded border bg-white p-3"><summary className="cursor-pointer font-semibold">Emitir relatório de processos TFD</summary><form action="/api/saude/tfd/relatorio" target="_blank" className="mt-3 grid gap-2 text-sm md:grid-cols-3"><label>Unidade solicitante<select name="unitId" className="w-full rounded border p-2"><option value="">Todas as unidades autorizadas</option>{units.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label><label>Destino<input name="destination" className="w-full rounded border p-2"/></label><label>Profissional<select name="professionalId" className="w-full rounded border p-2"><option value="">Todos</option>{professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.employee.name}</option>)}</select></label><label>Procedimento<select name="procedureId" className="w-full rounded border p-2"><option value="">Todos</option>{procedures.map(procedure => <option key={procedure.id} value={procedure.id}>{procedure.code} · {procedure.description}</option>)}</select></label><label>De<input name="from" type="date" className="w-full rounded border p-2"/></label><label>Até<input name="to" type="date" className="w-full rounded border p-2"/></label><button className="rounded border p-2 md:col-span-3">Baixar relatório CSV</button></form></details>
  </OperationalFilters></>} pagination={<OperationalLinkPagination page={page} total={total} values={{ q, status }} />}>
    <OperationalTable preferenceId="saude-tfd-laudos" caption="Laudos, trâmites e benefícios TFD" columns={[healthColumn("patient", "Paciente", 240, 120), healthColumn("unit", "Unidade", 180, 100), healthColumn("destination", "Destino", 200, 110), healthColumn("version", "Versão laudo", 120, 95), healthColumn("diagnosis", "Diagnóstico", 240, 110), healthColumn("status", "Situação", 140, 100, "status"), healthColumn("actions", "Processo", 110, 105, "actions", "right", 130)]} rows={requests.map(request => ({ id: request.id, label: request.patient.person.fullName, values: { patient: request.patient.person.fullName, unit: request.originUnit?.name || "Não informada", destination: request.destination, version: request.clinicalReport ? String(request.clinicalReport.version) : "A incluir", diagnosis: request.clinicalReport?.diagnosis || "—", status: request.status }, actions: <Link href={`/saude/tfd/laudos/${encodeURIComponent(request.id)}`}>Abrir processo</Link> }))} />
  </OperationalListFrame>;
}
