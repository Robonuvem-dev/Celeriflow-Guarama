import { and, eq, inArray, isNull, notInArray, ne, or, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { getPostgresError } from "@/db/errors";
import { healthAppointments, healthAppointmentEvents, healthCareSchedules, healthTriages } from "@/db/schema/health-agenda";
import { medicalRecords, healthSpecialtyProcedureRules } from "@/db/schema/health-care";
import { healthProfessionals, healthProfessionalAssignments, healthUnits } from "@/db/schema/health-workforce";
import { patients } from "@/db/schema/health-registration";
import { employees } from "@/db/schema/administration";
import { assertPatientRegistrationCurrent } from "./patient-registration-service";
import { registerProductionFactTx } from "./production-service";
import { captureCareIndicatorContext } from "./indicator-context";
import { syncRegulationAppointment } from "./regulation-agenda-service";
import { professionalAcceptsTime, professionalBookingWindows } from "./professional-booking-service";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import {
  healthAppointmentCompletionSchema,
  healthAppointmentCreateSchema,
  healthAppointmentTransitionSchema,
  healthTriageInputSchema,
  spontaneousCareCreateSchema,
} from "./contract";
import {
  assertHealthAppointmentCanBeCompletedAt,
  assertHealthAppointmentCanBeCompleted,
  assertHealthAppointmentTransition,
  parseBrazilDateTime,
} from "./appointment-policy";

type Tx = DatabaseTransaction;

import { HealthOperationError, runHealthTransaction } from "./health-transaction";
export { HealthOperationError, runHealthTransaction } from "./health-transaction";

async function requireActiveAppointmentReferences(tx: Tx, patientId: string, unitId: string, professionalId: string | null) {
  const [patient, unit] = await Promise.all([
    tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, patientId), eq(patients.status, "Ativo"))).limit(1).then(rows => rows[0]),
    tx.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, unitId), eq(healthUnits.isActive, true))).limit(1).then(rows => rows[0]),
  ]);

  if (!patient) throw new HealthOperationError("Paciente nao encontrado ou inativo.");
  if (!unit) throw new HealthOperationError("Unidade de saude nao encontrada ou inativa.");

  if (!professionalId) return null;
  const [professional] = await tx.select({ id: healthProfessionals.id, unitId: healthProfessionals.unitId, employee: { isActive: employees.isActive } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.id, professionalId), eq(healthProfessionals.isActive, true))).limit(1);
  if (!professional || !professional.employee.isActive) throw new HealthOperationError("Profissional nao encontrado ou inativo.");
  if (professional.unitId !== unitId && !(await tx.select({ id: healthProfessionalAssignments.id }).from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, professionalId), eq(healthProfessionalAssignments.unitId, unitId), eq(healthProfessionalAssignments.isActive, true))).limit(1)).length) {
    throw new HealthOperationError("O profissional selecionado deve pertencer a unidade do agendamento.");
  }
  return professional;
}

async function patientMunicipalitySnapshot(tx: Tx, patientId: string) {
  const place = (await tx.execute<{ city: string | null; state: string | null }>(sql`SELECT n.city, n.state FROM "Patient" p JOIN "Address" a ON a."personId"=p."personId" LEFT JOIN "Neighborhood" n ON n.id=a."neighborhoodId" WHERE p.id=${patientId} AND a."canonicalAddressId" IS NULL ORDER BY a."createdAt" DESC LIMIT 1`)).rows[0];
  return { municipalitySnapshot: place?.city || null, stateSnapshot: place?.state || null };
}

