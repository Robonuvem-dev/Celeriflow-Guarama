import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { appendEconomicAudit, appendEconomicEntry, readLicenseIssuance } from "@/db/repositories/tax-economic/registry";
import { changeEconomicLicenseStatus, lockEconomicLicense, readEconomicLicense } from "@/db/repositories/tax-economic/licenses";
import { setEconomicLicenseActor } from "@/db/repositories/tax-economic/registrations";
import { economicSnapshot } from "@/db/repositories/tax-economic/snapshot";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

export async function transitionConfiguredLicense(db:DatabaseConnection,actor:TaxActor,raw:{licenseId:string;expectedUpdatedAt:string;status:"Cancelado"|"Suspenso";reason:string}) {
  const input=z.object({licenseId:z.string().min(1),expectedUpdatedAt:z.iso.datetime(),status:z.enum(["Cancelado","Suspenso"]),reason:z.string().trim().min(1).max(4000)}).parse(raw);
  return withDatabaseTransaction(db,async tx=>{
    await lockEconomicLicense(tx,input.licenseId);
    const license=await readEconomicLicense(tx,input.licenseId);
    const issuance=await readLicenseIssuance(tx,license.id);
    const scope=taxScopeSnapshot(issuance.data);
    if(actor.allowedBudgetUnitIds && (typeof scope.budgetUnitId!=="string" || !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId))) throw new Error("UG fora do acesso autorizado.");
    if(license.updatedAt.toISOString()!==input.expectedUpdatedAt) throw new Error("Alvará alterado. Recarregue antes de confirmar.");
    if(license.status==="Cancelado" || license.status===input.status) throw new Error("Transição indisponível para a situação atual do alvará.");
    await setEconomicLicenseActor(tx,actor.usuarioId);
    const result=await changeEconomicLicenseStatus(tx,license.id,input.status);
    await appendEconomicEntry(tx,{entityType:"LICENSE",entityId:license.id,category:"LICENSE_LIFECYCLE",title:input.status,actorUsuarioId:actor.usuarioId,data:economicSnapshot({governmentEntityId:scope.governmentEntityId,budgetUnitId:scope.budgetUnitId,before:license.status,after:input.status,reason:input.reason})});
    await appendEconomicAudit(tx,{action:"TRANSITION_CONFIGURED_LICENSE",entityType:"License",entityId:license.id,authorUsuarioId:actor.usuarioId,authorEmployeeId:actor.employeeId,payload:{before:license.status,after:input.status,reason:input.reason}});
    return result;
  },{isolationLevel:"serializable",timeoutMs:5000});
}
