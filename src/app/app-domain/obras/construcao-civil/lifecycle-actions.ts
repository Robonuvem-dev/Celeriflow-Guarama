"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { applyConstructionPropertyUpdate, completeConstructionLifecycle, openConstructionPropertyUpdate, recordConstructionInspection, requestConstructionInspection, setConstructionInspectionPlan, startConstructionLifecycle } from "@/lib/obras/construction-lifecycle";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { extendConstructionInspectionDeadline } from "@/lib/obras/construction-lifecycle-deadlines";

export async function executeConstructionLifecycle(operation: string, input: unknown) {
  try {
    const op = z.enum(["PLAN", "START", "REQUEST", "INSPECT", "COMPLETE", "PROPERTY", "APPLY", "EXTEND_INSPECTION"]).parse(operation);
    const context = await getTenantContextForModuleOperation(op === "APPLY" ? "CADASTROS" : "OBRAS", "update");
    if (op === "PROPERTY") await getTenantContextForModuleOperation("PROCESSOS", "create");
    const access = await resolveConstructionAccess(context);
    const result = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const id = op === "PLAN" ? await setConstructionInspectionPlan(tx, access, context.user.id, input)
        : op === "START" ? await startConstructionLifecycle(tx, access, context.user.id, input)
          : op === "REQUEST" ? await requestConstructionInspection(tx, access, context.user.id, input)
            : op === "INSPECT" ? await recordConstructionInspection(tx, access, context.user.id, input)
              : op === "COMPLETE" ? await completeConstructionLifecycle(tx, access, context.user.id, input)
                : op === "EXTEND_INSPECTION" ? await extendConstructionInspectionDeadline(tx, access, context.user.id, input)
                : op === "PROPERTY" ? await openConstructionPropertyUpdate(tx, access, context.user.id, input)
                  : await applyConstructionPropertyUpdate(tx, access, context.user.id, z.object({ updateId: z.string().min(1) }).parse(input).updateId);
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: `ConstructionLifecycle:${op}`, targetId: id });
      return id;
    });
    const data = z.object({ caseId: z.string().optional() }).passthrough().parse(input);
    if (data.caseId) {
      revalidatePath(`/obras/construcao-civil/${data.caseId}/ciclo`);
      revalidatePath(`/portal/construcao-civil/${data.caseId}`);
    }
    revalidatePath("/obras/construcao-civil/vistorias");
    revalidatePath("/cadastros/imoveis");
    revalidatePath("/cadastros/imoveis/atualizacoes-construcao");
    revalidatePath("/protocolos/processos");
    return { success: true, id: result };
  } catch (error) {
    return { error: constructionActionMessage(error, "Não foi possível registrar a operação. Atualize e confira as referências.") };
  }
}
