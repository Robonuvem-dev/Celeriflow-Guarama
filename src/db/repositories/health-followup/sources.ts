import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { employees } from "../../schema/administration";
import { people } from "../../schema/people";
import { addresses } from "../../schema/registry";
import { neighborhoods } from "../../schema/localities";
import { healthPatientContacts, patients } from "../../schema/health-registration";
import { healthProfessionals, healthUnits } from "../../schema/health-workforce";
import { healthChronicAssessments, healthPregnancies, healthPregnancyVisits, healthPostpartumVisits } from "../../schema/health-care-lines";
import { healthClinicalExamReviews, healthExamRequests, healthPatientConditions, medicalRecords } from "../../schema/health-care";
import { healthAppointments, healthCareSchedules, healthWaitlists, healthWaitlistEvents } from "../../schema/health-agenda";
import { healthRegulationEvents, healthRegulationRequests } from "../../schema/health-regulation";
import { healthSusProcedures } from "../../schema/health-catalogs";
import { followupRow } from "./exchange";

type Range = { gte: Date; lt: Date };
type OriginKey = { originType: string; originId: string };

export async function readFollowupActors(db: DatabaseExecutor, unitId: string, patientIds: string[], professionalIds: string[]) {
  const [unitRows, patientRows, professionalRows, residences, contacts] = await Promise.all([
    db.select({ id: healthUnits.id, name: healthUnits.name, cnes: healthUnits.cnes, isActive: healthUnits.isActive, updatedAt: healthUnits.updatedAt }).from(healthUnits).where(eq(healthUnits.id, unitId)).limit(1),
    db.select({ patient: patients, person: people }).from(patients).innerJoin(people, eq(people.id, patients.personId)).where(inArray(patients.id, patientIds)),
    db.select({ professional: healthProfessionals, employee: { name: employees.name, isActive: employees.isActive, updatedAt: employees.updatedAt } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(inArray(healthProfessionals.id, professionalIds)),
    db.selectDistinctOn([addresses.personId], { address: addresses, neighborhood: { name: neighborhoods.name, city: neighborhoods.city, state: neighborhoods.state } }).from(addresses).innerJoin(patients, eq(patients.personId, addresses.personId)).leftJoin(neighborhoods, eq(neighborhoods.id, addresses.neighborhoodId))
      .where(and(inArray(patients.id, patientIds), eq(addresses.addressType, "Residencial"))).orderBy(addresses.personId, desc(addresses.createdAt), desc(addresses.id)),
    db.selectDistinctOn([healthPatientContacts.patientId]).from(healthPatientContacts).where(and(inArray(healthPatientContacts.patientId, patientIds), eq(healthPatientContacts.isActive, true))).orderBy(healthPatientContacts.patientId, desc(healthPatientContacts.createdAt)),
  ]);
  const byPerson = new Map(residences.map(row => [row.address.personId, { ...row.address, neighborhood: row.neighborhood }]));
  const byPatient = new Map(contacts.map(row => [row.patientId, row]));
  return {
    unit: followupRow(unitRows[0]),
    patients: patientRows.map(({ patient, person }) => {
      const address = byPerson.get(person.id), contact = byPatient.get(patient.id);
      return { ...patient, person: { ...person, addresses: address ? [address] : [] }, contactRecords: contact ? [contact] : [] };
    }),
    professionals: professionalRows.map(row => ({ ...row.professional, employee: row.employee })),
  };
}

export async function listFollowupPregnancies(db: DatabaseExecutor, unitId: string, range: Range, ids?: string[]) {
  const rows = await db.select().from(healthPregnancies).where(and(eq(healthPregnancies.unitId, unitId), ids ? inArray(healthPregnancies.id, ids) : or(
    and(eq(healthPregnancies.status, "ACTIVE"), lt(healthPregnancies.createdAt, range.lt)),
    and(gte(healthPregnancies.createdAt, range.gte), lt(healthPregnancies.createdAt, range.lt)), and(gte(healthPregnancies.updatedAt, range.gte), lt(healthPregnancies.updatedAt, range.lt)),
    sql`EXISTS (SELECT 1 FROM ${healthPregnancyVisits} WHERE ${healthPregnancyVisits.pregnancyId}=${healthPregnancies.id} AND ((${healthPregnancyVisits.occurredAt}>=${range.gte} AND ${healthPregnancyVisits.occurredAt}<${range.lt}) OR (${healthPregnancyVisits.createdAt}>=${range.gte} AND ${healthPregnancyVisits.createdAt}<${range.lt})))`,
    sql`EXISTS (SELECT 1 FROM ${healthPostpartumVisits} WHERE ${healthPostpartumVisits.pregnancyId}=${healthPregnancies.id} AND ((${healthPostpartumVisits.occurredAt}>=${range.gte} AND ${healthPostpartumVisits.occurredAt}<${range.lt}) OR (${healthPostpartumVisits.createdAt}>=${range.gte} AND ${healthPostpartumVisits.createdAt}<${range.lt})))`)))
    .orderBy(healthPregnancies.id).limit(5001);
  const pregnancyIds = rows.map(row => row.id);
  const [visits, postpartum] = await Promise.all([
    db.select().from(healthPregnancyVisits).where(inArray(healthPregnancyVisits.pregnancyId, pregnancyIds)).orderBy(healthPregnancyVisits.occurredAt, healthPregnancyVisits.id),
    db.select().from(healthPostpartumVisits).where(inArray(healthPostpartumVisits.pregnancyId, pregnancyIds)).orderBy(healthPostpartumVisits.occurredAt, healthPostpartumVisits.id),
  ]);
  return rows.map(row => ({ ...row, visits: visits.filter(visit => visit.pregnancyId === row.id), postpartumVisits: postpartum.filter(visit => visit.pregnancyId === row.id) }));
}
export async function readFollowupPregnancyEvidence(db: DatabaseExecutor, recordIds: string[]) {
  const [records, exams, reviews] = await Promise.all([
    db.select({ id: medicalRecords.id, patientId: medicalRecords.patientId, unitId: medicalRecords.unitId, professionalId: medicalRecords.professionalId, date: medicalRecords.date, createdAt: medicalRecords.createdAt, updatedAt: medicalRecords.updatedAt }).from(medicalRecords).where(inArray(medicalRecords.id, recordIds)),
    db.select({ id: healthExamRequests.id, medicalRecordId: healthExamRequests.medicalRecordId, examName: healthExamRequests.examName, status: healthExamRequests.status, createdAt: healthExamRequests.createdAt }).from(healthExamRequests).where(inArray(healthExamRequests.medicalRecordId, recordIds)).orderBy(healthExamRequests.createdAt, healthExamRequests.id),
    db.select().from(healthClinicalExamReviews).where(inArray(healthClinicalExamReviews.medicalRecordId, recordIds)).orderBy(healthClinicalExamReviews.createdAt, healthClinicalExamReviews.id),
  ]);
  return { records, exams, reviews };
}

export async function listFollowupChronicCandidates(db: DatabaseExecutor, unitId: string, range: Range, ids?: string[]) {
  const requestedPatients = ids?.length ? sql`AND source."patientId" IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})` : sql``;
  const assessmentDate = ids ? sql`` : sql`AND a."assessedAt" < ${range.lt}`;
  const conditionDate = ids ? sql`` : sql`AND c."startedAt" < ${range.lt}`;
  const result = await db.execute<{ patientId: string }>(sql`
    SELECT DISTINCT source."patientId" FROM (
      SELECT a."patientId" FROM "HealthChronicAssessment" a JOIN "MedicalRecord" m ON m.id=a."medicalRecordId"
      WHERE m."unitId"=${unitId} AND a."conditionKind" IN ('HYPERTENSION','DIABETES') ${assessmentDate}
      UNION
      SELECT c."patientId" FROM "HealthPatientCondition" c JOIN "MedicalRecord" m ON m.id=c."medicalRecordId"
      WHERE m."unitId"=${unitId} AND c.kind='CHRONIC' AND c."chronicKind" IN ('HYPERTENSION','DIABETES') ${conditionDate}
    ) source WHERE true ${requestedPatients} ORDER BY source."patientId" LIMIT 5001`);
  return result.rows;
}
export async function readFollowupChronicEvidence(db: DatabaseExecutor, unitId: string, patientIds: string[]) {
  const [assessmentRows, conditions] = await Promise.all([
    db.select({ assessment: healthChronicAssessments, recordProfessionalId: medicalRecords.professionalId, recordUpdatedAt: medicalRecords.updatedAt }).from(healthChronicAssessments).innerJoin(medicalRecords, eq(medicalRecords.id, healthChronicAssessments.medicalRecordId))
      .where(and(eq(medicalRecords.unitId, unitId), inArray(healthChronicAssessments.conditionKind, ["HYPERTENSION", "DIABETES"]), inArray(healthChronicAssessments.patientId, patientIds))).orderBy(healthChronicAssessments.assessedAt, healthChronicAssessments.id),
    db.select().from(healthPatientConditions).where(and(inArray(healthPatientConditions.patientId, patientIds), eq(healthPatientConditions.kind, "CHRONIC"))).orderBy(healthPatientConditions.startedAt, healthPatientConditions.id),
  ]);
  const recordIds = [...new Set(conditions.map(condition => condition.medicalRecordId).filter((id): id is string => Boolean(id)))];
  const conditionRecords = await db.select({ id: medicalRecords.id, patientId: medicalRecords.patientId, date: medicalRecords.date, professionalId: medicalRecords.professionalId, updatedAt: medicalRecords.updatedAt }).from(medicalRecords).where(and(inArray(medicalRecords.id, recordIds), eq(medicalRecords.unitId, unitId)));
  return { assessments: assessmentRows.map(row => ({ ...row.assessment, recordProfessionalId: row.recordProfessionalId, recordUpdatedAt: row.recordUpdatedAt })), conditions, conditionRecords };
}

export async function listFollowupRegulationSources(db: DatabaseExecutor, unitId: string, range: Range, keys?: OriginKey[]) {
  const requestRows = await db.select({ request: healthRegulationRequests, procedure: { code: healthSusProcedures.code }, waiting: healthWaitlists, appointment: healthAppointments }).from(healthRegulationRequests)
    .leftJoin(healthSusProcedures, eq(healthSusProcedures.id, healthRegulationRequests.procedureId)).leftJoin(healthWaitlists, eq(healthWaitlists.regulationRequestId, healthRegulationRequests.id)).leftJoin(healthAppointments, eq(healthAppointments.id, healthRegulationRequests.appointmentId))
    .where(and(eq(healthRegulationRequests.requestUnitId, unitId), keys ? inArray(healthRegulationRequests.id, keys.filter(key => key.originType === "REGULATION_REQUEST").map(key => key.originId)) : or(
      and(gte(healthRegulationRequests.createdAt, range.gte), lt(healthRegulationRequests.createdAt, range.lt)), and(gte(healthRegulationRequests.updatedAt, range.gte), lt(healthRegulationRequests.updatedAt, range.lt)),
      and(gte(healthWaitlists.updatedAt, range.gte), lt(healthWaitlists.updatedAt, range.lt)),
      sql`EXISTS (SELECT 1 FROM ${healthRegulationEvents} WHERE ${healthRegulationEvents.requestId}=${healthRegulationRequests.id} AND ${healthRegulationEvents.createdAt}>=${range.gte} AND ${healthRegulationEvents.createdAt}<${range.lt})`)))
    .orderBy(healthRegulationRequests.id).limit(5001);
  const waitingRows = await db.select({ entry: healthWaitlists, schedule: { professionalId: healthCareSchedules.professionalId }, appointment: healthAppointments, record: { date: medicalRecords.date, completedAt: medicalRecords.completedAt } }).from(healthWaitlists)
    .leftJoin(healthCareSchedules, eq(healthCareSchedules.id, healthWaitlists.scheduleId)).leftJoin(healthAppointments, eq(healthAppointments.id, healthWaitlists.appointmentId)).leftJoin(medicalRecords, eq(medicalRecords.appointmentId, healthAppointments.id))
    .where(and(eq(healthWaitlists.unitId, unitId), isNull(healthWaitlists.regulationRequestId), keys ? inArray(healthWaitlists.id, keys.filter(key => key.originType === "WAITLIST_ENTRY").map(key => key.originId)) : or(
      and(gte(healthWaitlists.createdAt, range.gte), lt(healthWaitlists.createdAt, range.lt)), and(gte(healthWaitlists.updatedAt, range.gte), lt(healthWaitlists.updatedAt, range.lt)),
      sql`EXISTS (SELECT 1 FROM ${healthWaitlistEvents} WHERE ${healthWaitlistEvents.waitlistId}=${healthWaitlists.id} AND ${healthWaitlistEvents.createdAt}>=${range.gte} AND ${healthWaitlistEvents.createdAt}<${range.lt})`)))
    .orderBy(healthWaitlists.id).limit(5001);
  const requestIds = requestRows.map(row => row.request.id), waitingIds = [...requestRows.flatMap(row => row.waiting ? [row.waiting.id] : []), ...waitingRows.map(row => row.entry.id)];
  const [requestEvents, waitingEvents, procedures] = await Promise.all([
    db.select().from(healthRegulationEvents).where(inArray(healthRegulationEvents.requestId, requestIds)).orderBy(healthRegulationEvents.createdAt, healthRegulationEvents.id),
    db.select().from(healthWaitlistEvents).where(inArray(healthWaitlistEvents.waitlistId, waitingIds)).orderBy(healthWaitlistEvents.createdAt, healthWaitlistEvents.id),
    db.select({ id: healthSusProcedures.id, code: healthSusProcedures.code }).from(healthSusProcedures).where(inArray(healthSusProcedures.id, waitingRows.map(row => row.entry.procedureId).filter((id): id is string => Boolean(id)))),
  ]);
  return {
    requests: requestRows.map(row => ({ ...row.request, procedure: row.procedure, appointment: row.appointment, events: requestEvents.filter(event => event.requestId === row.request.id), waitlistEntry: row.waiting ? { ...row.waiting, events: waitingEvents.filter(event => event.waitlistId === row.waiting!.id) } : null })),
    waiting: waitingRows.map(row => ({ ...row.entry, schedule: row.schedule, appointment: row.appointment ? { ...row.appointment, medicalRecord: row.record } : null, events: waitingEvents.filter(event => event.waitlistId === row.entry.id) })),
    procedures,
  };
}
