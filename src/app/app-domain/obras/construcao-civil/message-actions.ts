"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionMessageSchema } from "@/lib/obras/construction-portal-policy";
import { appendConstructionMessage } from "@/lib/obras/construction-conversation";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

export async function sendConstructionInternalMessage(input: unknown) {
  try {
    const data = constructionMessageSchema.parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    if (!access.employeeId || (!access.administrator && !access.roles.length)) throw new Error("Mensagem exige servidor e papel urbanístico vigente.");
    const employeeId = access.employeeId;
    await context.prisma.$transaction(async (tx) => {
      const id = await appendConstructionMessage(tx, { employeeId, access }, data);
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionMessage", targetId: id });
    });
    revalidatePath(`/portal/construcao-civil/${data.caseId}`); revalidatePath(`/obras/construcao-civil/${data.caseId}`); return { success: true };
  } catch (error) { return { error: error instanceof z.ZodError ? error.issues[0].message : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível enviar a mensagem." }; }
}
