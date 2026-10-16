"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { publishItbiDocumentModel, issueConfiguredItbiDocument } from "@/lib/tributacao/itbi-document-models";

export async function publishItbiDocumentModelAction(input: Parameters<typeof publishItbiDocumentModel>[2]) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await publishItbiDocumentModel(prisma, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/itbi/modelos"); revalidatePath("/tributacao/itbi/comunicacao"); revalidatePath("/portal/tributario/itbi"); return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar o modelo." }; }
}

export async function issueConfiguredItbiDocumentAction(input: Parameters<typeof issueConfiguredItbiDocument>[2]) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    const result = await issueConfiguredItbiDocument(prisma, { actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } }, input);
    revalidatePath("/tributacao/itbi/comunicacao"); return result;
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível emitir a declaração." }; }
}
