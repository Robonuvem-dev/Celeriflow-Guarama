"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveSocialAccess, assertSocialUnitAccess } from "@/lib/social/access-policy";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { applySocialImport, previewSocialImport } from "@/db/repositories/social/imports";
import { socialImportBatches } from "@/db/schema/social-workflows";
import { socialImportLayouts } from "@/db/schema/social-operation-models";
import { getPostgresError } from "@/db/errors";

export async function socialImportAction(form: FormData): Promise<{ id?: string; error?: string }> {
  try {
    const context = await getTenantContextForModuleOperation("SOCIAL", "create"), access = await resolveSocialAccess(context);
    if (!access.administrator) throw new Error("Importação e conciliação restritas à administração.");
    const id = await withDatabaseTransaction(databaseConnection, async tx => {
      const batchId = String(form.get("batchId") || "");
      if (batchId) {
        const [batch] = await tx.select().from(socialImportBatches).where(eq(socialImportBatches.id, batchId));
        if (!batch) throw new Error("Lote inexistente."); assertSocialUnitAccess(access, batch.unitId);
        return applySocialImport(tx, batchId, context.user.id);
      }
      const unitId = z.string().min(1).parse(form.get("unitId")); assertSocialUnitAccess(access, unitId);
      const file = form.get("file"); if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) throw new Error("Selecione CSV de até 5 MB.");
      const layoutId=String(form.get("layoutId")||"");
      const [layout]=layoutId?await tx.select().from(socialImportLayouts).where(eq(socialImportLayouts.id,layoutId)):[];
      const content=new TextDecoder(layout?.configuration.encoding||"utf-8",{fatal:true}).decode(await file.arrayBuffer());
      return previewSocialImport(tx, { unitId, filename: file.name, content, actorId: context.user.id, layoutId:layoutId||undefined });
    }, { timeoutMs: 120000 });
    revalidatePath("/app-domain/social", "layout"); return { id };
  } catch (error) { return { error: getPostgresError(error) ? "Conflito cadastral ou erro de persistência. O lote não foi aplicado parcialmente." : error instanceof Error ? error.message : "Falha na importação." }; }
}
