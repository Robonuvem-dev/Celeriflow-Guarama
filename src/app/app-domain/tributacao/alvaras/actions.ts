"use server";

import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { actionRegistryDefinitions, latestActionRegistryEntry } from "@/db/repositories/tax-actions/registry";
import { actionLicense, actionActiveRegistrations, updateActionLicense } from "@/db/repositories/tax-actions/records";
import { revalidatePath } from "next/cache";
import { issueConfiguredLicenses,licensePolicySchema } from "@/lib/tributacao/license-policy";
import { transitionConfiguredLicense } from "@/lib/tributacao/license-lifecycle";

export async function createLicense(data: {
  licenseType: string;
  taxpayerId: string;
  validUntil: string;
}) {
  try {
    const {connection,database,user}=await taxActionContext("create");
    const allowedBudgetUnitIds=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
    const definitions=await actionRegistryDefinitions(database,"LICENSE_POLICY","LICENSE_POLICY");
    const latest=new Map<string,typeof definitions[number]>();for(const row of definitions) if(!latest.has(row.entityId)) latest.set(row.entityId,row);
    const policies=[...latest.values()].map(entry=>({entry,data:licensePolicySchema.parse(entry.data)})).filter(policy=>policy.data.active && policy.data.year===new Date().getUTCFullYear() && policy.data.name===data.licenseType && (!allowedBudgetUnitIds || allowedBudgetUnitIds.includes(policy.data.budgetUnitId)));
    const registrations=await actionActiveRegistrations(database,data.taxpayerId);
    if(policies.length!==1 || registrations.length!==1) throw new Error("Selecione o tipo anual e a inscrição em Alvarás Configurados para emitir.");
    const [result]=await issueConfiguredLicenses(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds},[{policyId:policies[0].entry.entityId,expectedPolicyVersion:policies[0].entry.version,registrationId:registrations[0].id,expectedRegistrationUpdatedAt:registrations[0].updatedAt.toISOString(),processId:null,feeAssessmentId:null,exempt:false,exemptionReason:"",reason:"Emissão interna pela consulta de alvarás"}]);
    revalidatePath("/tributacao/alvaras");revalidatePath("/tributacao/alvaras/configurados");return {data:result};
  }catch(error){return {error:error instanceof Error ? error.message : "Não foi possível emitir o alvará."};}
}

export async function updateLicense(id: string, data: {
  licenseType?: string;
  validUntil?: string;
}) {
  const { database } = await taxActionContext("update");
  const result = await updateActionLicense(database, id, {
      licenseType: data.licenseType,
      validUntil: data.validUntil ? new Date(data.validUntil) : undefined
  });

  revalidatePath("/tributacao/alvaras");
  return result;
}

export async function deactivateLicense(id: string,reason?:string) {
  const context=await taxActionContext("update");
  const memory=await latestActionRegistryEntry(context.database,"LICENSE",id,"LICENSE_ISSUANCE");
  if(memory) {
    const row=await actionLicense(context.database,id);
    const result=await transitionConfiguredLicense(context.connection,{usuarioId:context.user.id,employeeId:context.user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds},{licenseId:id,expectedUpdatedAt:row.updatedAt.toISOString(),status:"Cancelado",reason:reason ?? ""});
    revalidatePath("/tributacao/alvaras");revalidatePath("/tributacao/alvaras/configurados");return result;
  }
  const { database } = await taxActionContext("update");
  const result = await updateActionLicense(database, id, { status: "Cancelado" });

  revalidatePath("/tributacao/alvaras");
  return result;
}

export async function activateLicense(id: string) {
  const { database } = await taxActionContext("update");
  const result = await updateActionLicense(database, id, { status: "Emitido" });

  revalidatePath("/tributacao/alvaras");
  return result;
}
