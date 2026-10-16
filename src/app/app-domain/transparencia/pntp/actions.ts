"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { pntpEvidenceSchema } from "@/lib/transparencia/pntp-policy";
export async function recordPntpEvidence(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("TRANSPARENCIA", "update");
  const input = pntpEvidenceSchema.parse({ criterionId: form.get("criterionId"), entity: form.get("entity"), year: form.get("year"), status: form.get("status"), notes: form.get("notes"), urls: String(form.get("urls") || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean) });
  const criterion = await context.prisma.transparencyCriterion.findUniqueOrThrow({ where: { id: input.criterionId } });
  if (!(criterion.applicableEntities as string[]).includes(input.entity) && input.status !== "NOT_APPLICABLE") throw new Error("Matriz não aplicável a esta entidade.");
  await context.prisma.$transaction(async tx => {
    await tx.transparencyCriterionEvidence.upsert({ where: { criterionId_entity_year: { criterionId: input.criterionId, entity: input.entity, year: input.year } }, create: { ...input, reviewedById: context.user.id }, update: { ...input, reviewedById: context.user.id, reviewedAt: new Date() } });
    await tx.financialAuditLog.create({ data: { action: "REVIEW_PNTP_CRITERION", entityType: "TransparencyCriterion", entityId: input.criterionId, authorUsuarioId: context.user.id, payload: { entity: input.entity, year: input.year, status: input.status, urls: input.urls } } });
  });
  revalidatePath("/transparencia/pntp"); revalidatePath("/portal/portaldatransparencia/pntp");
}
