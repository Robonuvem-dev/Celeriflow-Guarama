import type { AppContext } from "@/lib/platform/tenant-context";
import { assertBudgetUnitAccess } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { boardInput, availabilityInput, availableSlots } from "./agenda-policy";
import { SstValidationError } from "./errors";
import { z } from "zod";

export async function createMedicalBoard(context: AppContext, raw: unknown) {
  const input = boardInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return context.prisma.$transaction(async (tx) => {
    const ids = input.members.map((item) => item.personId);
    if (await tx.person.count({ where: { id: { in: ids } } }) !== ids.length) throw new SstValidationError("Profissional não encontrado no Cadastro Único.");
    const board = await tx.sstMedicalBoard.create({ data: { ...input, members: { create: input.members }, createdById: context.user.id } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_BOARD", targetId: board.id });
    return board.id;
  });
}

export async function createAvailability(context: AppContext, raw: unknown) {
  const input = availabilityInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return context.prisma.$transaction(async (tx) => {
    const resource = input.professionalPersonId;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_AGENDA:${resource}`}))`;
    const overlap = await tx.sstScheduleAvailability.count({ where: { professionalPersonId: resource, isActive: true, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } } });
    if (overlap) throw new SstValidationError("O profissional já possui disponibilidade nesse período.");
    const window = await tx.sstScheduleAvailability.create({ data: { ...input, createdById: context.user.id } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_AVAILABILITY", targetId: window.id });
    return window.id;
  });
}

export async function bookAppointment(context: AppContext, raw: unknown) {
  const input = z.object({ availabilityId: z.string().min(1), employeeId: z.string().min(1), startsAt: z.coerce.date(), purpose: z.enum(["CONSULTA", "EXAME", "PERICIA"]) }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const window = await tx.sstScheduleAvailability.findUniqueOrThrow({ where: { id: input.availabilityId } });
    assertBudgetUnitAccess(context.user, window.budgetUnitId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_AGENDA:${window.professionalPersonId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_EMPLOYEE_AGENDA:${input.employeeId}`}))`;
    const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: window.budgetUnitId } });
    const employee = await tx.employee.findUnique({ where: { id: input.employeeId } });
    if (!window.isActive || !employee?.isActive || employee.secretariatId !== unit.secretariatId) throw new SstValidationError("Servidor ou agenda incompatível com a unidade gestora.");
    const blocks = await tx.sstScheduleBlock.findMany({ where: { availabilityId: window.id } });
    const occupied = await tx.sstAppointment.findMany({ where: { availabilityId: window.id, status: { not: "CANCELLED" } } });
    const slot = availableSlots(window, [...blocks, ...occupied]).find((item) => item.startsAt.getTime() === input.startsAt.getTime());
    if (!slot || slot.startsAt <= new Date()) throw new SstValidationError("Horário indisponível ou já passado.");
    const employeeConflict = await tx.sstAppointment.count({ where: { employeeId: employee.id, status: { not: "CANCELLED" }, startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt } } });
    if (employeeConflict) throw new SstValidationError("O servidor já possui atendimento nesse horário.");
    const appointment = await tx.sstAppointment.create({ data: { ...input, ...slot, createdById: context.user.id } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_APPOINTMENT", targetId: appointment.id });
    return appointment.id;
  });
}

export async function blockAvailability(context: AppContext, raw: unknown) {
  const input = z.object({ availabilityId: z.string().min(1), startsAt: z.coerce.date(), endsAt: z.coerce.date(), reason: z.string().trim().min(5).max(500) }).refine((item) => item.endsAt > item.startsAt, "Período inválido.").parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const window = await tx.sstScheduleAvailability.findUniqueOrThrow({ where: { id: input.availabilityId } });
    assertBudgetUnitAccess(context.user, window.budgetUnitId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_AGENDA:${window.professionalPersonId}`}))`;
    if (input.startsAt < window.startsAt || input.endsAt > window.endsAt) throw new SstValidationError("O bloqueio deve estar dentro da disponibilidade.");
    if (await tx.sstAppointment.count({ where: { availabilityId: window.id, status: { not: "CANCELLED" }, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } } })) throw new SstValidationError("Há atendimentos no período. Cancele ou reprograme antes do bloqueio.");
    const block = await tx.sstScheduleBlock.create({ data: { ...input, createdById: context.user.id } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_AGENDA_BLOCK", targetId: block.id });
    return block.id;
  });
}

export async function cancelAppointment(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().min(1), reason: z.string().trim().min(5).max(500) }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const appointment = await tx.sstAppointment.findUniqueOrThrow({ where: { id: input.id }, include: { availability: true } });
    assertBudgetUnitAccess(context.user, appointment.availability.budgetUnitId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_AGENDA:${appointment.availability.professionalPersonId}`}))`;
    const changed = await tx.sstAppointment.updateMany({ where: { id: input.id, status: "BOOKED" }, data: { status: "CANCELLED", cancellationReason: input.reason, cancelledAt: new Date() } });
    if (changed.count !== 1) throw new SstValidationError("Este agendamento já foi encerrado.");
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_APPOINTMENT_CANCELLED", targetId: input.id });
    return input.id;
  });
}
