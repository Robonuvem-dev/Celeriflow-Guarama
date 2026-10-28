import type { AppContext } from "@/lib/platform/tenant-context";
import { assertBudgetUnitAccess } from "@/lib/platform/tenant-context";
import { programInput, occupationalRiskScore } from "./program-policy";
import { SstValidationError } from "./errors";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { and, desc, eq, inArray, lte, gte, or, isNull, sql } from "drizzle-orm";
import { sstExposureGroups, sstPrograms, sstProgramGroups } from "@/db/schema/sst-programs";
import { findSstPerson } from "@/db/repositories/sst/scope";
import { withDatabaseTransaction } from "@/db/transaction";
import type { DatabaseConnection } from "@/db/connection";
import { sstContextConnection } from "./database";

export async function registerOccupationalProgram(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  const input = programInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_PROGRAM:${input.budgetUnitId}:${input.kind}:${input.code}`}))`);
    const groups = await tx.select().from(sstExposureGroups).where(and(inArray(sstExposureGroups.id, input.groups.map(group => group.groupId)), eq(sstExposureGroups.budgetUnitId, input.budgetUnitId), eq(sstExposureGroups.isActive, true), lte(sstExposureGroups.startsAt, input.endsAt), or(isNull(sstExposureGroups.endsAt), gte(sstExposureGroups.endsAt, input.startsAt))));
    if (groups.length !== input.groups.length) throw new SstValidationError("Um dos GHEs não pertence à UG ou está fora da vigência.");
    const responsible = await findSstPerson(tx, input.responsiblePersonId);
    if (!responsible) throw new SstValidationError("Responsável não encontrado no Cadastro Único.");
    const [previous] = await tx.select({ version: sstPrograms.version }).from(sstPrograms).where(and(eq(sstPrograms.budgetUnitId, input.budgetUnitId), eq(sstPrograms.code, input.code), eq(sstPrograms.kind, input.kind))).orderBy(desc(sstPrograms.version)).limit(1);
    const [program] = await tx.insert(sstPrograms).values({
      budgetUnitId: input.budgetUnitId, code: input.code, kind: input.kind, version: (previous?.version || 0) + 1,
      startsAt: input.startsAt, endsAt: input.endsAt, responsiblePersonId: input.responsiblePersonId,
      responsibleCouncil: input.responsibleCouncil, responsibleSnapshot: { name: responsible.fullName, council: input.responsibleCouncil }, content: input.content, createdById: context.user.id,
    }).returning({ id: sstPrograms.id });
    await tx.insert(sstProgramGroups).values(input.groups.map((entry) => {
        const group = groups.find((item) => item.id === entry.groupId)!;
        return { programId: program.id, groupId: group.id, groupSnapshot: { code: group.code, name: group.name, departmentIds: group.departmentIds, roleIds: group.roleIds, startsAt: group.startsAt.toISOString(), endsAt: group.endsAt?.toISOString() || null, conditions: entry.conditions }, risks: entry.risks.map((risk) => ({ ...risk, score: risk.probability === null || risk.severity === null ? null : occupationalRiskScore(risk.probability, risk.severity) })), exams: entry.exams };
      }));
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_PROGRAM_VERSION", targetId: program.id });
    return program.id;
  });
}
