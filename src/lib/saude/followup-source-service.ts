import { db } from "@/db/client";
import type { DatabaseExecutor } from "@/db/transaction";
import { listFollowupChronicCandidates, listFollowupPregnancies, listFollowupRegulationSources, readFollowupActors, readFollowupChronicEvidence, readFollowupPregnancyEvidence } from "@/db/repositories/health-followup/sources";
import type { HealthFollowupContext } from "@/lib/contracts/health-followup";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { followupRecordKey, followupRecordVersion, type FollowupContractName } from "./followup-contract";

export type FollowupSourceRecord = Record<string, unknown> & { originType: string; originId: string; unitId: string; patientId: string; professionalId: string | null; sourceVersion: string; idempotencyKey: string };
type OriginKey = { originType: string; originId: string };
type Seed = { originType: string; originId: string; patientId: string; professionalId: string | null; occurredAt: Date; stamps: (Date | null | undefined)[]; data: unknown };
const iso = (date: Date | null | undefined) => date ? date.toISOString() : null;
function latestStamp(dates: (Date | null | undefined)[]) {
  const valid = dates.filter((date): date is Date => Boolean(date) && Number.isFinite(date!.valueOf()));
  return valid.length ? new Date(Math.max(...valid.map(date => date.valueOf()))).toISOString() : null;
}
function checkCount(count: number) { if (count > 5000) throw new Error("O recorte ultrapassa 5.000 origens. Restrinja as datas para gerar todas as remessas desse recorte."); }

async function actors(executor: DatabaseExecutor, unitId: string, seeds: Seed[]) {
  const { unit, patients, professionals } = await readFollowupActors(executor, unitId, [...new Set(seeds.map(seed => seed.patientId))], [...new Set(seeds.map(seed => seed.professionalId).filter((id): id is string => Boolean(id)))]);
  return {
    unit: { id: unit.id, name: unit.name, cnes: unit.cnes, isActive: unit.isActive }, unitUpdatedAt: unit.updatedAt,
    patients: new Map(patients.map(patient => {
      const address = patient.person.addresses[0];
      const addressText = address ? [address.streetName, address.number, address.complement, address.neighborhood?.name, address.neighborhood?.city, address.neighborhood?.state, address.zipCode].filter(Boolean).join(" · ") : null;
      return [patient.id, { data: { id: patient.id, personId: patient.personId, name: patient.person.fullName, status: patient.status, birthDate: iso(patient.person.birthDate), deathDate: iso(patient.person.deathDate), gender: patient.person.gender, cpf: patient.person.cpf, cns: patient.cns, phone: patient.person.phonePrimary || patient.person.whatsapp || patient.person.phoneSecondary || patient.contactRecords[0]?.phone || null, address: addressText }, stamps: [patient.updatedAt, patient.person.updatedAt, address?.createdAt, patient.contactRecords[0]?.createdAt] }] as const;
    })),
    professionals: new Map(professionals.map(professional => [professional.id, { data: { id: professional.id, employeeId: professional.employeeId, name: professional.employee.name, cns: professional.cns, cbo: professional.cbo, isActive: professional.isActive && professional.employee.isActive }, stamps: [professional.updatedAt, professional.employee.updatedAt] }])),
  };
}

