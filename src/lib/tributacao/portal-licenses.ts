import { Prisma,type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { configuredLicenseSchema,issueConfiguredLicenseInTransaction,licensePolicySchema } from "./license-policy";

export async function issuePortalLicense(db:PrismaClient,usuarioId:string,raw:{policyId:string;expectedPolicyVersion:number;registrationId:string;expectedRegistrationUpdatedAt:string;feeAssessmentId:string|null}) {
  const input=configuredLicenseSchema.pick({policyId:true,expectedPolicyVersion:true,registrationId:true,expectedRegistrationUpdatedAt:true,feeAssessmentId:true}).parse(raw);
  if(!z.string().min(1).safeParse(usuarioId).success) throw new Error("Conta do cidadão obrigatória.");
  return db.$transaction(async tx=>{
    if (!await tx.usuario.findFirst({ where: { id: usuarioId, ativo: true, perfil: { ativo: true } } })) throw new Error("Conta indisponível para emitir alvarás.");
    const registration=await tx.economicRegistration.findUniqueOrThrow({where:{id:input.registrationId}});
    const grant=await tx.taxpayerPortalAccess.findFirst({where:{usuarioId,taxpayerId:registration.taxpayerId,accessType:"TITULAR",status:"ATIVO",revokedAt:null,grantedAt:{lte:new Date()}}});
    if(!grant || !Array.isArray(grant.scopes) || !grant.scopes.includes("ALVARAS")) throw new Error("Acesso ALVARAS ativo para o titular é obrigatório.");
    const definition=await tx.taxRegistryEntry.findFirstOrThrow({where:{entityType:"LICENSE_POLICY",entityId:input.policyId,category:"LICENSE_POLICY"},orderBy:{version:"desc"}});
    const policy=licensePolicySchema.parse(definition.data);
    if(!policy.allowPortalIssue) throw new Error("A configuração anual não permite emissão pelo portal.");
    return issueConfiguredLicenseInTransaction(tx,{usuarioId,employeeId:null,allowedBudgetUnitIds:[policy.budgetUnitId]},{...input,processId:null,exempt:false,exemptionReason:"",reason:"Emissão solicitada pelo titular autenticado no portal do contribuinte"});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}
