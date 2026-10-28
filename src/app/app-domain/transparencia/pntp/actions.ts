"use server";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { pntpEvidenceSchema } from "@/lib/transparencia/pntp-policy";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { eq } from "drizzle-orm";
import { transparencyCriteria, transparencyCriterionEvidence } from "@/db/schema/transparency";
import { financialAuditLogs } from "@/db/schema/finance-identity";
export async function recordPntpEvidence(form: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("TRANSPARENCIA", "update");
  const input = pntpEvidenceSchema.parse({ criterionId: form.get("criterionId"), entity: form.get("entity"), year: form.get("year"), status: form.get("status"), notes: form.get("notes"), urls: String(form.get("urls") || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean) });
  const [criterion] = await db.select().from(transparencyCriteria).where(eq(transparencyCriteria.id,input.criterionId)).limit(1);
  if (!criterion) throw new Error("Critério não encontrado.");
  if (!(criterion.applicableEntities as string[]).includes(input.entity) && input.status !== "NOT_APPLICABLE") throw new Error("Matriz não aplicável a esta entidade.");
  await withDatabaseTransaction(databaseConnection,async tx => {
    await tx.insert(transparencyCriterionEvidence).values({...input,reviewedById:context.user.id}).onConflictDoUpdate({target:[transparencyCriterionEvidence.criterionId,transparencyCriterionEvidence.entity,transparencyCriterionEvidence.year],set:{...input,reviewedById:context.user.id,reviewedAt:new Date()}});
    await tx.insert(financialAuditLogs).values({ action: "REVIEW_PNTP_CRITERION", entityType: "TransparencyCriterion", entityId: input.criterionId, authorUsuarioId: context.user.id, payload: { entity: input.entity, year: input.year, status: input.status, urls: input.urls } });
  },{timeoutMs:5_000});
  revalidatePath("/transparencia/pntp"); revalidatePath("/portal/portaldatransparencia/pntp");
}