async function pregnancySeeds(executor: DatabaseExecutor, unitId: string, range: { gte: Date; lt: Date }, ids?: string[]): Promise<Seed[]> {
  const pregnancies = await listFollowupPregnancies(executor, unitId, range, ids);
  checkCount(pregnancies.length);
  const recordIds = [...new Set(pregnancies.flatMap(pregnancy => [pregnancy.openedMedicalRecordId, ...pregnancy.visits.map(visit => visit.medicalRecordId), ...pregnancy.postpartumVisits.map(visit => visit.medicalRecordId)]))];
  const { records, exams, reviews } = await readFollowupPregnancyEvidence(executor, recordIds);
  const byRecord = new Map(records.map(record => [record.id, record]));
  return pregnancies.map(pregnancy => {
    const opening = byRecord.get(pregnancy.openedMedicalRecordId), linkedIds = new Set([pregnancy.openedMedicalRecordId, ...pregnancy.visits.map(visit => visit.medicalRecordId), ...pregnancy.postpartumVisits.map(visit => visit.medicalRecordId)]);
    const relatedExams = exams.filter(exam => exam.medicalRecordId && linkedIds.has(exam.medicalRecordId));
    const relatedReviews = reviews.filter(review => relatedExams.some(exam => exam.id === review.examRequestId));
    return { originType: "HEALTH_PREGNANCY", originId: pregnancy.id, patientId: pregnancy.patientId, professionalId: opening?.patientId === pregnancy.patientId ? opening.professionalId : null, occurredAt: opening?.date || pregnancy.createdAt,
      stamps: [pregnancy.createdAt, pregnancy.updatedAt, ...pregnancy.visits.map(visit => visit.createdAt), ...pregnancy.postpartumVisits.map(visit => visit.createdAt), ...records.filter(record => linkedIds.has(record.id)).map(record => record.updatedAt), ...relatedExams.map(exam => exam.createdAt), ...relatedReviews.map(review => review.createdAt)],
      data: { id: pregnancy.id, openedMedicalRecordId: pregnancy.openedMedicalRecordId, calculationMethod: pregnancy.calculationMethod, lastMenstrualDate: iso(pregnancy.lastMenstrualDate), ultrasoundDate: iso(pregnancy.ultrasoundDate), ultrasoundGestationalDays: pregnancy.ultrasoundGestationalDays, estimatedDeliveryDate: iso(pregnancy.estimatedDeliveryDate), baselineWeight: pregnancy.baselineWeight, height: pregnancy.height, pregnancyType: pregnancy.pregnancyType, previousPregnancies: pregnancy.previousPregnancies, lastScreeningDate: iso(pregnancy.lastScreeningDate), status: pregnancy.status, closedAt: iso(pregnancy.closedAt), closureReason: pregnancy.closureReason,
        visits: pregnancy.visits.map(visit => ({ id: visit.id, medicalRecordId: visit.medicalRecordId, professionalId: visit.professionalId, occurredAt: iso(visit.occurredAt), gestationalDays: visit.gestationalDays, trimester: visit.trimester, weight: visit.weight, bmi: visit.bmi, bloodPressure: visit.bloodPressure, notes: visit.notes })),
        postpartumVisits: pregnancy.postpartumVisits.map(visit => ({ id: visit.id, medicalRecordId: visit.medicalRecordId, occurredAt: iso(visit.occurredAt), outcome: visit.outcome, gestationalDaysAtBirth: visit.gestationalDaysAtBirth, deliveryType: visit.deliveryType, deliveryLocation: visit.deliveryLocation, deliveryDate: iso(visit.deliveryDate), clinicalConditions: visit.clinicalConditions })),
        exams: relatedExams.map(exam => ({ id: exam.id, medicalRecordId: exam.medicalRecordId, name: exam.examName, status: exam.status, requestedAt: iso(exam.createdAt), reviews: relatedReviews.filter(review => review.examRequestId === exam.id).map(review => ({ id: review.id, performedAt: iso(review.performedAt), resultedAt: iso(review.resultedAt), evaluation: review.evaluation, resultChanged: review.resultChanged })) })),
      },
    };
  });
}

