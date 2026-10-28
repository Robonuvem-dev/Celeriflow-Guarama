import { eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { healthProfessionals, healthTeams, healthTeamClassificationEvents } from "@/db/schema/health-workforce";
import { runHealthTransaction } from "./health-transaction";
import { z } from "zod";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";

export const careContextSchema = z.object({ professionalId: z.string(), professionalCbo: z.string().nullable(), team: z.object({ id: z.string(), name: z.string(), unitId: z.string(), classification: z.string().nullable() }).nullable() });
export async function captureCareIndicatorContext(tx: DatabaseExecutor, professionalId: string, unitId: string) {
  const [professional] = await tx.select({ cbo: healthProfessionals.cbo, team: healthTeams }).from(healthProfessionals).leftJoin(healthTeams, eq(healthTeams.id, healthProfessionals.teamId)).where(eq(healthProfessionals.id, professionalId)).limit(1);
  if (!professional) throw new Error("Profissional de saúde não encontrado.");
  const team = professional.team?.isActive && professional.team.unitId === unitId ? professional.team : null;
  return { professionalId, professionalCbo: professional.cbo, team: team ? { id: team.id, name: team.name, unitId: team.unitId, classification: team.classification } : null };
}
export async function classifyHealthTeam(context: AppContext, raw: unknown) {
  const input = z.object({ teamId: z.string().min(1), classification: z.enum(["EMULTI", "OTHER"]), reason: z.string().trim().min(3).max(4000) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthTeam" WHERE id=${input.teamId} FOR UPDATE`);
    const [team] = await tx.select({ unitId: healthTeams.unitId, classification: healthTeams.classification }).from(healthTeams).where(eq(healthTeams.id, input.teamId)).limit(1);
    if (!team) throw new Error("Equipe não encontrada.");
    assertHealthUnitAccess(context.user, team.unitId);
    await tx.update(healthTeams).set({ classification: input.classification }).where(eq(healthTeams.id, input.teamId));
    await tx.insert(healthTeamClassificationEvents).values({ teamId: input.teamId, before: team.classification, after: input.classification, reason: input.reason, actorUsuarioId: context.user.id, createdAt: new Date() });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "HEALTH_TEAM_CLASSIFICATION", targetId: input.teamId });
    return { id: input.teamId };
  });
}
export function consultationKind(cbo: string | null | undefined): "MEDICAL" | "DENTAL" | "OTHER" {
  const code = cbo?.replace(/\D/g, "") || "";
  return code.startsWith("225") || code.startsWith("2231") ? "MEDICAL" : code.startsWith("2232") ? "DENTAL" : "OTHER";
}
