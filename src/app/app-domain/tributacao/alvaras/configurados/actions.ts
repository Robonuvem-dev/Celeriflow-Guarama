"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { publishLicensePolicy,issueConfiguredLicenses } from "@/lib/tributacao/license-policy";
import { transitionConfiguredLicense } from "@/lib/tributacao/license-lifecycle";
import { signConfiguredLicense } from "@/lib/tributacao/license-signatures";

export async function signConfiguredLicenseAction(input: Parameters<typeof signConfiguredLicense>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    await signConfiguredLicense(connection, { usuarioId: user.id, employeeId: user.employeeId, name: user.name, email: user.email, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/alvaras/configurados"); revalidatePath("/validar-alvara");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível assinar o alvará." }; }
}

export async function publishLicensePolicyAction(input:Parameters<typeof publishLicensePolicy>[2]) {
  try {const {connection,user}=await taxActionContext("update");await publishLicensePolicy(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);revalidatePath("/tributacao/alvaras/configurados");revalidatePath("/portal/tributario/alvaras");return {};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível publicar a configuração."};}
}
export async function issueConfiguredLicensesAction(input:Parameters<typeof issueConfiguredLicenses>[2]) {
  try {const {connection,user}=await taxActionContext("create");const rows=await issueConfiguredLicenses(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);revalidatePath("/tributacao/alvaras/configurados");revalidatePath("/tributacao/alvaras");return {count:rows.length};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível emitir os alvarás."};}
}
export async function transitionConfiguredLicenseAction(input:Parameters<typeof transitionConfiguredLicense>[2]) {
  try {const {connection,user}=await taxActionContext("update");await transitionConfiguredLicense(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);revalidatePath("/tributacao/alvaras/configurados");revalidatePath("/tributacao/alvaras");return {};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível alterar a situação."};}
}