async function chronicSeeds(executor: DatabaseExecutor, unitId: string, range: { gte: Date; lt: Date }, ids?: string[]): Promise<Seed[]> {
  if (ids && !ids.length) return [];
  const candidates = await listFollowupChronicCandidates(executor, unitId, range, ids);
  checkCount(candidates.length);
  const patientIds = candidates.map(candidate => candidate.patientId);
  if (!patientIds.length) return [];
  const { assessments, conditions, conditionRecords } = await readFollowupChronicEvidence(executor, unitId, patientIds);
  const byRecord = new Map(conditionRecords.map(record => [record.id, record]));
  return patientIds.map<Seed | null>(patientId => {
    const patientAssessments = assessments.filter(assessment => assessment.patientId === patientId), patientConditions = conditions.filter(condition => condition.patientId === patientId);
    const lastAssessment = patientAssessments.at(-1), primaryCondition = [...patientConditions].reverse().find(condition => condition.medicalRecordId && byRecord.get(condition.medicalRecordId)?.patientId === patientId);
    const primaryRecord = primaryCondition?.medicalRecordId ? byRecord.get(primaryCondition.medicalRecordId) : null;
    const occurredAt = lastAssessment?.assessedAt || primaryRecord?.date || primaryCondition?.startedAt || patientConditions[0]?.startedAt;
    if (!occurredAt) return null;
    return { originType: "CHRONIC_PATIENT", originId: patientId, patientId, professionalId: lastAssessment?.recordProfessionalId || primaryCondition?.professionalId || null, occurredAt,
      stamps: [...patientAssessments.flatMap(assessment => [assessment.createdAt, assessment.recordUpdatedAt]), ...patientConditions.map(condition => condition.updatedAt), ...conditionRecords.filter(record => record.patientId === patientId).map(record => record.updatedAt)],
      data: { originMedicalRecordId: lastAssessment?.medicalRecordId || primaryCondition?.medicalRecordId || patientConditions[0]?.medicalRecordId, conditions: patientConditions.map(condition => ({ id: condition.id, medicalRecordId: condition.medicalRecordId, professionalId: condition.professionalId, chronicKind: condition.chronicKind, label: condition.label, startedAt: iso(condition.startedAt), endedAt: iso(condition.endedAt), narrative: condition.narrative })), assessments: patientAssessments.map(assessment => ({ id: assessment.id, medicalRecordId: assessment.medicalRecordId, professionalId: assessment.recordProfessionalId, conditionKind: assessment.conditionKind, assessedAt: iso(assessment.assessedAt), systolic: assessment.systolic, diastolic: assessment.diastolic, glucose: assessment.glucose, hba1c: assessment.hba1c, riskFactors: assessment.riskFactors, complications: assessment.complications, notes: assessment.notes })) },
    };
  }).filter((seed): seed is Seed => seed !== null);
}

async function regulationSeeds(executor: DatabaseExecutor, unitId: string, range: { gte: Date; lt: Date }, keys?: OriginKey[]): Promise<Seed[]> {
  const { requests, waiting, procedures } = await listFollowupRegulationSources(executor, unitId, range, keys);
  checkCount(requests.length + waiting.length);
  const codes = new Map(procedures.map(procedure => [procedure.id, procedure.code]));
  const seeds: Seed[] = requests.map(request => {
    const waiting = request.waitlistEntry;
    const events = [...request.events.map(event => ({ id: event.id, eventType: event.eventType, fromStatus: event.fromStatus, toStatus: event.toStatus, notes: event.notes, appointmentId: null, actorUsuarioId: event.actorUsuarioId, createdAt: iso(event.createdAt) })), ...(waiting?.events || []).map(event => ({ id: event.id, eventType: `WAITLIST_${event.eventType}`, fromStatus: event.fromStatus, toStatus: event.toStatus, notes: event.notes, appointmentId: event.appointmentId, actorUsuarioId: event.actorUsuarioId, createdAt: iso(event.createdAt) }))].sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)) || left.id.localeCompare(right.id));
    return { originType: "REGULATION_REQUEST", originId: request.id, patientId: request.patientId, professionalId: request.professionalId, occurredAt: request.createdAt,
      stamps: [request.createdAt, request.updatedAt, waiting?.updatedAt, request.appointment?.updatedAt, ...request.events.map(event => event.createdAt), ...(waiting?.events || []).map(event => event.createdAt)],
      data: { id: request.id, origin: request.origin, requestedAt: iso(request.createdAt), requestedByUsuarioId: request.createdByUsuarioId, status: request.status, priority: request.priority, description: request.description, specialtyId: request.specialtyId, serviceId: request.serviceId, procedureId: request.procedureId, procedureCode: request.procedure?.code || null, protocolNumber: request.protocolNumber, guideNumber: request.guideNumber, authorizedAt: iso(request.events.filter(event => event.toStatus === "AUTORIZADA").at(-1)?.createdAt), scheduledAt: iso(request.scheduledAt), executedAt: iso(request.executedAt), returnedAt: iso(request.returnedAt), patientCondition: request.patientCondition, transportNotes: request.transportNotes, events,
        waitlist: waiting ? { id: waiting.id, status: waiting.status, enteredAt: iso(waiting.createdAt), updatedAt: iso(waiting.updatedAt), specialtyId: waiting.specialtyId, serviceId: request.serviceId, scheduledAppointmentId: waiting.appointmentId } : null,
        appointment: request.appointment ? { id: request.appointment.id, date: iso(request.appointment.date), status: request.appointment.status, unitId: request.appointment.unitId, professionalId: request.appointment.professionalId } : null },
    };
  });
  for (const entry of waiting) seeds.push({ originType: "WAITLIST_ENTRY", originId: entry.id, patientId: entry.patientId, professionalId: entry.appointment?.professionalId || entry.schedule?.professionalId || null, occurredAt: entry.createdAt,
    stamps: [entry.createdAt, entry.updatedAt, entry.appointment?.updatedAt, ...entry.events.map(event => event.createdAt)],
    data: { id: entry.id, origin: "WAITLIST", requestedAt: iso(entry.createdAt), requestedByUsuarioId: entry.createdByUsuarioId, status: entry.status, priority: entry.priority, description: entry.notes, specialtyId: entry.specialtyId, serviceId: null, procedureId: entry.procedureId, procedureCode: entry.procedureId ? codes.get(entry.procedureId) || null : null, protocolNumber: null, guideNumber: null, authorizedAt: null, scheduledAt: iso(entry.appointment?.date), executedAt: entry.appointment?.medicalRecord?.completedAt ? iso(entry.appointment.medicalRecord.date) : null, returnedAt: null, patientCondition: null, transportNotes: null,
      events: entry.events.map(event => ({ id: event.id, eventType: event.eventType, fromStatus: event.fromStatus, toStatus: event.toStatus, notes: event.notes, appointmentId: event.appointmentId, actorUsuarioId: event.actorUsuarioId, createdAt: iso(event.createdAt) })),
      waitlist: { id: entry.id, status: entry.status, enteredAt: iso(entry.createdAt), updatedAt: iso(entry.updatedAt), specialtyId: entry.specialtyId, serviceId: null, scheduledAppointmentId: entry.appointmentId },
      appointment: entry.appointment ? { id: entry.appointment.id, date: iso(entry.appointment.date), status: entry.appointment.status, unitId: entry.appointment.unitId, professionalId: entry.appointment.professionalId } : null },
  });
  return seeds;
}

