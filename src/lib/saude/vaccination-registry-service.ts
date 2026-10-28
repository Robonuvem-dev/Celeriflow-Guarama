import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { materials } from "@/db/schema/assets-stock";
import { healthMaterialProfiles } from "@/db/schema/health-pharmacy";
import { healthUnits } from "@/db/schema/health-workforce";
import { vaccines, vaccinationRecords, healthVaccineManufacturers, healthVaccineCodeMappings, healthVaccineCalendarRules, healthVaccineInteractions, healthVaccinationCampaigns, healthVaccinationCardEvents, healthVaccineAdverseEvents, healthVaccineAdverseFollowups } from "@/db/schema/health-vaccination";
import { findVaccinationProfessional, hasVaccinationPatientUnitAccess, readVaccinationPatient, readVaccinationVaccine, vaccinationRecord } from "@/db/repositories/health-vaccination/records";
import { listCurrentVaccinationRules, readVaccinationCardEvents, readVaccinationCardRecords } from "@/db/repositories/health-vaccination/cards";
import type { HealthVaccinationContext } from "@/lib/contracts/health-vaccination";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { vaccineCalendarAge, vaccineDoseStatus, vaccineStrategy, type VaccineHistory } from "./vaccination-card-policy";

export async function vaccinePatientForAccess(tx: DatabaseExecutor, context: HealthVaccinationContext, patientId: string) {
  const patient = await readVaccinationPatient(tx, patientId);
  if (context.user.hasHealthAccessScope && !context.user.allowedHealthUnitIds?.includes(patient.referenceUnitId || "")) {
    const units = context.user.allowedHealthUnitIds || [];
    if (!await hasVaccinationPatientUnitAccess(tx, patientId, units)) throw new Error("Paciente fora das unidades e atendimentos autorizados.");
  }
  return patient;
}

export async function vaccinationProfessional(tx: DatabaseExecutor, unitId: string, professionalId: string | null, employeeId: string | null) {
  const professional = await findVaccinationProfessional(tx, unitId, professionalId, employeeId);
  if (!professional) throw new Error("Selecione profissional ativo vinculado à unidade da vacinação.");
  return { ...professional, team: professional.team?.unitId === unitId ? professional.team : null };
}

export async function saveVaccineManufacturer(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(200), rndsCode: z.string().trim().min(1).max(60).nullable(), sourceReference: z.string().trim().min(1).max(2000).nullable() }).strict().parse(raw);
  if (input.rndsCode && !input.sourceReference) throw new Error("Informe a fonte do código do fabricante RNDS.");
  const { id, ...data } = input;
  return withDatabaseTransaction(connection, async tx => vaccinationRecord((await (id ? tx.update(healthVaccineManufacturers).set({ ...data, actorUsuarioId: context.user.id }).where(eq(healthVaccineManufacturers.id, id)).returning() : tx.insert(healthVaccineManufacturers).values({ ...data, actorUsuarioId: context.user.id }).returning()))[0]), { timeoutMs: 5_000 });
}

export async function saveVaccineCodeMapping(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ vaccineId: z.string().min(1), system: z.enum(["ESUS", "RNDS"]), code: z.string().trim().min(1).max(60), version: z.string().trim().min(1).max(100), sourceReference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    if (!(await tx.select({ id: vaccines.id }).from(vaccines).where(and(eq(vaccines.id, input.vaccineId), eq(vaccines.isActive, true))).limit(1))[0]) throw new Error("Selecione imunobiológico ativo.");
    const [previous] = await tx.select().from(healthVaccineCodeMappings).where(and(eq(healthVaccineCodeMappings.vaccineId, input.vaccineId), eq(healthVaccineCodeMappings.system, input.system), eq(healthVaccineCodeMappings.version, input.version))).limit(1);
    if (previous) { if (previous.code !== input.code || previous.sourceReference !== input.sourceReference) throw new Error("Registre nova versão do mapeamento para preservar a origem anterior."); return previous; }
    return vaccinationRecord((await tx.insert(healthVaccineCodeMappings).values({ ...input, actorUsuarioId: context.user.id }).returning())[0]);
  }, { timeoutMs: 5_000 });
}

