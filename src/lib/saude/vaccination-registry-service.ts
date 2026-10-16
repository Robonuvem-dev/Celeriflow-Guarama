import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { vaccineCalendarAge, vaccineDoseStatus, vaccineStrategy, type VaccineHistory } from "./vaccination-card-policy";
type Tx = Prisma.TransactionClient;

export async function vaccinePatientForAccess(tx: Tx, context: AppContext, patientId: string) {
  const patient = await tx.patient.findUniqueOrThrow({ where: { id: patientId }, include: { person: true } });
  if (context.user.hasHealthAccessScope && !context.user.allowedHealthUnitIds?.includes(patient.referenceUnitId || "")) {
    const units = context.user.allowedHealthUnitIds || [];
    if (!await tx.vaccinationRecord.count({ where: { patientId, unitId: { in: units } } }) && !await tx.healthAppointment.count({ where: { patientId, unitId: { in: units } } })) throw new Error("Paciente fora das unidades e atendimentos autorizados.");
  }
  return patient;
}

export async function vaccinationProfessional(tx: Tx, unitId: string, professionalId: string | null, employeeId: string | null) {
  const professional = await tx.healthProfessional.findFirst({ where: { ...(professionalId ? { id: professionalId } : { employeeId: employeeId || "__SEM_PROFISSIONAL__" }), isActive: true, employee: { isActive: true }, OR: [{ unitId }, { assignments: { some: { unitId, isActive: true } } }] }, include: { employee: true, team: { select: { name: true, unitId: true } } } });
  if (!professional) throw new Error("Selecione profissional ativo vinculado à unidade da vacinação.");
  return { ...professional, team: professional.team?.unitId === unitId ? professional.team : null };
}

export async function saveVaccineManufacturer(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(200), rndsCode: z.string().trim().min(1).max(60).nullable(), sourceReference: z.string().trim().min(1).max(2000).nullable() }).strict().parse(raw);
  if (input.rndsCode && !input.sourceReference) throw new Error("Informe a fonte do código do fabricante RNDS.");
  const { id, ...data } = input;
  return id ? context.prisma.healthVaccineManufacturer.update({ where: { id }, data: { ...data, actorUsuarioId: context.user.id } }) : context.prisma.healthVaccineManufacturer.create({ data: { ...data, actorUsuarioId: context.user.id } });
}

export async function saveVaccineCodeMapping(context: AppContext, raw: unknown) {
  const input = z.object({ vaccineId: z.string().min(1), system: z.enum(["ESUS", "RNDS"]), code: z.string().trim().min(1).max(60), version: z.string().trim().min(1).max(100), sourceReference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    if (!await tx.vaccine.count({ where: { id: input.vaccineId, isActive: true } })) throw new Error("Selecione imunobiológico ativo.");
    const previous = await tx.healthVaccineCodeMapping.findUnique({ where: { vaccineId_system_version: { vaccineId: input.vaccineId, system: input.system, version: input.version } } });
    if (previous) { if (previous.code !== input.code || previous.sourceReference !== input.sourceReference) throw new Error("Registre nova versão do mapeamento para preservar a origem anterior."); return previous; }
    return tx.healthVaccineCodeMapping.create({ data: { ...input, actorUsuarioId: context.user.id } });
  });
}

export async function configureVaccineStock(context: AppContext, raw: unknown) {
  const input = z.object({ vaccineId: z.string().min(1), diluentMaterialId: z.string().nullable(), diluentUnitsPerVial: z.number().positive(), useAfterOpeningHours: z.number().positive().max(8760).nullable(), rndsAuthorized: z.boolean() }).strict().parse(raw);
  if (input.diluentMaterialId && !input.useAfterOpeningHours) throw new Error("Informe a validade após abertura/preparo do frasco que utiliza diluente.");
  const vaccine = await context.prisma.vaccine.findUniqueOrThrow({ where: { id: input.vaccineId }, include: { material: true } });
  if (!vaccine.material || !["UN", "DOSE", "DOSES"].includes(vaccine.material.unitOfMeasure.toUpperCase())) throw new Error("O imunobiológico deve usar estoque em doses; a entrada converterá frascos em doses.");
  if (input.diluentMaterialId && !await context.prisma.material.count({ where: { id: input.diluentMaterialId, isActive: true, healthProfile: { isActive: true, productKind: "DILUENT" } } })) throw new Error("Selecione produto ativo do tipo diluente.");
  const { vaccineId, ...data } = input;
  return context.prisma.vaccine.update({ where: { id: vaccineId }, data });
}

