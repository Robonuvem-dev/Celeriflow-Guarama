import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthTimestamp } from "@/db/repositories/health/timestamp";
import { patients as patientTable, healthPatientRegistrations, healthPatientContacts } from "@/db/schema/health-registration";
import { people as personTable } from "@/db/schema/people";
import { addresses } from "@/db/schema/registry";
import { neighborhoods } from "@/db/schema/localities";
import { medicalRecords, healthPatientConditions } from "@/db/schema/health-care";
import { healthPregnancies, healthPregnancyVisits, healthPostpartumVisits, healthChronicAssessments, healthClinicalScreenings, healthDentalMarks } from "@/db/schema/health-care-lines";
import { healthCollectiveActivities, healthHomeVisits } from "@/db/schema/health-territory";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { careContextSchema, consultationKind } from "./indicator-context";

export const healthIndicatorKeys = ["GESTATION", "POSTPARTUM", "ELDERLY", "HYPERTENSION", "DIABETES", "CHILD", "CYTOLOGY", "MAMMOGRAPHY", "EMULTI", "DENTAL"] as const;
export type HealthIndicatorKey = typeof healthIndicatorKeys[number];
export type IndicatorEvidence = { type: string; id: string; date: string; href: string };
export type IndicatorPerson = { patientId: string; name: string; unitId: string | null; phone: string | null; address: string | null; contactHours: string | null; status: "RECORDED" | "NO_RECORD"; evidence: IndicatorEvidence[] };
export type HealthIndicator = { key: HealthIndicatorKey; name: string; definition: string; population: string; numerator: number; denominator: number; percentage: number | null; people: IndicatorPerson[] };
const querySchema = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), unitId: z.string().max(200).default(""), elderlyAge: z.number().int().min(50).max(100).default(60), childMonths: z.number().int().min(1).max(144).default(24) }).strict();
const teamSchema = z.object({ classification: z.string().nullable(), id: z.string() });
export function indicatorPeriod(period: string) {
  z.string().regex(/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/).parse(period);
  const [year, month] = period.split("-").map(Number), next = new Date(Date.UTC(year, month, 1));
  return { gte: new Date(`${period}-01T00:00:00-03:00`), lt: new Date(`${next.toISOString().slice(0, 10)}T00:00:00-03:00`), referenceDay: new Date(next.valueOf() - 12 * 3600000) };
}
export function indicatorPercentage(numerator: number, denominator: number) { return denominator ? Number((numerator * 100 / denominator).toFixed(2)) : null; }
function monthsOld(birth: Date, at: Date) { return (at.getUTCFullYear() - birth.getUTCFullYear()) * 12 + at.getUTCMonth() - birth.getUTCMonth() - (at.getUTCDate() < birth.getUTCDate() ? 1 : 0); }
function unitIdsFor(context: AppContext, selected: string) {
  if (selected) { assertHealthUnitAccess(context.user, selected); return [selected]; }
  return context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
}
const evidence = (type: string, id: string, date: Date, recordId: string): IndicatorEvidence => ({ type, id, date: date.toISOString(), href: `/saude/atendimentos/${encodeURIComponent(recordId)}/linhas-cuidado` });