async function validateSchedulingReferences(tx: Tx, unitId: string, schedulingGroupId: string | null, specialtyId: string | null, serviceId: string | null) {
  if (specialtyId && !(await tx.execute(sql`SELECT id FROM "HealthUnitSpecialty" WHERE "unitId"=${unitId} AND "specialtyId"=${specialtyId} AND "isActive"=true LIMIT 1`)).rows.length) throw new HealthOperationError("Especialidade não está ativa na unidade selecionada.");
  if (serviceId && !(await tx.execute(sql`SELECT id FROM "HealthServiceAssignment" WHERE "unitId"=${unitId} AND "serviceId"=${serviceId} AND "isActive"=true LIMIT 1`)).rows.length) throw new HealthOperationError("Serviço não está ativo na unidade selecionada.");
  if (schedulingGroupId) {
    const group = (await tx.execute<{ specialtyGroupId: string }>(sql`SELECT "specialtyGroupId" FROM "HealthSchedulingGroup" WHERE id=${schedulingGroupId} AND "unitId"=${unitId} AND "isActive"=true LIMIT 1`)).rows[0];
    if (!group) throw new HealthOperationError("Grupo de agendamento não pertence à unidade selecionada.");
    if (specialtyId && !(await tx.execute(sql`SELECT id FROM "HealthSpecialtyGroupMember" WHERE "groupId"=${group.specialtyGroupId} AND "specialtyId"=${specialtyId} LIMIT 1`)).rows.length) throw new HealthOperationError("Especialidade não pertence ao grupo de especialidades do agendamento.");
    if (serviceId && !(await tx.execute(sql`SELECT id FROM "HealthSpecialtyGroupService" WHERE "groupId"=${group.specialtyGroupId} AND "serviceId"=${serviceId} LIMIT 1`)).rows.length) throw new HealthOperationError("Serviço não pertence ao grupo de especialidades do agendamento.");
  }
}

export async function createHealthAppointment(context: AppContext, raw: unknown) {
  return runHealthTransaction(context, tx => createHealthAppointmentInTransaction(context, tx, raw));
}

export async function createHealthAppointmentInTransaction(context: AppContext, tx: Tx, raw: unknown) {
  const input = healthAppointmentCreateSchema.parse(raw);
  const date = parseBrazilDateTime(input.date);
  assertHealthUnitAccess(context.user, input.unitId);

    let agreementIdSnapshot: string | null = null;
    if (input.scheduleId) {
      const [schedule] = await tx.select({ professionalId: healthCareSchedules.professionalId, agreementId: healthCareSchedules.agreementId }).from(healthCareSchedules).where(eq(healthCareSchedules.id, input.scheduleId)).limit(1);
      if (!schedule) throw new HealthOperationError("Cronograma não encontrado.");
      agreementIdSnapshot = schedule.agreementId;
      if (schedule.professionalId && input.professionalId && schedule.professionalId !== input.professionalId) throw new HealthOperationError("O profissional deve corresponder ao responsável da agenda.");
      input.professionalId ||= schedule.professionalId;
    }
    if (input.professionalId && !professionalAcceptsTime(await professionalBookingWindows(tx, { professionalId: input.professionalId, unitId: input.unitId, specialtyId: input.specialtyId, date }), date)) throw new HealthOperationError("Horário fora da vigência ou expediente do profissional na unidade/especialidade.");

    await requireActiveAppointmentReferences(tx, input.patientId, input.unitId, input.professionalId);
    await validateSchedulingReferences(tx, input.unitId, input.schedulingGroupId, input.specialtyId, input.serviceId);
     const { assertBookingRules } = await import("./schedule-service");
     await assertBookingRules(tx, { patientId: input.patientId, unitId: input.unitId, specialtyId: input.specialtyId || null, specialty: input.specialty || null, scheduleId: input.scheduleId || null, date });
      for (const key of [`HEALTH_BOOKING_PATIENT:${input.patientId}:${date.toISOString()}`, ...(input.professionalId ? [`HEALTH_BOOKING_PROFESSIONAL:${input.professionalId}:${date.toISOString()}`] : [])].sort()) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
     const [conflict] = await tx.select({ id: healthAppointments.id }).from(healthAppointments).where(and(eq(healthAppointments.date, date), notInArray(healthAppointments.status, ["Cancelado", "Faltou"]), or(eq(healthAppointments.patientId, input.patientId), input.professionalId ? eq(healthAppointments.professionalId, input.professionalId) : undefined))).limit(1);
    if (conflict) {
      throw new HealthOperationError("O paciente ou profissional ja possui um agendamento ativo nesse horario.");
    }

    const snapshot = await patientMunicipalitySnapshot(tx, input.patientId);
     const [appointment] = await tx.insert(healthAppointments).values({
        date,
        patientId: input.patientId,
        unitId: input.unitId,
        professionalId: input.professionalId,
        scheduleId: input.scheduleId || null,
        billingContextSnapshot: { agreementId: agreementIdSnapshot, providerUnit: null },
        visitType: input.visitType || null,
        specialty: input.specialty,
        schedulingGroupId: input.schedulingGroupId,
        specialtyId: input.specialtyId,
        serviceId: input.serviceId,
        priority: input.priority,
        status: "Agendado",
        ...snapshot,
     }).returning({ id: healthAppointments.id });
     await tx.insert(healthAppointmentEvents).values({ appointmentId: appointment.id, eventType: "SCHEDULED", toStatus: "Agendado", actorUsuarioId: context.user.id });
    await writeAuditEvent(tx, {
      actorUsuarioId: context.user.id,
      eventType: auditEventTypes.administrativeMutation,
      targetType: "HEALTH_APPOINTMENT",
      targetId: appointment.id,
    });
    return appointment;
}

