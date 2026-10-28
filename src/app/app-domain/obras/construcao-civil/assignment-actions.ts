"use server";

import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { getPostgresError } from "@/db/errors";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionReplacementSchema, replaceConstructionAnalyst } from "@/lib/obras/construction-assignment";
import { auditEventTypes } from "@/lib/platform/audit-evidence";

export async function substituteConstructionAnalyst(input: unknown) {
  try {
    const data = constructionReplacementSchema.parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const id = await replaceConstructionAnalyst(tx, access, context.user.id, data);
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionAnalystReplacement", targetId: id });
    });
    revalidatePath(`/obras/construcao-civil/${data.caseId}`);
    revalidatePath(`/protocolos/processos`);
    return { success: true };
  } catch (error) {
    if (getPostgresError(error)) return { error: "Não foi possível registrar a substituição. Atualize a página e confira as referências." };
    return { error: constructionActionMessage(error, "Não foi possível concluir a operação.") };
  }
}