export async function healthCareIndicators(context: AppContext, raw: unknown) {
  const input = querySchema.parse(raw), range = indicatorPeriod(input.period), unitIds = unitIdsFor(context, input.unitId), now = new Date();
  if (input.period > now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7)) throw new Error("Selecione período atual ou passado para indicadores de atendimentos realizados.");
  const database = context.database ?? db;
  const patientRows = await database.select({ patient: patientTable, person: personTable, registrationProfile: healthPatientRegistrations }).from(patientTable).innerJoin(personTable, eq(personTable.id, patientTable.personId)).leftJoin(healthPatientRegistrations, eq(healthPatientRegistrations.patientId, patientTable.id)).where(and(eq(patientTable.status, "Ativo"), unitIds ? inArray(patientTable.referenceUnitId, unitIds) : undefined)).orderBy(asc(personTable.fullName), asc(patientTable.id));
  const [addressRows, contactRows] = await Promise.all([
    database.select({ address: addresses, neighborhood: { name: neighborhoods.name, city: neighborhoods.city, state: neighborhoods.state } }).from(addresses).leftJoin(neighborhoods, eq(neighborhoods.id, addresses.neighborhoodId)).where(and(inArray(addresses.personId, patientRows.map(row => row.patient.personId)), eq(addresses.addressType, "Residencial"))).orderBy(desc(addresses.createdAt), desc(addresses.id)),
    database.select().from(healthPatientContacts).where(and(inArray(healthPatientContacts.patientId, patientRows.map(row => row.patient.id)), eq(healthPatientContacts.isActive, true))).orderBy(desc(healthPatientContacts.createdAt)),
  ]);
  const patients = patientRows.map(row => ({ ...row.patient, person: { ...row.person, addresses: addressRows.filter(address => address.address.personId === row.patient.personId).slice(0, 1).map(address => ({ ...address.address, neighborhood: address.neighborhood })) }, registrationProfile: row.registrationProfile, contactRecords: contactRows.filter(contact => contact.patientId === row.patient.id).slice(0, 1) }));
  const patientIds = patients.map(patient => patient.id), all = new Set(patientIds);
  const records = await database.select({ id: medicalRecords.id, patientId: medicalRecords.patientId, unitId: medicalRecords.unitId, date: medicalRecords.date, completedAt: medicalRecords.completedAt, weight: medicalRecords.weight, height: medicalRecords.height, careContextSnapshot: medicalRecords.careContextSnapshot }).from(medicalRecords).where(and(inArray(medicalRecords.patientId, patientIds), unitIds ? inArray(medicalRecords.unitId, unitIds) : undefined));
  const recordById = new Map(records.map(record => [record.id, record]));
  const inPeriod = (date: Date) => date >= range.gte && date < range.lt && date <= now;
  const isConcluded = (id: string) => { const record = recordById.get(id); return Boolean(record?.completedAt && record.completedAt <= now && record.date <= now); };
  const concluded = records.filter(record => isConcluded(record.id) && inPeriod(record.date));
  const recordIds = records.map(record => record.id);
  const [pregnancyRows, conditions, assessments, screenings, dental, activities] = await Promise.all([
    database.select().from(healthPregnancies).where(and(inArray(healthPregnancies.patientId, patientIds), unitIds ? inArray(healthPregnancies.unitId, unitIds) : undefined)),
    database.select({ id: healthPatientConditions.id, patientId: healthPatientConditions.patientId, chronicKind: healthPatientConditions.chronicKind, startedAt: healthPatientConditions.startedAt, endedAt: healthPatientConditions.endedAt, medicalRecordId: healthPatientConditions.medicalRecordId }).from(healthPatientConditions).where(and(inArray(healthPatientConditions.patientId, patientIds), eq(healthPatientConditions.kind, "CHRONIC"), or(inArray(healthPatientConditions.medicalRecordId, recordIds), isNull(healthPatientConditions.medicalRecordId)))),
    database.select().from(healthChronicAssessments).where(inArray(healthChronicAssessments.medicalRecordId, recordIds)),
    database.select().from(healthClinicalScreenings).where(inArray(healthClinicalScreenings.medicalRecordId, recordIds)).orderBy(desc(healthClinicalScreenings.requestedAt), desc(healthClinicalScreenings.id)),
    database.select().from(healthDentalMarks).where(inArray(healthDentalMarks.medicalRecordId, recordIds)),
    database.select({ id: healthCollectiveActivities.id, occurredAt: healthCollectiveActivities.occurredAt, participantIds: healthCollectiveActivities.participantIds, teamSnapshot: healthCollectiveActivities.teamSnapshot }).from(healthCollectiveActivities).where(and(gte(healthCollectiveActivities.occurredAt, range.gte), lt(healthCollectiveActivities.occurredAt, range.lt), notInArray(healthCollectiveActivities.activityType, ["TEAM_MEETING", "COMMUNITY_MEETING"]), unitIds ? inArray(healthCollectiveActivities.unitId, unitIds) : undefined)),
  ]);
  const [visits, postpartumVisits] = await Promise.all([
    database.select().from(healthPregnancyVisits).where(inArray(healthPregnancyVisits.pregnancyId, pregnancyRows.map(row => row.id))),
    database.select().from(healthPostpartumVisits).where(inArray(healthPostpartumVisits.pregnancyId, pregnancyRows.map(row => row.id))),
  ]);
  const pregnancies = pregnancyRows.map(row => ({ ...row, visits: visits.filter(visit => visit.pregnancyId === row.id), postpartumVisits: postpartumVisits.filter(visit => visit.pregnancyId === row.id) }));
  const people = new Map(patients.map(patient => {
    const address = patient.person.addresses[0], profile = patient.registrationProfile, contact = patient.contactRecords[0];
    const hours = profile?.contactStartTime || profile?.contactEndTime ? `${profile.contactStartTime || "—"} a ${profile.contactEndTime || "—"}` : null;
    return [patient.id, { patientId: patient.id, name: patient.person.fullName, unitId: patient.referenceUnitId, phone: patient.person.phonePrimary || patient.person.whatsapp || patient.person.phoneSecondary || contact?.phone || null, address: address ? [address.streetName, address.number, address.complement, address.neighborhood?.name, address.neighborhood?.city, address.neighborhood?.state, address.zipCode].filter(Boolean).join(" · ") : null, contactHours: hours }] as const;
  }));
  const metrics: HealthIndicator[] = [];
  const build = (key: HealthIndicatorKey, name: string, definition: string, population: string, eligible: Set<string>, entries: Map<string, IndicatorEvidence[]>, origins = new Map<string, IndicatorEvidence[]>()) => {
    const rows: IndicatorPerson[] = [...eligible].filter(id => all.has(id)).map(id => ({ ...people.get(id)!, status: entries.has(id) ? "RECORDED" : "NO_RECORD", evidence: entries.get(id) || origins.get(id) || [] }));
    const numerator = rows.filter(row => row.status === "RECORDED").length;
    metrics.push({ key, name, definition, population, numerator, denominator: rows.length, percentage: indicatorPercentage(numerator, rows.length), people: rows });
  };
  const add = (map: Map<string, IndicatorEvidence[]>, patientId: string, entry: IndicatorEvidence) => map.set(patientId, [...map.get(patientId) || [], entry]);
  const basePopulation = "Cadastro ativo atual nas unidades selecionadas; registros clínicos limitados ao escopo autorizado.";
  const gestational = new Set<string>(), gestationCare = new Map<string, IndicatorEvidence[]>(), postpartum = new Set<string>(), postpartumCare = new Map<string, IndicatorEvidence[]>(), pregnancyOrigins = new Map<string, IndicatorEvidence[]>(), postpartumOrigins = new Map<string, IndicatorEvidence[]>();
  for (const pregnancy of pregnancies) {
    const opening = recordById.get(pregnancy.openedMedicalRecordId);
    const started = pregnancy.lastMenstrualDate || (pregnancy.ultrasoundDate && pregnancy.ultrasoundGestationalDays !== null ? new Date(pregnancy.ultrasoundDate.valueOf() - pregnancy.ultrasoundGestationalDays * 86400000) : opening?.date);
    if (started && started <= now && started < range.lt && (!pregnancy.closedAt || pregnancy.closedAt >= range.gte)) {
      gestational.add(pregnancy.patientId);
      add(pregnancyOrigins, pregnancy.patientId, evidence("GESTATION", pregnancy.id, started, pregnancy.openedMedicalRecordId));
      for (const visit of pregnancy.visits) if (inPeriod(visit.occurredAt) && isConcluded(visit.medicalRecordId)) add(gestationCare, pregnancy.patientId, evidence("PRENATAL_VISIT", visit.id, visit.occurredAt, visit.medicalRecordId));
    }
    for (const visit of pregnancy.postpartumVisits) if (visit.outcome === "DELIVERED" && visit.deliveryDate && inPeriod(visit.deliveryDate)) {
      postpartum.add(pregnancy.patientId);
      add(postpartumOrigins, pregnancy.patientId, evidence("DELIVERY_RECORD", visit.id, visit.deliveryDate, visit.medicalRecordId));
      if (inPeriod(visit.occurredAt) && isConcluded(visit.medicalRecordId)) add(postpartumCare, pregnancy.patientId, evidence("POSTPARTUM_VISIT", visit.id, visit.occurredAt, visit.medicalRecordId));
    }
  }
  build("GESTATION", "Acompanhamento da gestante", "Gestantes com consulta pré-natal estruturada em atendimento concluído no período / gestantes com episódio sobreposto ao período.", basePopulation, gestational, gestationCare, pregnancyOrigins);
  build("POSTPARTUM", "Cuidado da puérpera", "Pessoas com consulta puerperal e atendimento concluído no recorte / pessoas com parto registrado no período. O parto e a consulta mantêm suas datas próprias.", basePopulation, postpartum, postpartumCare, postpartumOrigins);
  const elderly = new Set(patients.filter(patient => patient.person.birthDate && monthsOld(patient.person.birthDate, range.referenceDay) >= input.elderlyAge * 12).map(patient => patient.id));
  const children = new Set(patients.filter(patient => patient.person.birthDate && monthsOld(patient.person.birthDate, range.referenceDay) >= 0 && monthsOld(patient.person.birthDate, range.referenceDay) < input.childMonths).map(patient => patient.id));
  const generalCare = new Map<string, IndicatorEvidence[]>(), childCare = new Map<string, IndicatorEvidence[]>(), emultiCare = new Map<string, IndicatorEvidence[]>();
  for (const record of concluded) {
    const entry = evidence("COMPLETED_RECORD", record.id, record.date, record.id); add(generalCare, record.patientId, entry);
    if (record.weight !== null && record.weight > 0 && record.height !== null && record.height > 0) add(childCare, record.patientId, entry);
    const careContext = careContextSchema.safeParse(record.careContextSnapshot);
    if (careContext.success && careContext.data.team?.classification === "EMULTI") add(emultiCare, record.patientId, entry);
  }
  build("ELDERLY", "Cuidado da pessoa idosa", `Pessoas com ${input.elderlyAge} anos ou mais com atendimento concluído no período / cadastro ativo dessa faixa etária, com nascimento informado.`, basePopulation, elderly, generalCare);
  build("CHILD", "Desenvolvimento infantil", `Crianças com menos de ${input.childMonths} meses com peso e altura em atendimento concluído no período / cadastro ativo da faixa com nascimento informado.`, basePopulation, children, childCare);
  for (const kind of ["HYPERTENSION", "DIABETES"] as const) {
    const activeConditions = conditions.filter(condition => condition.chronicKind === kind && condition.startedAt <= now && condition.startedAt < range.lt && (!condition.endedAt || condition.endedAt >= range.gte));
    const eligible = new Set(activeConditions.map(condition => condition.patientId)), care = new Map<string, IndicatorEvidence[]>(), origins = new Map<string, IndicatorEvidence[]>();
    for (const condition of activeConditions) add(origins, condition.patientId, condition.medicalRecordId ? evidence("LONGITUDINAL_CONDITION", condition.id, condition.startedAt, condition.medicalRecordId) : { type: "LONGITUDINAL_CONDITION", id: condition.id, date: condition.startedAt.toISOString(), href: `/saude/pacientes/${encodeURIComponent(condition.patientId)}` });
    for (const assessment of assessments) if (assessment.conditionKind === kind && inPeriod(assessment.assessedAt) && isConcluded(assessment.medicalRecordId) && (kind === "HYPERTENSION" ? assessment.systolic !== null && assessment.systolic > 0 && assessment.diastolic !== null && assessment.diastolic > 0 : assessment.glucose !== null && assessment.glucose > 0 || assessment.hba1c !== null && assessment.hba1c > 0)) add(care, assessment.patientId, evidence("CHRONIC_ASSESSMENT", assessment.id, assessment.assessedAt, assessment.medicalRecordId));
    build(kind, kind === "HYPERTENSION" ? "Cuidado da pessoa hipertensa" : "Cuidado da pessoa diabética", "Pessoas com avaliação estruturada e atendimento concluído no recorte / pessoas com condição longitudinal explicitamente classificada e vigente no período. Histórico sem classificação é listado para revisão cadastral.", basePopulation, eligible, care, origins);
  }
  for (const kind of ["CYTOLOGY", "MAMMOGRAPHY"] as const) {
    const screeningCohort = new Set<string>(), screeningCare = new Map<string, IndicatorEvidence[]>(), screeningOrigins = new Map<string, IndicatorEvidence[]>(), latestScreen = new Set<string>();
    for (const screening of screenings.filter(screening => screening.kind === kind)) {
      if (latestScreen.has(screening.patientId) || screening.requestedAt > now || screening.requestedAt >= range.lt) continue;
      latestScreen.add(screening.patientId);
      if (!screening.eligible || screening.performedAt && screening.performedAt < range.gte) continue;
      screeningCohort.add(screening.patientId);
      add(screeningOrigins, screening.patientId, evidence("SCREENING_REQUEST", screening.id, screening.requestedAt, screening.medicalRecordId));
      if (screening.performedAt && inPeriod(screening.performedAt) && isConcluded(screening.medicalRecordId)) add(screeningCare, screening.patientId, evidence("CLINICAL_SCREENING", screening.id, screening.performedAt, screening.medicalRecordId));
    }
    build(kind, kind === "CYTOLOGY" ? "Saúde da mulher · citopatológico" : "Saúde da mulher · mamografia", "Pessoas com exame realizado e origem concluída no período / pessoas com rastreamento elegível solicitado, ainda aberto no início ou solicitado no período. A elegibilidade é a registrada pelo profissional.", basePopulation, screeningCohort, screeningCare, screeningOrigins);
  }
  const personToPatient = new Map(patients.map(patient => [patient.personId, patient.id]));
  for (const activity of activities) {
    const team = teamSchema.safeParse(activity.teamSnapshot);
    if (team.success && team.data.classification === "EMULTI" && activity.occurredAt <= now) for (const personId of activity.participantIds) {
      const patientId = personToPatient.get(personId); if (patientId) add(emultiCare, patientId, { type: "COLLECTIVE_ACTIVITY", id: activity.id, date: activity.occurredAt.toISOString(), href: "/saude/territorio/atencao-primaria" });
    }
  }
  build("EMULTI", "Cuidado e-Multi", "Pessoas com atendimento individual concluído ou participação assistencial coletiva por equipe identificada como e-Multi na origem / cadastro ativo do recorte. Reuniões de equipe/comunidade são excluídas.", basePopulation, all, emultiCare);
  const dentalCohort = new Set<string>(), dentalCare = new Map<string, IndicatorEvidence[]>(), dentalOrigins = new Map<string, IndicatorEvidence[]>();
  for (const mark of dental) {
    const record = recordById.get(mark.medicalRecordId);
    if (!record || !isConcluded(record.id) || !inPeriod(record.date)) continue;
    dentalCohort.add(mark.patientId);
    add(dentalOrigins, mark.patientId, evidence("DENTAL_RECORD", mark.id, record.date, mark.medicalRecordId));
    if (mark.performedProcedureId && mark.performedAt && inPeriod(mark.performedAt)) add(dentalCare, mark.patientId, evidence("DENTAL_PERFORMED_PROCEDURE", mark.performedProcedureId, mark.performedAt, mark.medicalRecordId));
  }
  build("DENTAL", "Procedimentos e tratamentos odontológicos", "Pessoas com procedimento executado vinculado ao odontograma / pessoas com registro odontológico em atendimento concluído no recorte. A situação identifica vínculo de produção, sem presumir necessidade de tratamento.", basePopulation, dentalCohort, dentalCare, dentalOrigins);
  const missingBirth = patients.filter(patient => !patient.person.birthDate).map(patient => ({ ...people.get(patient.id)!, reason: "Nascimento não informado; faixa etária não calculável." }));
  const unclassifiedChronic = new Set(conditions.filter(condition => !condition.chronicKind).map(condition => condition.patientId));
  return { period: input.period, criteria: { elderlyAge: input.elderlyAge, childMonths: input.childMonths, population: basePopulation }, indicators: metrics, dataQuality: { missingBirth, withoutPhone: [...people.values()].filter(person => !person.phone), withoutAddress: [...people.values()].filter(person => !person.address), chronicWithoutSpecificClassification: [...unclassifiedChronic].map(id => people.get(id)!).filter(Boolean), recordsWithoutContext: concluded.filter(record => !careContextSchema.safeParse(record.careContextSnapshot).success).length } };
}