export async function configureVaccineStock(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ vaccineId: z.string().min(1), diluentMaterialId: z.string().nullable(), diluentUnitsPerVial: z.number().positive(), useAfterOpeningHours: z.number().positive().max(8760).nullable(), rndsAuthorized: z.boolean() }).strict().parse(raw);
  if (input.diluentMaterialId && !input.useAfterOpeningHours) throw new Error("Informe a validade após abertura/preparo do frasco que utiliza diluente.");
  return withDatabaseTransaction(connection, async tx => {
    const vaccine = await readVaccinationVaccine(tx, input.vaccineId);
    if (!vaccine.material || !["UN", "DOSE", "DOSES"].includes(vaccine.material.unitOfMeasure.toUpperCase())) throw new Error("O imunobiológico deve usar estoque em doses; a entrada converterá frascos em doses.");
    if (input.diluentMaterialId && !(await tx.select({ id: materials.id }).from(materials).innerJoin(healthMaterialProfiles, eq(healthMaterialProfiles.materialId, materials.id)).where(and(eq(materials.id, input.diluentMaterialId), eq(materials.isActive, true), eq(healthMaterialProfiles.isActive, true), eq(healthMaterialProfiles.productKind, "DILUENT"))).limit(1))[0]) throw new Error("Selecione produto ativo do tipo diluente.");
    const { vaccineId, ...data } = input;
    return vaccinationRecord((await tx.update(vaccines).set(data).where(eq(vaccines.id, vaccineId)).returning())[0]);
  }, { timeoutMs: 5_000 });
}

