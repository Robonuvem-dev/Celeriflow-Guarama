"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionReplacementSchema, replaceConstructionAnalyst } from "@/lib/obras/construction-assignment";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export async function substituteConstructionAnalyst(input: unknown) {
  try {
    const data = constructionReplacementSchema.parse(input);
    const context = await getTenantContextForModuleOperation("OBRAS", "update");
    const access = await resolveConstructionAccess(context);
    await context.prisma.$transaction(async (tx) => {
      const id = await replaceConstructionAnalyst(tx, access, context.user.id, data);
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionAnalystReplacement", targetId: id });
    });
    revalidatePath(`/obras/construcao-civil/${data.caseId}`);
    revalidatePath(`/protocolos/processos`);
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0].message };
    if (error instanceof Prisma.PrismaClientKnownRequestError) return { error: "Não foi possível registrar a substituição. Atualize a página e confira as referências." };
    return { error: error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível concluir a operação." };
  }
}
