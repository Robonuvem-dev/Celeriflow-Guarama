"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { analyzeItbiDeclaration, createItbiDeclaration, generateItbiDocument, issueItbiDam, transmitItbiDeclaration, confirmItbiWithDocuments } from "@/lib/tributacao/s3-service";
import { saveItbiTransactionType } from "@/lib/tributacao/itbi-parameters";
import { transferItbiManually } from "@/lib/tributacao/itbi-ownership";

const path = "/tributacao/itbi";
const result = (error?: unknown) => ({ error: error instanceof Error ? error.message : error ? "Não foi possível concluir a operação." : undefined });

export async function transferItbiManuallyAction(input: Parameters<typeof transferItbiManually>[2]) {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await transferItbiManually(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input);
    revalidatePath(path); revalidatePath("/tributacao/imoveis"); return result();
  } catch (error) { return result(error); }
}

export async function saveItbiTypeAction(input: Parameters<typeof saveItbiTransactionType>[2]) {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await saveItbiTransactionType(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input);
    revalidatePath(path); return result();
  } catch (error) { return result(error); }
}

export async function createItbiAction(input: Parameters<typeof createItbiDeclaration>[2]) {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    const declaration = await createItbiDeclaration(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, input);
    const warnings = await context.prisma.itbiEvent.findMany({ where: { declarationId: declaration.id, eventType: "AVISO_INCLUSAO" }, select: { description: true }, orderBy: { createdAt: "asc" } });
    revalidatePath(path); return { ...result(), warnings: warnings.map(row => row.description) };
  } catch (error) { return result(error); }
}

export async function transmitItbiAction(id: string) {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await transmitItbiDeclaration(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, id);
    revalidatePath(path); return result();
  } catch (error) { return result(error); }
}

export async function analyzeItbiAction(input: { declarationId: string; approved: boolean; notes: string }) {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
    if (input.approved) await confirmItbiWithDocuments(context.prisma, actor, input);
    else await analyzeItbiDeclaration(context.prisma, actor, input);
    revalidatePath(path); return result();
  } catch (error) { return result(error); }
}

export async function issueItbiDamAction(id: string) {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    await issueItbiDam(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, id);
    revalidatePath(path); revalidatePath("/tributacao/guias"); return result();
  } catch (error) { return result(error); }
}

export async function generateItbiDocumentAction(id: string) {
  try {
    const context = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
    await generateItbiDocument(context.prisma, { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds }, id);
    revalidatePath(path); return result();
  } catch (error) { return result(error); }
}