export async function saveVaccineCalendarRule(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ code: z.string().trim().min(1).max(80), vaccineId: z.string().min(1), doseNumber: z.number().int().positive(), strategy: z.string().trim().min(1).max(100), ageUnit: z.enum(["DAY", "MONTH", "YEAR"]), minimumAge: z.number().int().nonnegative(), maximumAge: z.number().int().nonnegative().nullable(), minimumIntervalDays: z.number().int().nonnegative(), repeatEveryMonths: z.number().int().positive().nullable(), required: z.boolean(), enabled: z.boolean(), validFrom: z.coerce.date(), validUntil: z.coerce.date().nullable(), sourceReference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  if (input.maximumAge !== null && input.maximumAge < input.minimumAge || input.validUntil && input.validUntil < input.validFrom) throw new Error("Confira a faixa etária e a vigência do calendário.");
  return withDatabaseTransaction(connection, async tx => {
    if (!(await tx.select({ id: vaccines.id }).from(vaccines).where(and(eq(vaccines.id, input.vaccineId), eq(vaccines.isActive, true))).limit(1))[0]) throw new Error("Selecione imunobiológico ativo.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`VACCINE_CALENDAR:${input.code}`}))`);
    const [previous] = await tx.select().from(healthVaccineCalendarRules).where(eq(healthVaccineCalendarRules.code, input.code)).orderBy(desc(healthVaccineCalendarRules.version)).limit(1);
    if (previous && input.validFrom <= previous.validFrom) throw new Error("Nova versão exige início de vigência posterior à versão anterior.");
    if (previous && (!previous.validUntil || previous.validUntil >= input.validFrom)) await tx.update(healthVaccineCalendarRules).set({ validUntil: new Date(input.validFrom.valueOf() - 1) }).where(eq(healthVaccineCalendarRules.id, previous.id));
    return vaccinationRecord((await tx.insert(healthVaccineCalendarRules).values({ ...input, strategy: vaccineStrategy(input.strategy), version: (previous?.version || 0) + 1, actorUsuarioId: context.user.id }).returning())[0]);
  }, { timeoutMs: 5_000 });
}

export async function saveVaccineInteraction(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ firstVaccineId: z.string().min(1), secondVaccineId: z.string().min(1), minimumIntervalDays: z.number().int().nonnegative(), allowSameDay: z.boolean(), sourceReference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  if (input.firstVaccineId === input.secondVaccineId) throw new Error("Para doses do mesmo imunobiológico, configure o intervalo no calendário.");
  return withDatabaseTransaction(connection, async tx => {
    if ((await tx.select({ id: vaccines.id }).from(vaccines).where(and(inArray(vaccines.id, [input.firstVaccineId, input.secondVaccineId]), eq(vaccines.isActive, true)))).length !== 2) throw new Error("Selecione dois imunobiológicos ativos.");
    const [firstVaccineId, secondVaccineId] = [input.firstVaccineId, input.secondVaccineId].sort();
    return vaccinationRecord((await tx.insert(healthVaccineInteractions).values({ ...input, firstVaccineId, secondVaccineId, actorUsuarioId: context.user.id }).onConflictDoUpdate({ target: [healthVaccineInteractions.firstVaccineId, healthVaccineInteractions.secondVaccineId], set: { minimumIntervalDays: input.minimumIntervalDays, allowSameDay: input.allowSameDay, sourceReference: input.sourceReference, actorUsuarioId: context.user.id } }).returning())[0]);
  }, { timeoutMs: 5_000 });
}

export async function saveVaccinationCampaign(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ name: z.string().trim().min(1).max(200), startsAt: z.coerce.date(), endsAt: z.coerce.date(), publicInformation: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  if (input.endsAt < input.startsAt) throw new Error("O término da campanha deve ser posterior ao início.");
  return withDatabaseTransaction(connection, async tx => vaccinationRecord((await tx.insert(healthVaccinationCampaigns).values({ ...input, actorUsuarioId: context.user.id }).returning())[0]), { timeoutMs: 5_000 });
}

export async function recordVaccinationCardEvent(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ patientId: z.string().min(1), vaccineId: z.string().min(1), unitId: z.string().min(1), professionalId: z.string().nullable(), kind: z.enum(["INDICATION", "RESCUE", "SCHEDULED", "CONTRAINDICATION"]), doseNumber: z.number().int().nonnegative(), strategy: z.string().trim().min(1).max(100), occurredAt: z.coerce.date(), scheduledFor: z.coerce.date().nullable(), until: z.coerce.date().nullable(), reason: z.string().trim().min(1).max(4000), sourceReference: z.string().trim().max(2000).nullable(), lotNumber: z.string().trim().max(80).nullable() }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.occurredAt > new Date() || input.until && input.until < input.occurredAt) throw new Error("Confira a data e a vigência do registro da carteira.");
  if (input.kind !== "CONTRAINDICATION" && input.doseNumber < 1) throw new Error("Informe o número da dose.");
  if (input.kind === "RESCUE" && !input.sourceReference) throw new Error("Informe o documento ou serviço de origem do resgate histórico.");
  if (input.kind === "SCHEDULED" && (!input.scheduledFor || input.scheduledFor < input.occurredAt)) throw new Error("Informe a data de aprazamento posterior ao registro.");
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`VACCINATION_PATIENT:${input.patientId}`}))`);
    const patient = await vaccinePatientForAccess(tx, context, input.patientId);
    if (!(await tx.select({ id: vaccines.id }).from(vaccines).where(and(eq(vaccines.id, input.vaccineId), eq(vaccines.isActive, true))).limit(1))[0] || !(await tx.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, input.unitId), eq(healthUnits.isActive, true))).limit(1))[0]) throw new Error("Selecione imunobiológico e unidade ativos.");
    const professional = await vaccinationProfessional(tx, input.unitId, input.professionalId, context.user.employeeId);
    if (input.kind === "RESCUE" && patient.person.birthDate && vaccineCalendarAge(patient.person.birthDate, input.occurredAt, "DAY") < 0) throw new Error("A data da aplicação histórica não pode anteceder o nascimento.");
    return vaccinationRecord((await tx.insert(healthVaccinationCardEvents).values({ ...input, strategy: vaccineStrategy(input.strategy), professionalId: professional.id, actorUsuarioId: context.user.id }).returning())[0]);
  }, { timeoutMs: 5_000 });
}

export async function revokeVaccinationCardEvent(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ eventId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const identity = vaccinationRecord((await tx.select({ patientId: healthVaccinationCardEvents.patientId }).from(healthVaccinationCardEvents).where(eq(healthVaccinationCardEvents.id, input.eventId)).limit(1))[0]);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`VACCINATION_PATIENT:${identity.patientId}`}))`);
    const event = vaccinationRecord((await tx.select().from(healthVaccinationCardEvents).where(eq(healthVaccinationCardEvents.id, input.eventId)).limit(1))[0]);
    assertHealthUnitAccess(context.user, event.unitId);
    if (event.revokedAt) return event;
    return vaccinationRecord((await tx.update(healthVaccinationCardEvents).set({ revokedAt: new Date(), revokedReason: input.reason, revokedByUsuarioId: context.user.id }).where(eq(healthVaccinationCardEvents.id, event.id)).returning())[0]);
  }, { timeoutMs: 5_000 });
}

