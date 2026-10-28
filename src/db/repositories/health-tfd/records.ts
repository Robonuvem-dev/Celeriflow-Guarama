import { and, asc, eq, getTableColumns, inArray, isNull, not, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import type { PermissionUser } from "@/lib/contracts/identity";
import type { JsonValue } from "../../json";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { healthUnits } from "../../schema/health-workforce";
import * as t from "../../schema/health-tfd";

export function requiredTfdRecord<T>(row: T | null | undefined, message = "Registro TFD não encontrado."): T {
  if (!row) throw new Error(message);
  return row;
}

/** Same JSON serialization boundary as the frozen clinical revisions: dates are
 * ISO strings, omitted object keys stay omitted, nested JSON strings stay text. */
export function tfdSnapshot(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value));
}

// Confirmed exclusions stay in the access universe and immutable history, but
// are excluded from capacity/manifest/boarding. Do not reuse this in access SQL.
export const activeTfdPassengerWhere = sql`not exists (select 1 from ${t.healthTfdPassengerRemovals} where ${t.healthTfdPassengerRemovals.passengerId} = ${t.healthTfdPassengers.id} and ${t.healthTfdPassengerRemovals.status} = 'Confirmada')`;

export function tfdTripAccessWhere(user: PermissionUser): SQL | undefined {
  if (!user.hasHealthAccessScope) return undefined;
  const accessible = inArray(patients.referenceUnitId, user.allowedHealthUnitIds || []);
  const linked = eq(t.healthTfdPassengers.tripId, t.healthTfdTrips.id);
  // NOT accessible must explicitly include SQL NULL to preserve `every`.
  return and(
    sql`not exists (select 1 from ${t.healthTfdPassengers} left join ${patients} on ${patients.id} = ${t.healthTfdPassengers.patientId} where ${linked} and ${or(isNull(patients.referenceUnitId), not(accessible))})`,
    or(eq(t.healthTfdTrips.createdByUsuarioId, user.id), sql`exists (select 1 from ${t.healthTfdPassengers} inner join ${patients} on ${patients.id} = ${t.healthTfdPassengers.patientId} where ${linked} and ${accessible})`),
  );
}

export async function lockTfdTrips(tx: DatabaseTransaction, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
}

export async function readTfdRequest(executor: DatabaseExecutor, id: string) {
  const [record] = await executor.select({ request: getTableColumns(t.healthTfdRequests), patient: getTableColumns(patients), person: getTableColumns(people), originUnit: getTableColumns(healthUnits), clinicalReport: getTableColumns(t.healthTfdClinicalReports) })
    .from(t.healthTfdRequests).innerJoin(patients, eq(patients.id, t.healthTfdRequests.patientId)).innerJoin(people, eq(people.id, patients.personId))
    .leftJoin(healthUnits, eq(healthUnits.id, t.healthTfdRequests.originUnitId)).leftJoin(t.healthTfdClinicalReports, eq(t.healthTfdClinicalReports.requestId, t.healthTfdRequests.id)).where(eq(t.healthTfdRequests.id, id)).limit(1);
  if (!record) return null;
  return { ...record.request, patient: { ...record.patient, person: record.person }, originUnit: record.originUnit, clinicalReport: record.clinicalReport };
}

export async function readTfdTrip(executor: DatabaseExecutor, user: PermissionUser, id: string) {
  return (await executor.select().from(t.healthTfdTrips).where(and(eq(t.healthTfdTrips.id, id), tfdTripAccessWhere(user))).limit(1))[0] ?? null;
}

export async function readTfdBoardingPassengers(executor: DatabaseExecutor, tripId: string) {
  const rows = await executor.select({ passenger: getTableColumns(t.healthTfdPassengers), request: { id: t.healthTfdRequests.id, status: t.healthTfdRequests.status }, report: { id: t.healthTfdClinicalReports.id, companionRequired: t.healthTfdClinicalReports.companionRequired } })
    .from(t.healthTfdPassengers).leftJoin(t.healthTfdRequests, eq(t.healthTfdRequests.id, t.healthTfdPassengers.tfdRequestId)).leftJoin(t.healthTfdClinicalReports, eq(t.healthTfdClinicalReports.requestId, t.healthTfdRequests.id))
    .where(and(eq(t.healthTfdPassengers.tripId, tripId), activeTfdPassengerWhere));
  return rows.map(row => ({ ...row.passenger, tfdRequest: row.request ? { status: row.request.status, clinicalReport: row.report ? { companionRequired: row.report.companionRequired } : null } : null }));
}

export async function readTfdDocumentHistory(executor: DatabaseExecutor, requestId: string, reportId: string, version: number) {
  const revision = requiredTfdRecord((await executor.select().from(t.healthTfdReportRevisions).where(and(eq(t.healthTfdReportRevisions.reportId, reportId), eq(t.healthTfdReportRevisions.version, version))).limit(1))[0]);
  const [supplements, events, benefits] = await Promise.all([
    executor.select().from(t.healthTfdReportSupplements).where(and(eq(t.healthTfdReportSupplements.reportId, reportId), eq(t.healthTfdReportSupplements.reportVersion, version))).orderBy(asc(t.healthTfdReportSupplements.createdAt)),
    executor.select().from(t.healthTfdRequestEvents).where(eq(t.healthTfdRequestEvents.requestId, requestId)).orderBy(asc(t.healthTfdRequestEvents.createdAt)),
    executor.select().from(t.healthTfdBenefits).where(eq(t.healthTfdBenefits.requestId, requestId)).orderBy(asc(t.healthTfdBenefits.createdAt)),
  ]);
  return { revision, supplements, events, benefits };
}
