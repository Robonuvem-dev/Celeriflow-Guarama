import { z } from "zod";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { healthCarePrograms, healthCareProgramEnrollments } from "@/db/schema/health-programs";
import type { HealthCareProgramRecord, HealthCareProgramEnrollmentRecord } from "@/lib/contracts/health-programs";

export async function saveHealthCareProgram(context: AppContext, raw: unknown): Promise<HealthCareProgramRecord> {
  const input = z.object({ code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(200) }).strict().parse(raw);
  const [program] = await (context.database ?? db).insert(healthCarePrograms).values(input).onConflictDoUpdate({ target: healthCarePrograms.code, set: { name: input.name, isActive: true } }).returning();
  return program;
}
export async function enrollInHealthCareProgram(context: AppContext, raw: unknown): Promise<HealthCareProgramEnrollmentRecord> {
  const input = z.object({ programId: z.string().min(1), patientId: z.string().min(1), unitId: z.string().min(1), startsAt: z.coerce.date(), endsAt: z.coerce.date().nullable(), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.endsAt && input.endsAt < input.startsAt) throw new Error("O encerramento do vínculo não pode anteceder o início.");
  return withDatabaseTransaction(databaseConnection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_PROGRAM:${input.patientId}:${input.programId}`}))`);
    const [program] = await tx.select({ id: healthCarePrograms.id }).from(healthCarePrograms).where(and(eq(healthCarePrograms.id, input.programId), eq(healthCarePrograms.isActive, true)));
    const unit = (await tx.execute<{ id: string }>(sql`SELECT id FROM "HealthUnit" WHERE id=${input.unitId} AND "isActive"=true LIMIT 1`)).rows[0];
    if (!program || !unit) throw new Error("Selecione ação programática e unidade ativas.");
    const patient = (await tx.execute<{ referenceUnitId: string | null }>(sql`SELECT "referenceUnitId" FROM "Patient" WHERE id=${input.patientId} AND status='Ativo' LIMIT 1`)).rows[0];
    if (!patient) throw new Error("Paciente não encontrado ou inativo.");
    if (patient.referenceUnitId) assertHealthUnitAccess(context.user, patient.referenceUnitId);
    const [overlap] = await tx.select({ id: healthCareProgramEnrollments.id }).from(healthCareProgramEnrollments).where(and(eq(healthCareProgramEnrollments.patientId, input.patientId), eq(healthCareProgramEnrollments.programId, input.programId), input.endsAt ? lte(healthCareProgramEnrollments.startsAt, input.endsAt) : undefined, or(isNull(healthCareProgramEnrollments.endsAt), gte(healthCareProgramEnrollments.endsAt, input.startsAt)))).limit(1);
    if (overlap) throw new Error("O paciente já possui vínculo com a ação programática neste período.");
    const [enrollment] = await tx.insert(healthCareProgramEnrollments).values({ ...input, createdByUsuarioId: context.user.id }).returning();
    return enrollment;
  });
}
export async function closeHealthCareProgramEnrollment(context: AppContext, raw: unknown): Promise<HealthCareProgramEnrollmentRecord> {
  const input = z.object({ enrollmentId: z.string().min(1), reason: z.string().trim().min(1).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(databaseConnection, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthCareProgramEnrollment" WHERE id=${input.enrollmentId} FOR UPDATE`);
    const [current] = await tx.select().from(healthCareProgramEnrollments).where(eq(healthCareProgramEnrollments.id, input.enrollmentId));
    if (!current) throw new Error("Vínculo com ação programática não encontrado.");
    assertHealthUnitAccess(context.user, current.unitId);
    if (current.endsAt && current.endsAt <= new Date()) return current;
    if (current.startsAt > new Date()) throw new Error("Confira a data de início antes de encerrar o vínculo.");
    const [updated] = await tx.update(healthCareProgramEnrollments).set({ endsAt: new Date(), closureReason: input.reason, closedByUsuarioId: context.user.id }).where(eq(healthCareProgramEnrollments.id, current.id)).returning();
    return updated;
  });
}