export async function transitionHealthAppointment(context: AppContext, raw: unknown) {
  const input = healthAppointmentTransitionSchema.parse(raw);

  return runHealthTransaction(context, async tx => {
    const [appointment] = await tx.select({ id: healthAppointments.id, unitId: healthAppointments.unitId, status: healthAppointments.status, medicalRecord: { id: medicalRecords.id } }).from(healthAppointments).leftJoin(medicalRecords, eq(medicalRecords.appointmentId, healthAppointments.id)).where(eq(healthAppointments.id, input.appointmentId)).limit(1);
    if (!appointment) throw new HealthOperationError("Agendamento nao encontrado.");
    assertHealthUnitAccess(context.user, appointment.unitId);
    if (appointment.medicalRecord) throw new HealthOperationError("O agendamento ja possui prontuario e seu status esta protegido.");
    assertHealthAppointmentTransition(appointment.status, input.status);

    const [updated] = await tx.update(healthAppointments).set(input.status === "Cancelado"
        ? { status: input.status, cancelledAt: new Date(), cancellationReason: input.cancellationReason }
        : { status: input.status, cancelledAt: null, cancellationReason: null, ...(input.status === "Confirmado" ? { confirmedAt: new Date() } : {}), ...(input.status === "Aguardando" ? { arrivedAt: new Date() } : {}), ...(input.status === "Em Atendimento" ? { startedAt: new Date() } : {}) }).where(eq(healthAppointments.id, appointment.id)).returning({ id: healthAppointments.id });
    await tx.insert(healthAppointmentEvents).values({ appointmentId: appointment.id, eventType: input.status === "Cancelado" ? "CANCELLED" : "STATUS_CHANGED", fromStatus: appointment.status, toStatus: input.status, notes: input.cancellationReason, actorUsuarioId: context.user.id });
    await syncRegulationAppointment(tx, appointment.id, input.status, context.user.id);
    await writeAuditEvent(tx, {
      actorUsuarioId: context.user.id,
      eventType: auditEventTypes.administrativeMutation,
      targetType: "HEALTH_APPOINTMENT",
      targetId: updated.id,
    });
    return updated;
  });
}

export async function createSpontaneousCare(context: AppContext, raw: unknown) {
  const input = spontaneousCareCreateSchema.parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  return runHealthTransaction(context, async tx => {
    await requireActiveAppointmentReferences(tx, input.patientId, input.unitId, input.professionalId);
    await validateSchedulingReferences(tx, input.unitId, null, input.specialtyId, input.serviceId);
    await assertPatientRegistrationCurrent(tx, input.patientId, input.unitId, input.priority === "Urgência");
    const snapshot = await patientMunicipalitySnapshot(tx, input.patientId);
    const provider = (await tx.execute<{ id: string; name: string; cnes: string | null; isActive: boolean }>(sql`SELECT p.id, p.name, p.cnes, p."isActive" FROM "HealthUnit" u JOIN "HealthUnit" p ON p.id=u."spontaneousProviderUnitId" WHERE u.id=${input.unitId} LIMIT 1`)).rows[0];
    if (provider && !provider.isActive) throw new HealthOperationError("A unidade prestadora da demanda espontânea está inativa. Corrija a configuração da origem.");
    const [appointment] = await tx.insert(healthAppointments).values({ date: new Date(), origin: "SPONTANEOUS", status: "Aguardando", priority: input.priority, patientId: input.patientId, unitId: input.unitId, professionalId: input.professionalId, specialtyId: input.specialtyId, serviceId: input.serviceId, arrivalNotes: input.arrivalNotes, arrivedAt: new Date(), ...snapshot, billingContextSnapshot: { agreementId: null, providerUnit: provider ? { id: provider.id, name: provider.name, cnes: provider.cnes } : null } }).returning({ id: healthAppointments.id });
    await tx.insert(healthAppointmentEvents).values({ appointmentId: appointment.id, eventType: "SPONTANEOUS_ARRIVAL", toStatus: "Aguardando", notes: input.arrivalNotes, actorUsuarioId: context.user.id });
    return appointment;
  });
}

