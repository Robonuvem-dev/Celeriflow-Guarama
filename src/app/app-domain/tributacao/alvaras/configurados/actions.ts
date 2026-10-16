"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForModuleOperation,isSystemAdministrator } from "@/lib/platform/tenant-context";
import { publishLicensePolicy,issueConfiguredLicenses } from "@/lib/tributacao/license-policy";
import { transitionConfiguredLicense } from "@/lib/tributacao/license-lifecycle";
import { signConfiguredLicense } from "@/lib/tributacao/license-signatures";

export async function signConfiguredLicenseAction(input: Parameters<typeof signConfiguredLicense>[2]) {
  try {
    const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "update");
    await signConfiguredLicense(prisma, { usuarioId: user.id, employeeId: user.employeeId, name: user.name, email: user.email, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/alvaras/configurados"); revalidatePath("/validar-alvara");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível assinar o alvará." }; }
}

export async function publishLicensePolicyAction(input:Parameters<typeof publishLicensePolicy>[2]) {
  try {const {prisma,user}=await getTenantContextForModuleOperation("TRIBUTACAO","update");await publishLicensePolicy(prisma,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);revalidatePath("/tributacao/alvaras/configurados");revalidatePath("/portal/tributario/alvaras");return {};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível publicar a configuração."};}
}
export async function issueConfiguredLicensesAction(input:Parameters<typeof issueConfiguredLicenses>[2]) {
  try {const {prisma,user}=await getTenantContextForModuleOperation("TRIBUTACAO","create");const rows=await issueConfiguredLicenses(prisma,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);revalidatePath("/tributacao/alvaras/configurados");revalidatePath("/tributacao/alvaras");return {count:rows.length};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível emitir os alvarás."};}
}
export async function transitionConfiguredLicenseAction(input:Parameters<typeof transitionConfiguredLicense>[2]) {
  try {const {prisma,user}=await getTenantContextForModuleOperation("TRIBUTACAO","update");await transitionConfiguredLicense(prisma,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);revalidatePath("/tributacao/alvaras/configurados");revalidatePath("/tributacao/alvaras");return {};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível alterar a situação."};}
}
