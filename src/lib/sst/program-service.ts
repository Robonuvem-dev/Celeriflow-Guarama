import type { AppContext } from "@/lib/platform/tenant-context";
import { assertBudgetUnitAccess } from "@/lib/platform/tenant-context";
import { programInput, occupationalRiskScore } from "./program-policy";
import { SstValidationError } from "./errors";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

export async function registerOccupationalProgram(context: AppContext, raw: unknown) {
  const input = programInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_PROGRAM:${input.budgetUnitId}:${input.kind}:${input.code}`}))`;
    const groups = await tx.sstExposureGroup.findMany({ where: { id: { in: input.groups.map((group) => group.groupId) }, budgetUnitId: input.budgetUnitId, isActive: true, startsAt: { lte: input.endsAt }, OR: [{ endsAt: null }, { endsAt: { gte: input.startsAt } }] } });
    if (groups.length !== input.groups.length) throw new SstValidationError("Um dos GHEs não pertence à UG ou está fora da vigência.");
    const responsible = await tx.person.findUnique({ where: { id: input.responsiblePersonId }, select: { id: true, fullName: true } });
    if (!responsible) throw new SstValidationError("Responsável não encontrado no Cadastro Único.");
    const previous = await tx.sstOccupationalProgram.findFirst({ where: { budgetUnitId: input.budgetUnitId, code: input.code, kind: input.kind }, orderBy: { version: "desc" }, select: { version: true } });
    const program = await tx.sstOccupationalProgram.create({ data: {
      budgetUnitId: input.budgetUnitId, code: input.code, kind: input.kind, version: (previous?.version || 0) + 1,
      startsAt: input.startsAt, endsAt: input.endsAt, responsiblePersonId: input.responsiblePersonId,
      responsibleCouncil: input.responsibleCouncil, responsibleSnapshot: { name: responsible.fullName, council: input.responsibleCouncil }, content: input.content, createdById: context.user.id,
      groups: { create: input.groups.map((entry) => {
        const group = groups.find((item) => item.id === entry.groupId)!;
        return { groupId: group.id, groupSnapshot: { code: group.code, name: group.name, departmentIds: group.departmentIds, roleIds: group.roleIds, startsAt: group.startsAt.toISOString(), endsAt: group.endsAt?.toISOString() || null, conditions: entry.conditions }, risks: entry.risks.map((risk) => ({ ...risk, score: risk.probability === null || risk.severity === null ? null : occupationalRiskScore(risk.probability, risk.severity) })), exams: entry.exams };
      }) },
    } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_PROGRAM_VERSION", targetId: program.id });
    return program.id;
  });
}
