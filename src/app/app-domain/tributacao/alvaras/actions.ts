"use server";

import { getTenantContextForModuleOperation,isSystemAdministrator, type ModuleOperation } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { issueConfiguredLicenses,licensePolicySchema } from "@/lib/tributacao/license-policy";
import { transitionConfiguredLicense } from "@/lib/tributacao/license-lifecycle";

async function getTenantPrisma(operation: ModuleOperation) {
  return (await getTenantContextForModuleOperation("TRIBUTACAO", operation)).prisma;
}

export async function createLicense(data: {
  licenseType: string;
  taxpayerId: string;
  validUntil: string;
}) {
  try {
    const {prisma,user}=await getTenantContextForModuleOperation("TRIBUTACAO","create");
    const allowedBudgetUnitIds=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
    const definitions=await prisma.taxRegistryEntry.findMany({where:{entityType:"LICENSE_POLICY",category:"LICENSE_POLICY"},orderBy:{version:"desc"}});
    const latest=new Map<string,typeof definitions[number]>();for(const row of definitions) if(!latest.has(row.entityId)) latest.set(row.entityId,row);
    const policies=[...latest.values()].map(entry=>({entry,data:licensePolicySchema.parse(entry.data)})).filter(policy=>policy.data.active && policy.data.year===new Date().getUTCFullYear() && policy.data.name===data.licenseType && (!allowedBudgetUnitIds || allowedBudgetUnitIds.includes(policy.data.budgetUnitId)));
    const registrations=await prisma.economicRegistration.findMany({where:{taxpayerId:data.taxpayerId,status:"Ativo"}});
    if(policies.length!==1 || registrations.length!==1) throw new Error("Selecione o tipo anual e a inscrição em Alvarás Configurados para emitir.");
    const [result]=await issueConfiguredLicenses(prisma,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds},[{policyId:policies[0].entry.entityId,expectedPolicyVersion:policies[0].entry.version,registrationId:registrations[0].id,expectedRegistrationUpdatedAt:registrations[0].updatedAt.toISOString(),processId:null,feeAssessmentId:null,exempt:false,exemptionReason:"",reason:"Emissão interna pela consulta de alvarás"}]);
    revalidatePath("/tributacao/alvaras");revalidatePath("/tributacao/alvaras/configurados");return {data:result};
  }catch(error){return {error:error instanceof Error ? error.message : "Não foi possível emitir o alvará."};}
}

export async function updateLicense(id: string, data: {
  licenseType?: string;
  validUntil?: string;
}) {
  const prisma = await getTenantPrisma("update");
  const result = await prisma.license.update({
    where: { id },
    data: {
      licenseType: data.licenseType,
      validUntil: data.validUntil ? new Date(data.validUntil) : undefined
    }
  });

  revalidatePath("/tributacao/alvaras");
  return result;
}

export async function deactivateLicense(id: string,reason?:string) {
  const context=await getTenantContextForModuleOperation("TRIBUTACAO","update");
  const memory=await context.prisma.taxRegistryEntry.findFirst({where:{entityType:"LICENSE",entityId:id,category:"LICENSE_ISSUANCE"}});
  if(memory) {
    const row=await context.prisma.license.findUniqueOrThrow({where:{id}});
    const result=await transitionConfiguredLicense(context.prisma,{usuarioId:context.user.id,employeeId:context.user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds},{licenseId:id,expectedUpdatedAt:row.updatedAt.toISOString(),status:"Cancelado",reason:reason ?? ""});
    revalidatePath("/tributacao/alvaras");revalidatePath("/tributacao/alvaras/configurados");return result;
  }
  const prisma = await getTenantPrisma("update");
  const result = await prisma.license.update({
    where: { id },
    data: { status: "Cancelado" }
  });

  revalidatePath("/tributacao/alvaras");
  return result;
}

export async function activateLicense(id: string) {
  const prisma = await getTenantPrisma("update");
  const result = await prisma.license.update({
    where: { id },
    data: { status: "Emitido" }
  });

  revalidatePath("/tributacao/alvaras");
  return result;
}
