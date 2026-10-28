import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { findModuleActivation } from "@/db/repositories/platform/identity";
import { activePortalEmployee, portalCount, portalFirst, portalRows } from "@/db/repositories/portal-servidor/records";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { bookAppointment, cancelAppointment } from "@/lib/sst/agenda-service";
import { availableSlots } from "@/lib/sst/agenda-policy";

async function ownMedicalEmployee(context: AppContext) {
  const executor = context.database ?? db;
  const moduleConfig = await findModuleActivation(executor, "SST");
  if (moduleConfig?.ativo === false) throw new AccessError("Agenda SST indisponível.", 423);
  const employee = await activePortalEmployee(executor, context.user.employeeId || "__SEM_VINCULO__");
  if (!employee?.secretariatId) throw new AccessError("Servidor sem vínculo ativo com unidade de atendimento.", 403);
  // Preserve the validated, non-null unit in the returned type as well as at runtime.
  return { id: employee.id, secretariatId: employee.secretariatId };
}

export async function listOwnMedicalAgenda(context: AppContext, page = 1) {
  const employee = await ownMedicalEmployee(context), now = new Date();
  const executor = context.database ?? db;
  const where = sql`a."isActive" AND a."endsAt">${now} AND u."secretariatId"=${employee.secretariatId}`;
  const total = await portalCount(executor, sql`SELECT count(*) FROM "SstScheduleAvailability" a JOIN "BudgetUnit" u ON u.id=a."budgetUnitId" WHERE ${where}`);
  const currentPage = Math.min(Math.max(1, Number.isSafeInteger(page) ? page : 1), Math.max(1, Math.ceil(total / 10)));
  const rows = await portalRows<{ id: string; unitName: string; startsAt: Date; endsAt: Date; slotMinutes: number; fullName: string }>(executor, sql`SELECT a.id,a."unitName",a."startsAt",a."endsAt",a."slotMinutes",p."fullName" FROM "SstScheduleAvailability" a JOIN "BudgetUnit" u ON u.id=a."budgetUnitId" JOIN "Person" p ON p.id=a."professionalPersonId" WHERE ${where} ORDER BY a."startsAt",a.id LIMIT 10 OFFSET ${(currentPage - 1) * 10}`);
  const occupied = await portalRows<{ availabilityId: string; startsAt: Date; endsAt: Date; kind: string }>(executor, sql`SELECT "availabilityId","startsAt","endsAt",'BLOCK' AS kind FROM "SstScheduleBlock" WHERE "availabilityId"=ANY(${sql.param(rows.map(row => row.id))}::text[]) UNION ALL SELECT "availabilityId","startsAt","endsAt",'APPOINTMENT' AS kind FROM "SstAppointment" WHERE "availabilityId"=ANY(${sql.param(rows.map(row => row.id))}::text[]) AND status<>'CANCELLED'`);
  const windows = rows.map(row => ({ ...row, professional: { fullName: row.fullName }, blocks: occupied.filter(item => item.availabilityId === row.id && item.kind === "BLOCK"), appointments: occupied.filter(item => item.availabilityId === row.id && item.kind === "APPOINTMENT") }));
  return { total, page: currentPage, windows: windows.map(window => ({ id: window.id, unitName: window.unitName, professionalName: window.professional.fullName, slots: availableSlots(window, [...window.blocks, ...window.appointments]).filter(slot => slot.startsAt > now).map(slot => ({ startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() })) })) };
}

export async function bookOwnMedicalAppointment(context: AppContext, raw: unknown) {
  const input = z.object({ availabilityId: z.string().min(1), startsAt: z.iso.datetime({ offset: true }), purpose: z.enum(["CONSULTA", "EXAME", "PERICIA"]) }).strict().parse(raw);
  const employee = await ownMedicalEmployee(context);
  const window = await portalFirst<{ budgetUnitId: string }>(context.database ?? db, sql`SELECT a."budgetUnitId" FROM "SstScheduleAvailability" a JOIN "BudgetUnit" u ON u.id=a."budgetUnitId" WHERE a.id=${input.availabilityId} AND a."isActive" AND u."secretariatId"=${employee.secretariatId} LIMIT 1`);
  if (!window) throw new AccessError("Agenda indisponível para seu vínculo.", 403);
  // The capability is confined to this own-employee operation. It does not grant
  // administrative SST/module permissions or accept a unit/employee from input.
  const ownContext = { ...context, user: { ...context.user, allowedBudgetUnitIds: [window.budgetUnitId] } };
  return bookAppointment(ownContext, { ...input, employeeId: employee.id });
}

export async function cancelOwnMedicalAppointment(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().min(1), reason: z.string().trim().min(5).max(500) }).strict().parse(raw);
  const employee = await ownMedicalEmployee(context);
  const appointment = await portalFirst<{ budgetUnitId: string }>(context.database ?? db, sql`SELECT a."budgetUnitId" FROM "SstAppointment" p JOIN "SstScheduleAvailability" a ON a.id=p."availabilityId" WHERE p.id=${input.id} AND p."employeeId"=${employee.id} LIMIT 1`);
  if (!appointment) throw new AccessError("Agendamento indisponível.", 404);
  return cancelAppointment({ ...context, user: { ...context.user, allowedBudgetUnitIds: [appointment.budgetUnitId] } }, input);
}

export async function readOwnMedicalAppointment(context: AppContext, id: string) {
  const employee = await ownMedicalEmployee(context);
  const appointment = await portalFirst<{ id: string; availabilityId: string; employeeId: string; purpose: string; startsAt: Date; endsAt: Date; status: string; cancellationReason: string | null; cancelledAt: Date | null; createdById: string; createdAt: Date; updatedAt: Date; employeeName: string; registration: string | null; unitName: string; professionalName: string }>(context.database ?? db, sql`SELECT p.*,e.name AS "employeeName",e.registration,a."unitName",person."fullName" AS "professionalName" FROM "SstAppointment" p JOIN "Employee" e ON e.id=p."employeeId" JOIN "SstScheduleAvailability" a ON a.id=p."availabilityId" JOIN "Person" person ON person.id=a."professionalPersonId" WHERE p.id=${id} AND p."employeeId"=${employee.id} LIMIT 1`);
  if (!appointment) throw new AccessError("Agendamento indisponível.", 404);
  const { employeeName, registration, unitName, professionalName, ...record } = appointment;
  return { ...record, employee: { name: employeeName, registration }, availability: { unitName, professional: { fullName: professionalName } } };
}
