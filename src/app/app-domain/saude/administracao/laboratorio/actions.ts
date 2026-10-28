"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { and, eq } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { createId } from "@/db/ids";
import { healthUnits } from "@/db/schema/health-workforce";
import { pageLaboratoryConfigurations } from "@/db/schema/health-pages";

const schema = z.object({
  unitId: z.string().min(1, "Selecione a unidade."),
  laboratoryName: z.string().trim().min(3, "Informe o nome do laboratório.").max(160),
  collectionStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inicial inválido."),
  collectionEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário final inválido."),
  resultReleaseDays: z.number().int().min(0).max(365),
  allowsExternalProcessing: z.boolean(),
  requiresTechnicalReview: z.boolean(),
  usesDigitalSignature: z.boolean().default(false),
  publishesPatientPortal: z.boolean().default(false),
  resultFooterMessage: z.string().trim().max(500).nullable().default(null),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o início da vigência."),
  effectiveUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
}).strict();

export async function saveLaboratoryConfiguration(data: unknown): Promise<{ success: true; id: string } | { error: string }> {
  try {
    const input = schema.parse(data);
    if (input.collectionEndTime <= input.collectionStartTime) throw new Error("O horário final deve ser posterior ao inicial.");
    if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) throw new Error("O fim da vigência deve ser posterior ao início.");
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    const [unit] = await (context.database ?? db).select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, input.unitId), eq(healthUnits.isActive, true))).limit(1);
    if (!unit) throw new Error("Unidade de saúde ativa não encontrada.");
    const configuration = await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.update(pageLaboratoryConfigurations).set({ isActive: false }).where(and(eq(pageLaboratoryConfigurations.unitId, input.unitId), eq(pageLaboratoryConfigurations.isActive, true)));
      return (await tx.insert(pageLaboratoryConfigurations).values({ ...input, id: createId(), isActive: true, createdAt: new Date(), createdByUsuarioId: context.user.id }).returning({ id: pageLaboratoryConfigurations.id }))[0];
    });
    revalidatePath("/app-domain/saude/administracao/laboratorio");
    return { success: true, id: configuration.id };
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0]?.message || "Dados inválidos." : error instanceof Error ? error.message : "Não foi possível salvar a configuração." };
  }
}
