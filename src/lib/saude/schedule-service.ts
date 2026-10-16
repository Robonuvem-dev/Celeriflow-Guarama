import { z } from "zod";
import { updateWaitlistWithEvent } from "./waitlist-events";
import type { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { HealthOperationError, runHealthTransaction } from "./appointment-service";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { assertPatientRegistrationCurrent } from "./patient-registration-service";
import { ageOn } from "./patient-registration-policy";
import { getHealthAccessAt } from "./health-access-policy";
import { professionalAcceptsTime, professionalBookingWindows } from "./professional-booking-service";

type Tx = Prisma.TransactionClient;
const ACTIVE_BOOKING = ["Agendado", "Confirmado", "Aguardando", "Em Atendimento", "Atendido"];

const scheduleSchema = z.object({
  id: z.string().optional(),
  agreementId: z.string().nullable().optional(), procedureId: z.string().nullable().optional(), locationUnitId: z.string().nullable().optional(),
  validFrom: z.coerce.date().nullable().optional(), validUntil: z.coerce.date().nullable().optional(),
  genderRestriction: z.string().nullable().optional(), minAge: z.number().int().min(0).nullable().optional(), maxAge: z.number().int().min(0).nullable().optional(),
  allowHolidays: z.boolean().default(false), requirePresenceConfirmation: z.boolean().default(false), releaseAbsenceSlot: z.boolean().default(true),
  fixedReceiptTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), slotMinutes: z.number().int().min(1).max(480).default(15),
  kind: z.enum(["FIXO", "DIARIO"]).default("FIXO"),
  unitId: z.string().min(1),
  specialtyId: z.string().min(1).nullable().optional(),
  professionalId: z.string().min(1).nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
  providerSupplierId: z.string().min(1).nullable().optional(),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  totalSlots: z.number().int().positive().max(500),
}).strict();