export async function registerHealthTriage(context: AppContext, raw: unknown) {
  const input = healthTriageInputSchema.parse(raw);
  if (!context.user.employeeId) throw new HealthOperationError("Vincule o usuário a um profissional de saúde para registrar o acolhimento.");
  return runHealthTransaction(context, async tx => {
    const [professional] = await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.employeeId, context.user.employeeId!), eq(healthProfessionals.isActive, true))).limit(1);
    if (!professional) throw new HealthOperationError("Profissional de saúde ativo não encontrado.");
    const [appointment] = await tx.select().from(healthAppointments).where(eq(healthAppointments.id, input.appointmentId)).limit(1);
    if (!appointment) throw new HealthOperationError("Atendimento não encontrado.");
    assertHealthUnitAccess(context.user, appointment.unitId);
    if (appointment.status !== "Aguardando") throw new HealthOperationError("Registre a chegada do paciente antes do acolhimento.");
    await requireActiveAppointmentReferences(tx, appointment.patientId, appointment.unitId, professional.id);
    const [triage] = await tx.insert(healthTriages).values({ ...input, professionalId: professional.id }).onConflictDoUpdate({ target: healthTriages.appointmentId, set: { ...input, professionalId: professional.id } }).returning({ id: healthTriages.id });
    await tx.update(healthAppointments).set({ triagedAt: new Date(), status: "Aguardando", priority: input.priorityLabel }).where(eq(healthAppointments.id, appointment.id));
    await tx.insert(healthAppointmentEvents).values({ appointmentId: appointment.id, eventType: "TRIAGED", fromStatus: appointment.status, toStatus: "Aguardando", notes: input.riskClassification, actorUsuarioId: context.user.id });
    const now = new Date();
    const rules = await tx.select().from(healthSpecialtyProcedureRules).where(and(eq(healthSpecialtyProcedureRules.isActive, true), eq(healthSpecialtyProcedureRules.eventType, "TRIAGE_COMPLETED"), or(isNull(healthSpecialtyProcedureRules.unitId), eq(healthSpecialtyProcedureRules.unitId, appointment.unitId)), or(isNull(healthSpecialtyProcedureRules.specialtyId), eq(healthSpecialtyProcedureRules.specialtyId, appointment.specialtyId || "__SEM_ESPECIALIDADE__"))));
    for (const rule of rules) await registerProductionFactTx(tx, { originType: "TRIAGE", originId: triage.id, unitId: appointment.unitId, professionalId: professional.id, patientId: appointment.patientId, procedureId: rule.procedureId, quantity: rule.quantity, occurredAt: now, idempotencyKey: `TRIAGE_RULE:${triage.id}:${rule.id}` }, appointment.billingContextSnapshot);
    return triage;
  });
}

export async function callHealthAppointment(context: AppContext, appointmentId: string) {
  return runHealthTransaction(context, async tx => {
    const [appointment] = await tx.select({ id: healthAppointments.id, unitId: healthAppointments.unitId, status: healthAppointments.status }).from(healthAppointments).where(eq(healthAppointments.id, appointmentId)).limit(1);
    if (!appointment || appointment.status !== "Aguardando") throw new HealthOperationError("Atendimento não está aguardando na fila.");
    assertHealthUnitAccess(context.user, appointment.unitId);
    await tx.update(healthAppointments).set({ calledAt: new Date() }).where(eq(healthAppointments.id, appointment.id));
    await tx.insert(healthAppointmentEvents).values({ appointmentId: appointment.id, eventType: "CALLED", fromStatus: appointment.status, toStatus: appointment.status, actorUsuarioId: context.user.id });
    return appointment;
  });
}