export async function saveVaccineCalendarRule(context: AppContext, raw: unknown) {
  const input = z.object({ code: z.string().trim().min(1).max(80), vaccineId: z.string().min(1), doseNumber: z.number().int().positive(), strategy: z.string().trim().min(1).max(100), ageUnit: z.enum(["DAY", "MONTH", "YEAR"]), minimumAge: z.number().int().nonnegative(), maximumAge: z.number().int().nonnegative().nullable(), minimumIntervalDays: z.number().int().nonnegative(), repeatEveryMonths: z.number().int().positive().nullable(), required: z.boolean(), enabled: z.boolean(), validFrom: z.coerce.date(), validUntil: z.coerce.date().nullable(), sourceReference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  if (input.maximumAge !== null && input.maximumAge < input.minimumAge || input.validUntil && input.validUntil < input.validFrom) throw new Error("Confira a faixa etária e a vigência do calendário.");
  return context.prisma.$transaction(async tx => {
    if (!await tx.vaccine.count({ where: { id: input.vaccineId, isActive: true } })) throw new Error("Selecione imunobiológico ativo.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`VACCINE_CALENDAR:${input.code}`}))`;
    const previous = await tx.healthVaccineCalendarRule.findFirst({ where: { code: input.code }, orderBy: { version: "desc" } });
    if (previous && input.validFrom <= previous.validFrom) throw new Error("Nova versão exige início de vigência posterior à versão anterior.");
    if (previous && (!previous.validUntil || previous.validUntil >= input.validFrom)) await tx.healthVaccineCalendarRule.update({ where: { id: previous.id }, data: { validUntil: new Date(input.validFrom.valueOf() - 1) } });
    return tx.healthVaccineCalendarRule.create({ data: { ...input, strategy: vaccineStrategy(input.strategy), version: (previous?.version || 0) + 1, actorUsuarioId: context.user.id } });
  });
}

export async function saveVaccineInteraction(context: AppContext, raw: unknown) {
  const input = z.object({ firstVaccineId: z.string().min(1), secondVaccineId: z.string().min(1), minimumIntervalDays: z.number().int().nonnegative(), allowSameDay: z.boolean(), sourceReference: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  if (input.firstVaccineId === input.secondVaccineId) throw new Error("Para doses do mesmo imunobiológico, configure o intervalo no calendário.");
  if (await context.prisma.vaccine.count({ where: { id: { in: [input.firstVaccineId, input.secondVaccineId] }, isActive: true } }) !== 2) throw new Error("Selecione dois imunobiológicos ativos.");
  const [firstVaccineId, secondVaccineId] = [input.firstVaccineId, input.secondVaccineId].sort();
  return context.prisma.healthVaccineInteraction.upsert({ where: { firstVaccineId_secondVaccineId: { firstVaccineId, secondVaccineId } }, create: { ...input, firstVaccineId, secondVaccineId, actorUsuarioId: context.user.id }, update: { minimumIntervalDays: input.minimumIntervalDays, allowSameDay: input.allowSameDay, sourceReference: input.sourceReference, actorUsuarioId: context.user.id } });
}

export async function saveVaccinationCampaign(context: AppContext, raw: unknown) {
  const input = z.object({ name: z.string().trim().min(1).max(200), startsAt: z.coerce.date(), endsAt: z.coerce.date(), publicInformation: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  if (input.endsAt < input.startsAt) throw new Error("O término da campanha deve ser posterior ao início.");
  return context.prisma.healthVaccinationCampaign.create({ data: { ...input, actorUsuarioId: context.user.id } });
}

export async function recordVaccinationCardEvent(context: AppContext, raw: unknown) {
  const input = z.object({ patientId: z.string().min(1), vaccineId: z.string().min(1), unitId: z.string().min(1), professionalId: z.string().nullable(), kind: z.enum(["INDICATION", "RESCUE", "SCHEDULED", "CONTRAINDICATION"]), doseNumber: z.number().int().nonnegative(), strategy: z.string().trim().min(1).max(100), occurredAt: z.coerce.date(), scheduledFor: z.coerce.date().nullable(), until: z.coerce.date().nullable(), reason: z.string().trim().min(1).max(4000), sourceReference: z.string().trim().max(2000).nullable(), lotNumber: z.string().trim().max(80).nullable() }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.occurredAt > new Date() || input.until && input.until < input.occurredAt) throw new Error("Confira a data e a vigência do registro da carteira.");
  if (input.kind !== "CONTRAINDICATION" && input.doseNumber < 1) throw new Error("Informe o número da dose.");
  if (input.kind === "RESCUE" && !input.sourceReference) throw new Error("Informe o documento ou serviço de origem do resgate histórico.");
  if (input.kind === "SCHEDULED" && (!input.scheduledFor || input.scheduledFor < input.occurredAt)) throw new Error("Informe a data de aprazamento posterior ao registro.");
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`VACCINATION_PATIENT:${input.patientId}`}))`;
    const patient = await vaccinePatientForAccess(tx, context, input.patientId);
    if (!await tx.vaccine.count({ where: { id: input.vaccineId, isActive: true } }) || !await tx.healthUnit.count({ where: { id: input.unitId, isActive: true } })) throw new Error("Selecione imunobiológico e unidade ativos.");
    const professional = await vaccinationProfessional(tx, input.unitId, input.professionalId, context.user.employeeId);
    if (input.kind === "RESCUE" && patient.person.birthDate && vaccineCalendarAge(patient.person.birthDate, input.occurredAt, "DAY") < 0) throw new Error("A data da aplicação histórica não pode anteceder o nascimento.");
    return tx.healthVaccinationCardEvent.create({ data: { ...input, strategy: vaccineStrategy(input.strategy), professionalId: professional.id, actorUsuarioId: context.user.id } });
  });
}

export async function revokeVaccinationCardEvent(context: AppContext, raw: unknown) {
  const input = z.object({ eventId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const identity = await tx.healthVaccinationCardEvent.findUniqueOrThrow({ where: { id: input.eventId }, select: { patientId: true } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`VACCINATION_PATIENT:${identity.patientId}`}))`;
    const event = await tx.healthVaccinationCardEvent.findUniqueOrThrow({ where: { id: input.eventId } });
    assertHealthUnitAccess(context.user, event.unitId);
    if (event.revokedAt) return event;
    return tx.healthVaccinationCardEvent.update({ where: { id: event.id }, data: { revokedAt: new Date(), revokedReason: input.reason, revokedByUsuarioId: context.user.id } });
  });
}

export async function getVaccinationCard(context: AppContext, patientId: string, at = new Date()) {
  const patient = await vaccinePatientForAccess(context.prisma, context, patientId);
  const scope = context.user.hasHealthAccessScope ? { unitId: { in: context.user.allowedHealthUnitIds || [] } } : {};
  const [records, events, rules] = await Promise.all([
    context.prisma.vaccinationRecord.findMany({ where: { patientId, date: { lte: at }, ...scope }, include: { vaccine: true, professional: { include: { employee: true } }, unit: true, indicationEvent: { include: { professional: { include: { employee: true } } } } }, orderBy: { date: "desc" } }),
    context.prisma.healthVaccinationCardEvent.findMany({ where: { patientId, occurredAt: { lte: at }, ...scope }, include: { vaccine: true, professional: { include: { employee: true } } }, orderBy: { createdAt: "desc" } }),
    context.prisma.healthVaccineCalendarRule.findMany({ where: { enabled: true, validFrom: { lte: at }, OR: [{ validUntil: null }, { validUntil: { gte: at } }], vaccine: { isActive: true } }, include: { vaccine: true }, orderBy: [{ vaccine: { name: "asc" } }, { doseNumber: "asc" }] }),
  ]);
  const history: VaccineHistory[] = [...records.map(record => ({ id: record.id, vaccineId: record.vaccineId, doseNumber: record.doseNumber, strategy: record.strategy, date: record.date, source: "APPLICATION" as const })), ...events.filter(event => event.kind === "RESCUE" && (!event.revokedAt || event.revokedAt > at)).map(event => ({ id: event.id, vaccineId: event.vaccineId, doseNumber: event.doseNumber, strategy: event.strategy, date: event.occurredAt, source: "RESCUE" as const }))];
  const rows = patient.person.birthDate ? rules.map(rule => ({ ...vaccineDoseStatus(rule, patient.person.birthDate!, history, events, at), vaccineName: rule.vaccine.name, code: rule.code, version: rule.version, sourceReference: rule.sourceReference })) : [];
  return { patient, records, events, rules, rows, configured: rules.length > 0, birthDateMissing: !patient.person.birthDate, regular: rules.length > 0 && !!patient.person.birthDate && !rows.some(row => row.pending), at };
}

export async function recordVaccineAdverseEvent(context: AppContext, raw: unknown) {
  const input = z.object({ patientId: z.string().min(1), vaccineId: z.string().min(1), unitId: z.string().min(1), vaccinationRecordId: z.string().nullable(), occurredAt: z.coerce.date(), eventType: z.string().trim().min(1).max(200), lesionType: z.string().trim().min(1).max(200), lesionLocation: z.string().trim().min(1).max(200), severity: z.enum(["MILD", "MODERATE", "SEVERE"]), clinicalNotes: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.occurredAt > new Date()) throw new Error("O evento adverso não pode ser registrado como ocorrido no futuro.");
  return context.prisma.$transaction(async tx => {
    const patient = await vaccinePatientForAccess(tx, context, input.patientId);
    if (patient.person.birthDate && vaccineCalendarAge(patient.person.birthDate, input.occurredAt, "DAY") < 0) throw new Error("A data do evento adverso não pode anteceder o nascimento.");
    if (!await tx.vaccine.count({ where: { id: input.vaccineId } }) || !await tx.healthUnit.count({ where: { id: input.unitId, isActive: true } })) throw new Error("Selecione imunobiológico e unidade válidos.");
    if (input.vaccinationRecordId) {
      const record = await tx.vaccinationRecord.findUniqueOrThrow({ where: { id: input.vaccinationRecordId } });
      assertHealthUnitAccess(context.user, record.unitId);
      if (record.patientId !== input.patientId || record.vaccineId !== input.vaccineId || record.date > input.occurredAt) throw new Error("A aplicação de origem deve corresponder ao paciente/imunobiológico e anteceder o evento.");
    }
    return tx.healthVaccineAdverseEvent.create({ data: { ...input, actorUsuarioId: context.user.id } });
  });
}

export async function addVaccineAdverseConduct(context: AppContext, raw: unknown) {
  const input = z.object({ eventId: z.string().min(1), occurredAt: z.coerce.date(), professionalId: z.string().nullable(), conduct: z.string().trim().min(1).max(4000), narrative: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const event = await tx.healthVaccineAdverseEvent.findUniqueOrThrow({ where: { id: input.eventId } });
    assertHealthUnitAccess(context.user, event.unitId);
    if (input.occurredAt < event.occurredAt || input.occurredAt > new Date()) throw new Error("Confira a data da conduta do evento adverso.");
    const professional = await vaccinationProfessional(tx, event.unitId, input.professionalId, context.user.employeeId);
    return tx.healthVaccineAdverseFollowup.create({ data: { ...input, professionalId: professional.id, actorUsuarioId: context.user.id } });
  });
}