export async function healthAnnualSeries(context: AppContext, raw: unknown) {
  const input = z.object({ fromYear: z.number().int().min(1900).max(2200), toYear: z.number().int().min(1900).max(2200), unitId: z.string().max(200).default("") }).strict().refine(value => value.fromYear <= value.toYear && value.toYear - value.fromYear <= 20, "Selecione até 21 anos em ordem crescente.").parse(raw);
  const now = new Date();
  if (input.toYear > Number(now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4))) throw new Error("Selecione anos atuais ou passados para séries de registros realizados.");
  const units = unitIdsFor(context, input.unitId), dates = { gte: new Date(`${input.fromYear}-01-01T00:00:00-03:00`), lt: new Date(Math.min(new Date(`${input.toYear + 1}-01-01T00:00:00-03:00`).valueOf(), now.valueOf() + 1)) };
  const database = context.database ?? db;
  const [dispensationResult, vaccinationResult, visits, records] = await Promise.all([
    database.execute<{ date: string }>(sql`SELECT date FROM "MedicineDispensation" WHERE status='ACTIVE' AND date>=${dates.gte} AND date<${dates.lt} AND ${units ? inArray(sql`"unitId"`, units) : sql`true`}`),
    database.execute<{ date: string }>(sql`SELECT date FROM "VaccinationRecord" WHERE date>=${dates.gte} AND date<${dates.lt} AND ${units ? inArray(sql`"unitId"`, units) : sql`true`}`),
    database.select({ visitedAt: healthHomeVisits.visitedAt }).from(healthHomeVisits).where(and(gte(healthHomeVisits.visitedAt, dates.gte), lt(healthHomeVisits.visitedAt, dates.lt), eq(healthHomeVisits.status, "REALIZADA"), sql`EXISTS (SELECT 1 FROM "HealthHomeVisitParticipant" p WHERE p."visitId"=${healthHomeVisits.id} AND p.outcome='PRESENT')`, units ? inArray(healthHomeVisits.unitId, units) : undefined)),
    database.select({ id: medicalRecords.id, date: medicalRecords.date, careContextSnapshot: medicalRecords.careContextSnapshot }).from(medicalRecords).where(and(gte(medicalRecords.date, dates.gte), lt(medicalRecords.date, dates.lt), isNotNull(medicalRecords.completedAt), lte(medicalRecords.completedAt, now), units ? inArray(medicalRecords.unitId, units) : undefined)),
  ]);
  const dispensations = dispensationResult.rows.map(row => ({ date: healthTimestamp(row.date) })), vaccinations = vaccinationResult.rows.map(row => ({ date: healthTimestamp(row.date) }));
  const dentalMarks = await database.select({ medicalRecordId: healthDentalMarks.medicalRecordId }).from(healthDentalMarks).where(inArray(healthDentalMarks.medicalRecordId, records.map(record => record.id)));
  const dentalIds = new Set(dentalMarks.map(mark => mark.medicalRecordId));
  const rows = Array.from({ length: input.toYear - input.fromYear + 1 }, (_, index) => ({ year: input.fromYear + index, dispensations: 0, vaccinations: 0, visits: 0, medicalConsultations: 0, dentalConsultations: 0, otherOrUnclassifiedCare: 0 }));
  const byYear = new Map(rows.map(row => [row.year, row]));
  const bucket = (date: Date) => byYear.get(Number(date.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4)));
  for (const item of dispensations) { const row = bucket(item.date); if (row) row.dispensations++; }
  for (const item of vaccinations) { const row = bucket(item.date); if (row) row.vaccinations++; }
  for (const item of visits) { const row = bucket(item.visitedAt); if (row) row.visits++; }
  for (const record of records) {
    const row = bucket(record.date); if (!row) continue;
    const parsed = careContextSchema.safeParse(record.careContextSnapshot), kind = consultationKind(parsed.success ? parsed.data.professionalCbo : null);
    if (kind === "MEDICAL") row.medicalConsultations++; else if (kind === "DENTAL" || dentalIds.has(record.id)) row.dentalConsultations++; else row.otherOrUnclassifiedCare++;
  }
  return { fromYear: input.fromYear, toYear: input.toYear, rows, definitions: { dispensations: "Registros ativos de dispensação, excluídos os cancelados.", vaccinations: "Aplicações efetivamente registradas; resgates históricos da carteira não são novas aplicações.", visits: "Visitas realizadas com ao menos um integrante presente; cada visita é contada uma vez. Visitas antigas sem unidade responsável não integram filtros por unidade.", consultations: "Atendimentos concluídos, classificados pelo CBO preservado na origem; odontograma identifica registros odontológicos sem contexto. Outros/sem classificação são apresentados separadamente." } };
}
