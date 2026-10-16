import { z } from "zod";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { bookAppointment, cancelAppointment } from "@/lib/sst/agenda-service";
import { availableSlots } from "@/lib/sst/agenda-policy";

async function ownMedicalEmployee(context: AppContext) {
  const moduleConfig = await context.prisma.configuracaoModulo.findUnique({ where: { codigo: "SST" }, select: { ativo: true } });
  if (moduleConfig?.ativo === false) throw new AccessError("Agenda SST indisponível.", 423);
  const employee = await context.prisma.employee.findFirst({ where: { id: context.user.employeeId || "__SEM_VINCULO__", isActive: true }, select: { id: true, secretariatId: true } });
  if (!employee?.secretariatId) throw new AccessError("Servidor sem vínculo ativo com unidade de atendimento.", 403);
  // Preserve the validated, non-null unit in the returned type as well as at runtime.
  return { id: employee.id, secretariatId: employee.secretariatId };
}

export async function listOwnMedicalAgenda(context: AppContext, page = 1) {
  const employee = await ownMedicalEmployee(context), now = new Date();
  const where = { isActive: true, endsAt: { gt: now }, budgetUnit: { secretariatId: employee.secretariatId } };
  const total = await context.prisma.sstScheduleAvailability.count({ where });
  const currentPage = Math.min(Math.max(1, Number.isSafeInteger(page) ? page : 1), Math.max(1, Math.ceil(total / 10)));
  const windows = await context.prisma.sstScheduleAvailability.findMany({ where, include: { professional: { select: { fullName: true } }, blocks: { select: { startsAt: true, endsAt: true } }, appointments: { where: { status: { not: "CANCELLED" } }, select: { startsAt: true, endsAt: true } } }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take: 10, skip: (currentPage - 1) * 10 });
  return { total, page: currentPage, windows: windows.map(window => ({ id: window.id, unitName: window.unitName, professionalName: window.professional.fullName, slots: availableSlots(window, [...window.blocks, ...window.appointments]).filter(slot => slot.startsAt > now).map(slot => ({ startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() })) })) };
}

export async function bookOwnMedicalAppointment(context: AppContext, raw: unknown) {
  const input = z.object({ availabilityId: z.string().min(1), startsAt: z.iso.datetime({ offset: true }), purpose: z.enum(["CONSULTA", "EXAME", "PERICIA"]) }).strict().parse(raw);
  const employee = await ownMedicalEmployee(context);
  const window = await context.prisma.sstScheduleAvailability.findFirst({ where: { id: input.availabilityId, isActive: true, budgetUnit: { secretariatId: employee.secretariatId } }, select: { budgetUnitId: true } });
  if (!window) throw new AccessError("Agenda indisponível para seu vínculo.", 403);
  // The capability is confined to this own-employee operation. It does not grant
  // administrative SST/module permissions or accept a unit/employee from input.
  const ownContext = { ...context, user: { ...context.user, allowedBudgetUnitIds: [window.budgetUnitId] } };
  return bookAppointment(ownContext, { ...input, employeeId: employee.id });
}

export async function cancelOwnMedicalAppointment(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().min(1), reason: z.string().trim().min(5).max(500) }).strict().parse(raw);
  const employee = await ownMedicalEmployee(context);
  const appointment = await context.prisma.sstAppointment.findFirst({ where: { id: input.id, employeeId: employee.id }, select: { availability: { select: { budgetUnitId: true } } } });
  if (!appointment) throw new AccessError("Agendamento indisponível.", 404);
  return cancelAppointment({ ...context, user: { ...context.user, allowedBudgetUnitIds: [appointment.availability.budgetUnitId] } }, input);
}

export async function readOwnMedicalAppointment(context: AppContext, id: string) {
  const employee = await ownMedicalEmployee(context);
  const appointment = await context.prisma.sstAppointment.findFirst({ where: { id, employeeId: employee.id }, include: { employee: { select: { name: true, registration: true } }, availability: { select: { unitName: true, professional: { select: { fullName: true } } } } } });
  if (!appointment) throw new AccessError("Agendamento indisponível.", 404);
  return appointment;
}