export async function saveSchedule(context: AppContext, raw: unknown) {
  const input = scheduleSchema.parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.kind === "FIXO" && input.weekday == null) throw new HealthOperationError("Cronograma fixo exige o dia da semana.");
  if (input.kind === "DIARIO" && !input.date) throw new HealthOperationError("Cronograma diário exige a data.");
  return runHealthTransaction(context, async tx => {
    const unit = await tx.healthUnit.findFirst({ where: { id: input.unitId, isActive: true }, select: { id: true } });
    if (!unit) throw new HealthOperationError("Unidade de saúde ativa não encontrada.");
    if (input.professionalId && !await tx.healthProfessional.findFirst({ where: { id: input.professionalId, isActive: true }, select: { id: true } })) throw new HealthOperationError("Profissional ativo não encontrado.");
    if (input.groupId && !await tx.healthSchedulingGroup.findFirst({ where: { id: input.groupId, unitId: input.unitId, isActive: true }, select: { id: true } })) throw new HealthOperationError("Grupo de agendamento inválido para a unidade.");
    if (input.validFrom && input.validUntil && input.validUntil < input.validFrom || input.minAge != null && input.maxAge != null && input.maxAge < input.minAge) throw new HealthOperationError("Confira vigência e faixas etárias da agenda.");
    if (input.agreementId && !await tx.healthCareCoverage.count({ where: { agreementId: input.agreementId, unitId: input.unitId, isActive: true, ...(input.specialtyId ? { specialtyId: input.specialtyId } : {}), ...(input.procedureId ? { procedureId: input.procedureId } : {}) } })) throw new HealthOperationError("Convênio não cobre os procedimentos/especialidade desta unidade.");
    const data = { kind: input.kind, unitId: input.unitId, specialtyId: input.specialtyId || null, professionalId: input.professionalId || null, groupId: input.groupId || null, providerSupplierId: input.providerSupplierId || null, weekday: input.weekday ?? null, date: input.date ? new Date(`${input.date}T12:00:00`) : null, startTime: input.startTime || null, endTime: input.endTime || null, totalSlots: input.totalSlots, agreementId: input.agreementId || null, procedureId: input.procedureId || null, locationUnitId: input.locationUnitId || null, validFrom: input.validFrom, validUntil: input.validUntil, genderRestriction: input.genderRestriction || null, minAge: input.minAge, maxAge: input.maxAge, allowHolidays: input.allowHolidays, requirePresenceConfirmation: input.requirePresenceConfirmation, releaseAbsenceSlot: input.releaseAbsenceSlot, fixedReceiptTime: input.fixedReceiptTime || null, slotMinutes: input.slotMinutes };
    if (input.id) { const old = await tx.healthCareSchedule.findUniqueOrThrow({ where: { id: input.id } }); assertHealthUnitAccess(context.user, old.unitId); }
    const created = input.id ? await tx.healthCareSchedule.update({ where: { id: input.id }, data, select: { id: true } }) : await tx.healthCareSchedule.create({ data: { ...data, createdByUsuarioId: context.user.id }, select: { id: true } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_SCHEDULE", targetId: created.id });
    return created;
  });
}

export async function transitionSchedule(context: AppContext, scheduleId: string, status: string, blockReason?: string | null) {
  const target = status.trim();
  if (!["Ativo", "Bloqueado", "Cancelado"].includes(target)) throw new HealthOperationError("Situação do cronograma inválida.");
  const schedule = await context.prisma.healthCareSchedule.findUnique({ where: { id: scheduleId }, select: { id: true, unitId: true } });
  if (!schedule) throw new HealthOperationError("Cronograma não encontrado.");
  assertHealthUnitAccess(context.user, schedule.unitId);
  if (target === "Bloqueado" && !(blockReason || "").trim()) throw new HealthOperationError("Informe o motivo do bloqueio.");
  return context.prisma.$transaction(async tx => {
    const updated = await tx.healthCareSchedule.update({ where: { id: scheduleId }, data: { status: target, blockReason: target === "Bloqueado" ? (blockReason || "").trim() : null }, select: { id: true } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_SCHEDULE", targetId: scheduleId });
    return updated;
  });
}

export async function scheduleAvailability(tx: Tx, scheduleId: string, excludeAppointmentId?: string, date?: Date) {
  const schedule = await tx.healthCareSchedule.findUnique({ where: { id: scheduleId }, select: { id: true, totalSlots: true, status: true, blockReason: true, releaseAbsenceSlot: true } });
  if (!schedule) throw new HealthOperationError("Cronograma não encontrado.");
  const instant = date ? getHealthAccessAt(date) : null;
  const start = instant ? new Date(`${instant.date}T00:00:00-03:00`) : null;
  const occupied = await tx.healthAppointment.count({ where: { scheduleId, status: { in: schedule.releaseAbsenceSlot ? ACTIVE_BOOKING : [...ACTIVE_BOOKING, "Faltou"] }, ...(start ? { date: { gte: start, lt: new Date(start.valueOf() + 86400000) } } : {}), ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}) } });
  return { total: schedule.totalSlots, occupied, free: schedule.totalSlots - occupied, status: schedule.status, blockReason: schedule.blockReason };
}

export async function assertSlotAvailable(tx: Tx, scheduleId: string, excludeAppointmentId?: string, date?: Date) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scheduleId}))`;
  const availability = await scheduleAvailability(tx, scheduleId, excludeAppointmentId, date);
  if (availability.status === "Cancelado") throw new HealthOperationError("O cronograma foi cancelado.");
  if (availability.status === "Bloqueado") throw new HealthOperationError(`O cronograma está bloqueado: ${availability.blockReason || "sem motivo informado"}.`);
  if (availability.free <= 0) throw new HealthOperationError("Não há vagas disponíveis neste cronograma (overbooking bloqueado).");
  if (date && await tx.healthAppointment.count({ where: { scheduleId, date, ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}), OR: [{ status: { in: ACTIVE_BOOKING } }, { status: "Faltou", schedule: { releaseAbsenceSlot: false } }] } })) throw new HealthOperationError("O horário selecionado já está ocupado nesta agenda.");
  return availability;
}

async function assertNoHoliday(tx: Tx, date: Date) {
  const day = new Date(date); day.setHours(0, 0, 0, 0);
  const next = new Date(day); next.setDate(next.getDate() + 1);
  const holiday = await tx.calendarEvent.findFirst({ where: { isHoliday: true, date: { gte: day, lt: next } }, select: { title: true } });
  if (holiday) throw new HealthOperationError(`Agendamento bloqueado: ${holiday.title}.`);
}

async function assertCompletePatient(tx: Tx, patientId: string) {
  const patient = await tx.patient.findFirst({ where: { id: patientId }, select: { cns: true, person: { select: { cpf: true, fullName: true } } } });
  if (!patient) throw new HealthOperationError("Paciente não encontrado.");
  if (!patient.cns) throw new HealthOperationError(`Cadastro incompleto de ${patient.person.fullName}: informe o CNS para agendar.`);
}

async function assertNoDuplicateActive(tx: Tx, patientId: string, unitId: string, specialtyId: string | null, specialty: string | null, excludeAppointmentId?: string) {
  const clash = await tx.healthAppointment.findFirst({
    where: {
      patientId, unitId, status: { in: ["Agendado", "Confirmado", "Aguardando"] },
      ...(specialtyId ? { specialtyId } : specialty ? { specialty } : {}),
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { id: true, date: true },
  });
  if (clash) throw new HealthOperationError(`O paciente já possui agendamento ativo nesta especialidade/unidade (${clash.date.toLocaleDateString("pt-BR")}).`);
}

// Regras de negócio aplicadas a todo agendamento programado.
export async function assertBookingRules(tx: Tx, input: { patientId: string; unitId: string; specialtyId?: string | null; specialty?: string | null; scheduleId?: string | null; date: Date; excludeAppointmentId?: string }) {
  await assertPatientRegistrationCurrent(tx, input.patientId, input.unitId);
  const schedule = input.scheduleId ? await tx.healthCareSchedule.findUniqueOrThrow({ where: { id: input.scheduleId } }) : null;
  if (!schedule?.allowHolidays) await assertNoHoliday(tx, input.date);
  await assertCompletePatient(tx, input.patientId);
  await assertNoDuplicateActive(tx, input.patientId, input.unitId, input.specialtyId || null, input.specialty || null, input.excludeAppointmentId);
  if (schedule) {
    if (schedule.unitId !== input.unitId || schedule.specialtyId && schedule.specialtyId !== input.specialtyId) throw new HealthOperationError("Unidade ou especialidade incompatível com a agenda.");
    const instant = getHealthAccessAt(input.date);
    if (schedule.validFrom && instant.date < schedule.validFrom.toISOString().slice(0, 10) || schedule.validUntil && instant.date > schedule.validUntil.toISOString().slice(0, 10)) throw new HealthOperationError("Data fora da vigência da agenda.");
    if (schedule.kind === "FIXO" && schedule.weekday !== instant.weekday || schedule.kind === "DIARIO" && schedule.date?.toISOString().slice(0, 10) !== instant.date) throw new HealthOperationError("Dia incompatível com a agenda selecionada.");
    if (schedule.startTime && instant.time < schedule.startTime || schedule.endTime && instant.time >= schedule.endTime) throw new HealthOperationError("Horário fora do expediente da agenda.");
    if (schedule.startTime) { const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)); if ((minutes(instant.time) - minutes(schedule.startTime)) % schedule.slotMinutes !== 0) throw new HealthOperationError("Selecione um horário correspondente ao intervalo da agenda."); }
    const patient = await tx.patient.findUniqueOrThrow({ where: { id: input.patientId }, include: { person: true } });
    const age = ageOn(patient.person.birthDate, input.date);
    if (schedule.genderRestriction && schedule.genderRestriction !== patient.person.gender || schedule.minAge != null && (age === null || age < schedule.minAge) || schedule.maxAge != null && (age === null || age > schedule.maxAge)) throw new HealthOperationError("Paciente fora dos critérios de sexo ou idade da agenda.");
    if (await tx.healthScheduleBlock.count({ where: { scheduleId: schedule.id, startsAt: { lte: input.date }, endsAt: { gt: input.date } } })) throw new HealthOperationError("Período bloqueado nesta agenda.");
    if (schedule.agreementId && !await tx.healthCareCoverage.count({ where: { agreementId: schedule.agreementId, unitId: input.unitId, isActive: true, validFrom: { lte: input.date }, OR: [{ validUntil: null }, { validUntil: { gte: input.date } }], ...(input.specialtyId ? { specialtyId: input.specialtyId } : {}), ...(schedule.procedureId ? { procedureId: schedule.procedureId } : {}), agreement: { isActive: true, validFrom: { lte: input.date }, OR: [{ validUntil: null }, { validUntil: { gte: input.date } }] } } })) throw new HealthOperationError("Sem cobertura assistencial vigente para a data e unidade.");
    await assertSlotAvailable(tx, schedule.id, input.excludeAppointmentId, input.date);
  }
}

const remanejoSchema = z.object({ appointmentId: z.string().min(1), date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), professionalId: z.string().min(1).nullable().optional(), reason: z.string().trim().min(3).max(1000) }).strict();

function parseBrazilDateTime(value: string) {
  const parsed = new Date(`${value}:00`);
  if (Number.isNaN(parsed.getTime())) throw new HealthOperationError("Informe data e horário válidos.");
  return parsed;
}

export async function remanejarAppointment(context: AppContext, raw: unknown) {
  const input = remanejoSchema.parse(raw);
  const date = parseBrazilDateTime(input.date);
  return runHealthTransaction(context, async tx => {
    const appointment = await tx.healthAppointment.findUnique({ where: { id: input.appointmentId }, select: { id: true, date: true, status: true, patientId: true, unitId: true, professionalId: true, specialtyId: true, specialty: true, scheduleId: true } });
    if (!appointment) throw new HealthOperationError("Agendamento não encontrado.");
    assertHealthUnitAccess(context.user, appointment.unitId);
    if (!["Agendado", "Confirmado"].includes(appointment.status)) throw new HealthOperationError("Somente agendamentos pendentes podem ser remanejados.");
    await assertBookingRules(tx, { patientId: appointment.patientId, unitId: appointment.unitId, specialtyId: appointment.specialtyId, specialty: appointment.specialty, scheduleId: appointment.scheduleId, date, excludeAppointmentId: appointment.id });
    const scheduleProfessional = appointment.scheduleId ? await tx.healthCareSchedule.findUniqueOrThrow({ where: { id: appointment.scheduleId }, select: { professionalId: true } }) : null;
    const professionalId = input.professionalId || appointment.professionalId || scheduleProfessional?.professionalId || null;
    if (scheduleProfessional?.professionalId && scheduleProfessional.professionalId !== professionalId) throw new HealthOperationError("O profissional deve corresponder ao responsável da agenda.");
    if (professionalId && !professionalAcceptsTime(await professionalBookingWindows(tx, { professionalId, unitId: appointment.unitId, specialtyId: appointment.specialtyId, date }), date)) throw new HealthOperationError("Horário fora da vigência ou expediente do profissional.");
    for (const key of [`HEALTH_BOOKING_PATIENT:${appointment.patientId}:${date.toISOString()}`, ...(professionalId ? [`HEALTH_BOOKING_PROFESSIONAL:${professionalId}:${date.toISOString()}`] : [])].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const clash = await tx.healthAppointment.findFirst({ where: { id: { not: appointment.id }, date, status: { notIn: ["Cancelado", "Faltou"] }, OR: [{ patientId: appointment.patientId }, ...(professionalId ? [{ professionalId }] : [])] }, select: { id: true } });
    if (clash) throw new HealthOperationError("O paciente ou profissional já possui agendamento ativo nesse horário.");
    const from = appointment.date.toLocaleString("pt-BR");
    await tx.healthAppointment.update({ where: { id: appointment.id }, data: { date, professionalId } });
    await tx.healthAppointmentEvent.create({ data: { appointmentId: appointment.id, eventType: "REMANEJADO", fromStatus: appointment.status, toStatus: appointment.status, notes: `De ${from} para ${date.toLocaleString("pt-BR")}. Motivo: ${input.reason}`, actorUsuarioId: context.user.id } });
    return { id: appointment.id };
  });
}

const waitlistSchema = z.object({ patientId: z.string().min(1), unitId: z.string().nullable().optional(), procedureId: z.string().nullable().optional(), programName: z.string().trim().max(200).nullable().optional(), specialtyId: z.string().min(1).nullable().optional(), scheduleId: z.string().min(1).nullable().optional(), priority: z.enum(["Normal", "Prioridade", "Urgência"]).default("Normal"), notes: z.string().trim().max(1000).nullable().optional() }).strict();

export async function addWaitlist(context: AppContext, raw: unknown) {
  const input = waitlistSchema.parse(raw);
  const patient = await context.prisma.patient.findFirst({ where: { id: input.patientId, status: "Ativo" }, select: { id: true, referenceUnitId: true } });
  if (!patient) throw new HealthOperationError("Paciente ativo não encontrado.");
  if (patient.referenceUnitId) assertHealthUnitAccess(context.user, patient.referenceUnitId);
  if (input.scheduleId) {
    const schedule = await context.prisma.healthCareSchedule.findUnique({ where: { id: input.scheduleId }, select: { unitId: true } });
    if (!schedule) throw new HealthOperationError("Cronograma não encontrado.");
    assertHealthUnitAccess(context.user, schedule.unitId);
  }
  const unitId = input.unitId || patient.referenceUnitId;
  if (unitId) assertHealthUnitAccess(context.user, unitId);
  else if (context.user.hasHealthAccessScope) throw new HealthOperationError("Informe a unidade responsável pela espera.");
  if (input.procedureId && !await context.prisma.healthSusProcedure.count({ where: { id: input.procedureId, isActive: true } })) throw new HealthOperationError("Procedimento ativo não encontrado.");
  return context.prisma.healthWaitlist.create({ data: { patientId: input.patientId, unitId, procedureId: input.procedureId || null, programName: input.programName || null, specialtyId: input.specialtyId || null, scheduleId: input.scheduleId || null, priority: input.priority, notes: input.notes || null, createdByUsuarioId: context.user.id, events: { create: { eventType: "ENTERED", toStatus: "Aguardando", notes: input.notes || null, actorUsuarioId: context.user.id } } }, select: { id: true } });
}

export async function transitionWaitlist(context: AppContext, waitlistId: string, status: string, convert?: { date: string; unitId: string; professionalId?: string | null }) {
  const target = status.trim();
  if (!["Chamado", "Convertido", "Cancelado"].includes(target)) throw new HealthOperationError("Situação da espera inválida.");
  const entry = await context.prisma.healthWaitlist.findUnique({ where: { id: waitlistId }, include: { patient: { select: { referenceUnitId: true } }, schedule: { select: { unitId: true } } } });
  if (!entry) throw new HealthOperationError("Registro de espera não encontrado.");
  if (!["Aguardando", "Chamado"].includes(entry.status) && entry.status !== target && target !== "Cancelado") throw new HealthOperationError("Somente esperas liberadas podem ser chamadas ou convertidas.");
  const ownerUnitId = entry.unitId || entry.schedule?.unitId || entry.patient.referenceUnitId;
  if (ownerUnitId) assertHealthUnitAccess(context.user, ownerUnitId);
  else if (context.user.hasHealthAccessScope) throw new HealthOperationError("Espera sem unidade responsável acessível.");
  if (entry.regulationRequestId && ["Convertido", "Cancelado"].includes(target)) {
    const { transitionRegulationRequest } = await import("./regulation-service");
    await transitionRegulationRequest(context, entry.regulationRequestId, target === "Convertido" ? "AGENDADA" : "CANCELADA", { scheduledAt: convert?.date ? `${convert.date}:00-03:00` : null, appointmentUnitId: convert?.unitId || null, executorProfessionalId: convert?.professionalId || null, scheduleId: entry.scheduleId, notes: target === "Cancelado" ? "Cancelamento pela lista de espera" : null });
    return { id: entry.id };
  }
  return runHealthTransaction(context, async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthWaitlist" WHERE id=${entry.id} FOR UPDATE`;
    const current = await tx.healthWaitlist.findUniqueOrThrow({ where: { id: entry.id } });
    const currentOwnerUnitId = current.unitId || ownerUnitId;
    if (currentOwnerUnitId) assertHealthUnitAccess(context.user, currentOwnerUnitId);
    else if (context.user.hasHealthAccessScope) throw new HealthOperationError("Espera sem unidade responsável acessível.");
    if (current.status === target) return { id: current.id };
    if (!["Aguardando", "Chamado"].includes(current.status) && target !== "Cancelado") throw new HealthOperationError("Somente esperas liberadas podem ser chamadas ou convertidas.");
    if (target === "Convertido") {
    if (!convert?.date || !convert?.unitId) throw new HealthOperationError("Informe data e unidade para converter a espera em agendamento.");
    const { createHealthAppointmentInTransaction } = await import("./appointment-service");
    const appointment = await createHealthAppointmentInTransaction(context, tx, { patientId: entry.patientId, unitId: convert.unitId, professionalId: convert.professionalId || null, date: convert.date, specialtyId: entry.specialtyId, priority: entry.priority as "Normal" | "Prioridade" | "Urgência", scheduleId: entry.scheduleId, specialty: null, schedulingGroupId: null, serviceId: null, visitType: null });
    await updateWaitlistWithEvent(tx, { id: entry.id }, { status: target, appointmentId: appointment.id }, { type: "BOOKED", actorUsuarioId: context.user.id });
    return { id: entry.id };
    }
    await updateWaitlistWithEvent(tx, { id: entry.id }, { status: target }, { type: target === "Chamado" ? "CALLED" : "CANCELLED", actorUsuarioId: context.user.id });
    return { id: entry.id };
  });
}
