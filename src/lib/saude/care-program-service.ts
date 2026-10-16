import { z } from "zod";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
export async function saveHealthCareProgram(context: AppContext, raw: unknown) {
  const input = z.object({ code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(200) }).strict().parse(raw);
  return context.prisma.healthCareProgram.upsert({ where: { code: input.code }, create: input, update: { name: input.name, isActive: true } });
}
export async function enrollInHealthCareProgram(context: AppContext, raw: unknown) {
  const input = z.object({ programId: z.string().min(1), patientId: z.string().min(1), unitId: z.string().min(1), startsAt: z.coerce.date(), endsAt: z.coerce.date().nullable(), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.endsAt && input.endsAt < input.startsAt) throw new Error("O encerramento do vínculo não pode anteceder o início.");
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_PROGRAM:${input.patientId}:${input.programId}`}))`;
    if (!await tx.healthCareProgram.count({ where: { id: input.programId, isActive: true } }) || !await tx.healthUnit.count({ where: { id: input.unitId, isActive: true } })) throw new Error("Selecione ação programática e unidade ativas.");
    const patient = await tx.patient.findFirstOrThrow({ where: { id: input.patientId, status: "Ativo" }, select: { referenceUnitId: true } });
    if (patient.referenceUnitId) assertHealthUnitAccess(context.user, patient.referenceUnitId);
    const overlap = await tx.healthCareProgramEnrollment.count({ where: { patientId: input.patientId, programId: input.programId, ...(input.endsAt ? { startsAt: { lte: input.endsAt } } : {}), OR: [{ endsAt: null }, { endsAt: { gte: input.startsAt } }] } });
    if (overlap) throw new Error("O paciente já possui vínculo com a ação programática neste período.");
    return tx.healthCareProgramEnrollment.create({ data: { ...input, createdByUsuarioId: context.user.id } });
  });
}
export async function closeHealthCareProgramEnrollment(context: AppContext, raw: unknown) {
  const input = z.object({ enrollmentId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthCareProgramEnrollment" WHERE id=${input.enrollmentId} FOR UPDATE`;
    const current = await tx.healthCareProgramEnrollment.findUniqueOrThrow({ where: { id: input.enrollmentId } });
    assertHealthUnitAccess(context.user, current.unitId);
    if (current.endsAt && current.endsAt <= new Date()) return current;
    if (current.startsAt > new Date()) throw new Error("Confira a data de início antes de encerrar o vínculo.");
    return tx.healthCareProgramEnrollment.update({ where: { id: current.id }, data: { endsAt: new Date(), closureReason: input.reason, closedByUsuarioId: context.user.id } });
  });
}
