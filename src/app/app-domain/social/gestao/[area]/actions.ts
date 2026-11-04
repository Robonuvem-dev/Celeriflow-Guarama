"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { socialWorkflowAreas, type SocialField, type SocialWorkflowArea } from "@/lib/social/workflow-contract";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { saveSocialWorkflow } from "@/db/repositories/social/workflow-operations";
import { readSocialWorkflow } from "@/db/repositories/social/workflow-queries";
import { getPostgresError } from "@/db/errors";

export async function saveSocialWorkflowAction(raw: unknown): Promise<{ id?: string; error?: string }> {
  try {
    const input = z.object({ area: z.string(), id: z.string().optional(), values: z.record(z.string(), z.string()) }).parse(raw);
    if (!Object.hasOwn(socialWorkflowAreas, input.area)) throw new Error("Rotina inválida.");
    const area = input.area as SocialWorkflowArea;
    const context = await getTenantContextForModuleOperation("SOCIAL", input.id ? "update" : "create");
    const access = await resolveSocialAccess(context);
    const id = await withDatabaseTransaction(databaseConnection, async tx => {
      const snapshot = await readSocialWorkflow(tx, access, area);
      if (!access.administrator) for (const field of socialWorkflowAreas[area].fields as SocialField[]) {
        const value = input.values[field.key];
        if (field.reference && value && !(snapshot.options[field.reference] || []).some(option => option.id === value)) throw new Error(`${field.label}: referência fora do seu escopo.`);
      }
      if (input.id) {
        const current = snapshot.rows.find(row => row.id === input.id);
        if (!current || current.immutable) throw new Error("Registro indisponível para edição no seu escopo.");
        if (!access.administrator && current.unitId && input.values.unitId && input.values.unitId !== current.unitId) throw new Error("Transferência de unidade exige administração.");
      }
      return saveSocialWorkflow(tx, access, area, input.id, input.values);
    });
    revalidatePath("/app-domain/social", "layout");
    revalidatePath("/app-domain/cadastros", "layout");
    return { id };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0].message };
    if (getPostgresError(error)) return { error: "Não foi possível salvar: confira duplicidade, referências e integridade dos dados." };
    return { error: error instanceof Error ? error.message : "Falha ao salvar registro." };
  }
}
