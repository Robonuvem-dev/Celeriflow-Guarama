"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { analyzeItbiDeclaration, createItbiDeclaration, generateItbiDocument, issueItbiDam, transmitItbiDeclaration, confirmItbiWithDocuments } from "@/lib/tributacao/s3-service";
import { saveItbiTransactionType } from "@/lib/tributacao/itbi-parameters";
import { transferItbiManually } from "@/lib/tributacao/itbi-ownership";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { actionItbiWarnings } from "@/db/repositories/tax-actions/registry";

const path = "/tributacao/itbi";
const result = (error?: unknown) => ({ error: error instanceof Error ? error.message : error ? "Não foi possível concluir a operação." : undefined });

export async function transferItbiManuallyAction(input: Parameters<typeof transferItbiManually>[2]) {
  try {
    const context = await taxActionContext("update");
    await transferItbiManually(context.connection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input);
    revalidatePath(path); revalidatePath("/tributacao/imoveis"); return result();
  } catch (error) { return result(error); }
}

export async function saveItbiTypeAction(input: Parameters<typeof saveItbiTransactionType>[2]) {
  try {
    const context = await taxActionContext("update");
    await saveItbiTransactionType(context.connection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input);
    revalidatePath(path); return result();
  } catch (error) { return result(error); }
}

export async function createItbiAction(input: Parameters<typeof createItbiDeclaration>[2]) {
  try {
    const context = await taxActionContext("create");
    const declaration = await createItbiDeclaration(context.connection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input);
    const warnings = await actionItbiWarnings(context.database, declaration.id);
    revalidatePath(path); return { ...result(), warnings: warnings.map(row => row.description) };
  } catch (error) { return result(error); }
}

export async function transmitItbiAction(id: string) {
  try {
    const context = await taxActionContext("update");
    await transmitItbiDeclaration(context.connection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, id);
    revalidatePath(path); return result();
  } catch (error) { return result(error); }
}

export async function analyzeItbiAction(input: { declarationId: string; approved: boolean; notes: string }) {
  try {
    const context = await taxActionContext("update");
    const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
    if (input.approved) await confirmItbiWithDocuments(context.connection, actor, input);
    else await analyzeItbiDeclaration(context.connection, actor, input);
    revalidatePath(path); return result();
  } catch (error) { return result(error); }
}

export async function issueItbiDamAction(id: string) {
  try {
    const context = await taxActionContext("create");
    await issueItbiDam(context.connection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, id);
    revalidatePath(path); revalidatePath("/tributacao/guias"); return result();
  } catch (error) { return result(error); }
}

export async function generateItbiDocumentAction(id: string) {
  try {
    const context = await taxActionContext("create");
    await generateItbiDocument(context.connection, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, id);
    revalidatePath(path); return result();
  } catch (error) { return result(error); }
}