export async function collectFollowupSources(context: HealthFollowupContext, input: { contract: FollowupContractName; unitId: string; fromDate: string; toDate: string; originKeys?: OriginKey[] }, executor: DatabaseExecutor = context.database ?? db): Promise<FollowupSourceRecord[]> {
  assertHealthUnitAccess(context.user, input.unitId);
  const range = { gte: new Date(`${input.fromDate}T00:00:00-03:00`), lt: new Date(new Date(`${input.toDate}T23:59:59.999-03:00`).valueOf() + 1) };
  const seeds = input.contract === "CELERIFLOW_SISPRENATAL" ? await pregnancySeeds(executor, input.unitId, range, input.originKeys?.filter(key => key.originType === "HEALTH_PREGNANCY").map(key => key.originId)) : input.contract === "CELERIFLOW_HIPERDIA" ? await chronicSeeds(executor, input.unitId, range, input.originKeys?.filter(key => key.originType === "CHRONIC_PATIENT").map(key => key.originId)) : await regulationSeeds(executor, input.unitId, range, input.originKeys);
  checkCount(seeds.length);
  const metadata = await actors(executor, input.unitId, seeds), snapshotAt = new Date().toISOString();
  return seeds.map(seed => {
    const patient = metadata.patients.get(seed.patientId), professional = seed.professionalId ? metadata.professionals.get(seed.professionalId) : null;
    const value = { originType: seed.originType, originId: seed.originId, unitId: input.unitId, patientId: seed.patientId, professionalId: seed.professionalId, operation: "UPSERT", occurredAt: iso(seed.occurredAt), sourceUpdatedAt: latestStamp([...seed.stamps, metadata.unitUpdatedAt, ...(patient?.stamps || []), ...(professional?.stamps || [])]), snapshotAt, patient: patient?.data || null, unit: metadata.unit, professional: professional?.data || null, data: seed.data };
    const sourceVersion = followupRecordVersion(value);
    return { ...value, sourceVersion, idempotencyKey: followupRecordKey(input.contract, seed.originType, seed.originId, sourceVersion) };
  });
}
