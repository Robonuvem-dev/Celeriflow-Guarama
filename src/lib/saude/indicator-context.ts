import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const careContextSchema = z.object({ professionalId: z.string(), professionalCbo: z.string().nullable(), team: z.object({ id: z.string(), name: z.string(), unitId: z.string(), classification: z.string().nullable() }).nullable() });
export async function captureCareIndicatorContext(tx: Prisma.TransactionClient, professionalId: string, unitId: string) {
  const professional = await tx.healthProfessional.findUniqueOrThrow({ where: { id: professionalId }, select: { cbo: true, team: { select: { id: true, name: true, unitId: true, classification: true, isActive: true } } } });
  const team = professional.team?.isActive && professional.team.unitId === unitId ? professional.team : null;
  return { professionalId, professionalCbo: professional.cbo, team: team ? { id: team.id, name: team.name, unitId: team.unitId, classification: team.classification } : null };
}
export async function classifyHealthTeam(context: AppContext, raw: unknown) {
  const input = z.object({ teamId: z.string().min(1), classification: z.enum(["EMULTI", "OTHER"]), reason: z.string().trim().min(3).max(4000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HealthTeam" WHERE id=${input.teamId} FOR UPDATE`;
    const team = await tx.healthTeam.findUniqueOrThrow({ where: { id: input.teamId }, select: { unitId: true, classification: true } });
    assertHealthUnitAccess(context.user, team.unitId);
    await tx.healthTeam.update({ where: { id: input.teamId }, data: { classification: input.classification } });
    await tx.healthTeamClassificationEvent.create({ data: { teamId: input.teamId, before: team.classification, after: input.classification, reason: input.reason, actorUsuarioId: context.user.id, createdAt: new Date() } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_TEAM_CLASSIFICATION", targetId: input.teamId });
    return { id: input.teamId };
  });
}
export function consultationKind(cbo: string | null | undefined): "MEDICAL" | "DENTAL" | "OTHER" {
  const code = cbo?.replace(/\D/g, "") || "";
  return code.startsWith("225") || code.startsWith("2231") ? "MEDICAL" : code.startsWith("2232") ? "DENTAL" : "OTHER";
}
