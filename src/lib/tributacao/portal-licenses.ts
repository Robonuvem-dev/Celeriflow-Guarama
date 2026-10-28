import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { hasActiveEconomicAccount, readEconomicPortalGrant, readEconomicRegistration } from "@/db/repositories/tax-economic/registrations";
import { readLicensePolicy } from "@/db/repositories/tax-economic/registry";
import { z } from "zod";
import { configuredLicenseSchema,issueConfiguredLicenseInTransaction,licensePolicySchema } from "./license-policy";

export async function issuePortalLicense(db:DatabaseConnection,usuarioId:string,raw:{policyId:string;expectedPolicyVersion:number;registrationId:string;expectedRegistrationUpdatedAt:string;feeAssessmentId:string|null}) {
  const input=configuredLicenseSchema.pick({policyId:true,expectedPolicyVersion:true,registrationId:true,expectedRegistrationUpdatedAt:true,feeAssessmentId:true}).parse(raw);
  if(!z.string().min(1).safeParse(usuarioId).success) throw new Error("Conta do cidadão obrigatória.");
  return withDatabaseTransaction(db,async tx=>{
    if (!await hasActiveEconomicAccount(tx,usuarioId)) throw new Error("Conta indisponível para emitir alvarás.");
    const registration=await readEconomicRegistration(tx,input.registrationId);
    const grant=await readEconomicPortalGrant(tx,usuarioId,registration.taxpayerId);
    if(!grant || !Array.isArray(grant.scopes) || !grant.scopes.includes("ALVARAS")) throw new Error("Acesso ALVARAS ativo para o titular é obrigatório.");
    const definition=await readLicensePolicy(tx,input.policyId);
    const policy=licensePolicySchema.parse(definition.data);
    if(!policy.allowPortalIssue) throw new Error("A configuração anual não permite emissão pelo portal.");
    return issueConfiguredLicenseInTransaction(tx,{usuarioId,employeeId:null,allowedBudgetUnitIds:[policy.budgetUnitId]},{...input,processId:null,exempt:false,exemptionReason:"",reason:"Emissão solicitada pelo titular autenticado no portal do contribuinte"});
  },{isolationLevel:"serializable",timeoutMs:60000});
}
