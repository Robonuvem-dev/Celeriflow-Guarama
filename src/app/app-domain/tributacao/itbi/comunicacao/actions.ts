"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { grantItbiProcessAccess, sendInternalItbiMessage } from "@/lib/tributacao/itbi-process-channel";
import { configureItbiCorrespondence } from "@/lib/tributacao/itbi-correspondence";
import { decideItbiFiscalTreatment } from "@/lib/tributacao/itbi-fiscal-treatment";
import { rectifyTransferredItbi } from "@/lib/tributacao/itbi-rectification";

export async function rectifyTransferredItbiAction(input: Parameters<typeof rectifyTransferredItbi>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    const result = await rectifyTransferredItbi(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/itbi/comunicacao"); revalidatePath("/tributacao/itbi"); revalidatePath("/portal/tributario/itbi"); revalidatePath("/tributacao/guias"); return result;
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível retificar o ITBI." }; }
}

export async function decideItbiFiscalTreatmentAction(input: Parameters<typeof decideItbiFiscalTreatment>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    const result = await decideItbiFiscalTreatment(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/itbi/comunicacao"); revalidatePath("/tributacao/itbi"); revalidatePath("/portal/tributario/itbi"); return result;
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar o tratamento fiscal." }; }
}

export async function configureItbiCorrespondenceAction(input: Parameters<typeof configureItbiCorrespondence>[2]) {
  try { const { connection, user } = await taxActionContext("update"); await configureItbiCorrespondence(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/itbi/comunicacao"); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível definir a correspondência." }; }
}

export async function grantItbiAccessAction(input: Parameters<typeof grantItbiProcessAccess>[2]) {
  try { const { connection, user } = await taxActionContext("update"); await grantItbiProcessAccess(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/itbi/comunicacao"); revalidatePath("/portal/tributario/itbi"); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível alterar o acesso ao processo." }; }
}
export async function sendInternalItbiMessageAction(input: Parameters<typeof sendInternalItbiMessage>[2]) {
  try { const { connection, user } = await taxActionContext("update"); await sendInternalItbiMessage(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input); revalidatePath("/tributacao/itbi/comunicacao"); revalidatePath("/tributacao/itbi"); revalidatePath("/portal/tributario/itbi"); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a mensagem." }; }
}