export async function completeHealthAppointment(context: AppContext, raw: unknown) {
  const input = healthAppointmentCompletionSchema.parse(raw);
  if (!context.user.employeeId) {
    throw new HealthOperationError("Vincule o usuario autenticado a um profissional de saude para registrar atendimento.");
  }

  try {
    return await runHealthTransaction(context, async tx => {
      const [professional] = await tx.select({ id: healthProfessionals.id, unitId: healthProfessionals.unitId, employee: { isActive: employees.isActive } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(and(eq(healthProfessionals.employeeId, context.user.employeeId!), eq(healthProfessionals.isActive, true))).limit(1);
      if (!professional || !professional.employee.isActive) throw new HealthOperationError("O servidor autenticado nao possui cadastro ativo como profissional de saude.");

      const [row] = await tx.select({ appointment: healthAppointments, medicalRecord: { id: medicalRecords.id } }).from(healthAppointments).leftJoin(medicalRecords, eq(medicalRecords.appointmentId, healthAppointments.id)).where(eq(healthAppointments.id, input.appointmentId)).limit(1);
      const appointment = row ? { ...row.appointment, medicalRecord: row.medicalRecord } : null;
      if (!appointment) throw new HealthOperationError("Agendamento nao encontrado.");
      assertHealthUnitAccess(context.user, appointment.unitId);
      if (appointment.medicalRecord) throw new HealthOperationError("Este agendamento ja possui um prontuario registrado.");
      assertHealthAppointmentCanBeCompleted(appointment.status);
      assertHealthAppointmentCanBeCompletedAt(appointment.date);
      if (appointment.professionalId && appointment.professionalId !== professional.id) {
        throw new HealthOperationError("O agendamento pertence a outro profissional de saude.");
      }
      if (professional.unitId && professional.unitId !== appointment.unitId) {
        throw new HealthOperationError("O profissional autenticado nao esta vinculado a unidade deste agendamento.");
      }
      const [professionalConflict] = await tx.select({ id: healthAppointments.id }).from(healthAppointments).where(and(ne(healthAppointments.id, appointment.id), eq(healthAppointments.date, appointment.date), eq(healthAppointments.professionalId, professional.id), notInArray(healthAppointments.status, ["Cancelado", "Faltou"]))).limit(1);
      if (professionalConflict) {
        throw new HealthOperationError("O profissional autenticado ja possui outro agendamento ativo nesse horario.");
      }

      const [record] = await tx.insert(medicalRecords).values({
          type: input.type,
          bloodPressure: input.bloodPressure,
          temperature: input.temperature,
          weight: input.weight,
          height: input.height,
          heartRate: input.heartRate,
          chiefComplaint: input.chiefComplaint,
          evolution: input.evolution,
          conduct: input.conduct,
          patientId: appointment.patientId,
          unitId: appointment.unitId,
          professionalId: professional.id,
          appointmentId: appointment.id,
          careContextSnapshot: await captureCareIndicatorContext(tx, professional.id, appointment.unitId),
      }).returning({ id: medicalRecords.id });
      await tx.update(healthAppointments).set({ status: "Atendido", professionalId: professional.id }).where(eq(healthAppointments.id, appointment.id));
      await writeAuditEvent(tx, {
        actorUsuarioId: context.user.id,
        eventType: auditEventTypes.administrativeMutation,
        targetType: "MEDICAL_RECORD",
        targetId: record.id,
      });
      await writeAuditEvent(tx, {
        actorUsuarioId: context.user.id,
        eventType: auditEventTypes.administrativeMutation,
        targetType: "HEALTH_APPOINTMENT",
        targetId: appointment.id,
      });
      return record;
    });
  } catch (error) {
    if (getPostgresError(error)?.code === "23505") {
      throw new HealthOperationError("Este agendamento ja possui um prontuario registrado.");
    }
    throw error;
  }
}
