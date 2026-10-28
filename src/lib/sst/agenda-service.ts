import type { AppContext } from "@/lib/platform/tenant-context";
import { assertBudgetUnitAccess } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { and, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { sstBoards, sstBoardMembers, sstAvailability, sstScheduleBlocks, sstAppointments } from "@/db/schema/sst-agenda";
import { people } from "@/db/schema/people";
import { findSstEmployee, findSstUnit } from "@/db/repositories/sst/scope";
import { withDatabaseTransaction } from "@/db/transaction";
import type { DatabaseConnection } from "@/db/connection";
import { sstContextConnection } from "./database";
import { boardInput, availabilityInput, availableSlots } from "./agenda-policy";
import { SstValidationError } from "./errors";
import { z } from "zod";

export async function createMedicalBoard(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = boardInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return withDatabaseTransaction(connection, async (tx) => {
    const ids = input.members.map((item) => item.personId);
    if ((await tx.select({ id: people.id }).from(people).where(inArray(people.id, ids))).length !== ids.length) throw new SstValidationError("Profissional não encontrado no Cadastro Único.");
    const { members, ...boardInput } = input;
    const [board] = await tx.insert(sstBoards).values({ ...boardInput, createdById: context.user.id }).returning({ id: sstBoards.id });
    await tx.insert(sstBoardMembers).values(members.map(member => ({ ...member, boardId: board.id })));
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_BOARD", targetId: board.id });
    return board.id;
  });
}

export async function createAvailability(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = availabilityInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return withDatabaseTransaction(connection, async (tx) => {
    const resource = input.professionalPersonId;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_AGENDA:${resource}`}))`);
    const overlap = await tx.select({ id: sstAvailability.id }).from(sstAvailability).where(and(eq(sstAvailability.professionalPersonId, resource), eq(sstAvailability.isActive, true), lt(sstAvailability.startsAt, input.endsAt), gt(sstAvailability.endsAt, input.startsAt))).limit(1);
    if (overlap.length) throw new SstValidationError("O profissional já possui disponibilidade nesse período.");
    const [window] = await tx.insert(sstAvailability).values({ ...input, createdById: context.user.id }).returning({ id: sstAvailability.id });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_AVAILABILITY", targetId: window.id });
    return window.id;
  });
}

export async function bookAppointment(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = z.object({ availabilityId: z.string().min(1), employeeId: z.string().min(1), startsAt: z.coerce.date(), purpose: z.enum(["CONSULTA", "EXAME", "PERICIA"]) }).parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    const [window] = await tx.select().from(sstAvailability).where(eq(sstAvailability.id, input.availabilityId));
    if (!window) throw new SstValidationError("Agenda não encontrada.");
    assertBudgetUnitAccess(context.user, window.budgetUnitId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_AGENDA:${window.professionalPersonId}`}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_EMPLOYEE_AGENDA:${input.employeeId}`}))`);
    const unit = await findSstUnit(tx, window.budgetUnitId);
    const employee = await findSstEmployee(tx, input.employeeId);
    if (!window.isActive || !employee?.isActive || !unit || employee.secretariatId !== unit.secretariatId) throw new SstValidationError("Servidor ou agenda incompatível com a unidade gestora.");
    const blocks = await tx.select().from(sstScheduleBlocks).where(eq(sstScheduleBlocks.availabilityId, window.id));
    const occupied = await tx.select().from(sstAppointments).where(and(eq(sstAppointments.availabilityId, window.id), ne(sstAppointments.status, "CANCELLED")));
    const slot = availableSlots(window, [...blocks, ...occupied]).find((item) => item.startsAt.getTime() === input.startsAt.getTime());
    if (!slot || slot.startsAt <= new Date()) throw new SstValidationError("Horário indisponível ou já passado.");
    const employeeConflict = await tx.select({ id: sstAppointments.id }).from(sstAppointments).where(and(eq(sstAppointments.employeeId, employee.id), ne(sstAppointments.status, "CANCELLED"), lt(sstAppointments.startsAt, slot.endsAt), gt(sstAppointments.endsAt, slot.startsAt))).limit(1);
    if (employeeConflict.length) throw new SstValidationError("O servidor já possui atendimento nesse horário.");
    const [appointment] = await tx.insert(sstAppointments).values({ ...input, ...slot, createdById: context.user.id }).returning({ id: sstAppointments.id });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_APPOINTMENT", targetId: appointment.id });
    return appointment.id;
  });
}

export async function blockAvailability(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = z.object({ availabilityId: z.string().min(1), startsAt: z.coerce.date(), endsAt: z.coerce.date(), reason: z.string().trim().min(5).max(500) }).refine((item) => item.endsAt > item.startsAt, "Período inválido.").parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    const [window] = await tx.select().from(sstAvailability).where(eq(sstAvailability.id, input.availabilityId));
    if (!window) throw new SstValidationError("Agenda não encontrada.");
    assertBudgetUnitAccess(context.user, window.budgetUnitId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_AGENDA:${window.professionalPersonId}`}))`);
    if (input.startsAt < window.startsAt || input.endsAt > window.endsAt) throw new SstValidationError("O bloqueio deve estar dentro da disponibilidade.");
    if ((await tx.select({ id: sstAppointments.id }).from(sstAppointments).where(and(eq(sstAppointments.availabilityId, window.id), ne(sstAppointments.status, "CANCELLED"), lt(sstAppointments.startsAt, input.endsAt), gt(sstAppointments.endsAt, input.startsAt))).limit(1)).length) throw new SstValidationError("Há atendimentos no período. Cancele ou reprograme antes do bloqueio.");
    const [block] = await tx.insert(sstScheduleBlocks).values({ ...input, createdById: context.user.id }).returning({ id: sstScheduleBlocks.id });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_AGENDA_BLOCK", targetId: block.id });
    return block.id;
  });
}

export async function cancelAppointment(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = z.object({ id: z.string().min(1), reason: z.string().trim().min(5).max(500) }).parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    const [row] = await tx.select({ appointment: sstAppointments, availability: sstAvailability }).from(sstAppointments).innerJoin(sstAvailability, eq(sstAppointments.availabilityId, sstAvailability.id)).where(eq(sstAppointments.id, input.id));
    if (!row) throw new SstValidationError("Agendamento não encontrado.");
    const appointment = { ...row.appointment, availability: row.availability };
    assertBudgetUnitAccess(context.user, appointment.availability.budgetUnitId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_AGENDA:${appointment.availability.professionalPersonId}`}))`);
    const changed = await tx.update(sstAppointments).set({ status: "CANCELLED", cancellationReason: input.reason, cancelledAt: new Date() }).where(and(eq(sstAppointments.id, input.id), eq(sstAppointments.status, "BOOKED"))).returning({ id: sstAppointments.id });
    if (changed.length !== 1) throw new SstValidationError("Este agendamento já foi encerrado.");
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_APPOINTMENT_CANCELLED", targetId: input.id });
    return input.id;
  });
}
