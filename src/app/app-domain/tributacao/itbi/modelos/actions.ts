"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { publishItbiDocumentModel, issueConfiguredItbiDocument } from "@/lib/tributacao/itbi-document-models";

export async function publishItbiDocumentModelAction(input: Parameters<typeof publishItbiDocumentModel>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    await publishItbiDocumentModel(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/itbi/modelos"); revalidatePath("/tributacao/itbi/comunicacao"); revalidatePath("/portal/tributario/itbi"); return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar o modelo." }; }
}

export async function issueConfiguredItbiDocumentAction(input: Parameters<typeof issueConfiguredItbiDocument>[2]) {
  try {
    const { connection, user } = await taxActionContext("create");
    const result = await issueConfiguredItbiDocument(connection, { actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } }, input);
    revalidatePath("/tributacao/itbi/comunicacao"); return result;
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível emitir a declaração." }; }
}