export async function getVaccinationCard(context: HealthVaccinationContext, patientId: string, at = new Date()) {
  const executor = context.database ?? databaseConnection.db;
  const patient = await vaccinePatientForAccess(executor, context, patientId);
  const units = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const [records, events, rules] = await Promise.all([
    readVaccinationCardRecords(executor, patientId, at, units),
    readVaccinationCardEvents(executor, patientId, at, units),
    listCurrentVaccinationRules(executor, at, true),
  ]);
  const history: VaccineHistory[] = [...records.map(record => ({ id: record.id, vaccineId: record.vaccineId, doseNumber: record.doseNumber, strategy: record.strategy, date: record.date, source: "APPLICATION" as const })), ...events.filter(event => event.kind === "RESCUE" && (!event.revokedAt || event.revokedAt > at)).map(event => ({ id: event.id, vaccineId: event.vaccineId, doseNumber: event.doseNumber, strategy: event.strategy, date: event.occurredAt, source: "RESCUE" as const }))];
  const rows = patient.person.birthDate ? rules.map(rule => ({ ...vaccineDoseStatus(rule, patient.person.birthDate!, history, events, at), vaccineName: rule.vaccine.name, code: rule.code, version: rule.version, sourceReference: rule.sourceReference })) : [];
  return { patient, records, events, rules, rows, configured: rules.length > 0, birthDateMissing: !patient.person.birthDate, regular: rules.length > 0 && !!patient.person.birthDate && !rows.some(row => row.pending), at };
}

export async function recordVaccineAdverseEvent(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ patientId: z.string().min(1), vaccineId: z.string().min(1), unitId: z.string().min(1), vaccinationRecordId: z.string().nullable(), occurredAt: z.coerce.date(), eventType: z.string().trim().min(1).max(200), lesionType: z.string().trim().min(1).max(200), lesionLocation: z.string().trim().min(1).max(200), severity: z.enum(["MILD", "MODERATE", "SEVERE"]), clinicalNotes: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.occurredAt > new Date()) throw new Error("O evento adverso não pode ser registrado como ocorrido no futuro.");
  return withDatabaseTransaction(connection, async tx => {
    const patient = await vaccinePatientForAccess(tx, context, input.patientId);
    if (patient.person.birthDate && vaccineCalendarAge(patient.person.birthDate, input.occurredAt, "DAY") < 0) throw new Error("A data do evento adverso não pode anteceder o nascimento.");
    if (!(await tx.select({ id: vaccines.id }).from(vaccines).where(eq(vaccines.id, input.vaccineId)).limit(1))[0] || !(await tx.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, input.unitId), eq(healthUnits.isActive, true))).limit(1))[0]) throw new Error("Selecione imunobiológico e unidade válidos.");
    if (input.vaccinationRecordId) {
      const record = vaccinationRecord((await tx.select().from(vaccinationRecords).where(eq(vaccinationRecords.id, input.vaccinationRecordId)).limit(1))[0]);
      assertHealthUnitAccess(context.user, record.unitId);
      if (record.patientId !== input.patientId || record.vaccineId !== input.vaccineId || record.date > input.occurredAt) throw new Error("A aplicação de origem deve corresponder ao paciente/imunobiológico e anteceder o evento.");
    }
    return vaccinationRecord((await tx.insert(healthVaccineAdverseEvents).values({ ...input, actorUsuarioId: context.user.id }).returning())[0]);
  }, { timeoutMs: 5_000 });
}

export async function addVaccineAdverseConduct(context: HealthVaccinationContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = z.object({ eventId: z.string().min(1), occurredAt: z.coerce.date(), professionalId: z.string().nullable(), conduct: z.string().trim().min(1).max(4000), narrative: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const event = vaccinationRecord((await tx.select().from(healthVaccineAdverseEvents).where(eq(healthVaccineAdverseEvents.id, input.eventId)).limit(1))[0]);
    assertHealthUnitAccess(context.user, event.unitId);
    if (input.occurredAt < event.occurredAt || input.occurredAt > new Date()) throw new Error("Confira a data da conduta do evento adverso.");
    const professional = await vaccinationProfessional(tx, event.unitId, input.professionalId, context.user.employeeId);
    return vaccinationRecord((await tx.insert(healthVaccineAdverseFollowups).values({ ...input, professionalId: professional.id, actorUsuarioId: context.user.id }).returning())[0]);
  }, { timeoutMs: 5_000 });
}
