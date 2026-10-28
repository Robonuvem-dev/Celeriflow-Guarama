import { getTenantContextForModule,isSystemAdministrator } from "@/lib/platform/tenant-context";
import { licensePolicySchema } from "@/lib/tributacao/license-policy";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ConfiguredLicensesClient from "./ConfiguredLicensesClient";
import LicensePortalPolicyClient from "./LicensePortalPolicyClient";
import LicenseSignaturesClient from "./LicenseSignaturesClient";
import { db } from "@/db/client";
import { listFiscalPlanningUnits, listFiscalRegistrations, listFiscalTaxLabels } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries, listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { listPageSigningCertificates } from "@/db/repositories/taxation-pages/fiscal-options";
import { listLicensePageRows } from "@/db/repositories/taxation-pages/overview";

export const dynamic="force-dynamic";
export default async function ConfiguredLicensesPage() {
  const context=await getTenantContextForModule("TRIBUTACAO"); const {user}=context; const database=context.database ?? db; const allowed=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units,policies,profiles,issuances,taxes]=await Promise.all([
    listFiscalPlanningUnits(database,allowed),
    listFiscalEntries(database,{entityType:"LICENSE_POLICY",categories:["LICENSE_POLICY"],allowedBudgetUnitIds:allowed}),
    listFiscalEntries(database,{entityType:"ECONOMIC_REGISTRATION",categories:["ECONOMIC_PROFILE"],allowedBudgetUnitIds:allowed}),
    listFiscalEntries(database,{entityType:"LICENSE",categories:["LICENSE_ISSUANCE"],allowedBudgetUnitIds:allowed,order:"created"}),
    listFiscalTaxLabels(database,undefined,true),
  ]);
  const latestPolicies=new Map<string,typeof policies[number]>();for(const row of policies) if(!latestPolicies.has(row.entityId)) latestPolicies.set(row.entityId,row);
  const latestProfiles=new Map<string,typeof profiles[number]>();for(const row of profiles) if(!latestProfiles.has(row.entityId)) latestProfiles.set(row.entityId,row);
  const registrationRows=await listFiscalRegistrations(database,{ids:[...latestProfiles.keys()],active:true,order:true});
  const owners=await listPageTaxpayers(database,{ids:registrationRows.map(row=>row.taxpayerId)});
  const registrations=registrationRows.map(row=>{const taxpayer=owners.find(owner=>owner.id===row.taxpayerId);if(!taxpayer)throw new Error("Contribuinte fiscal não encontrado.");return {...row,taxpayer};});
  const licenses=await listLicensePageRows(database,issuances.map(entry=>entry.entityId));
  const configurations=[...latestPolicies.values()].map(entry=>({id:entry.entityId,version:entry.version,data:licensePolicySchema.parse(entry.data)}));
  const memories=new Map(issuances.map(entry=>[entry.entityId,taxScopeSnapshot(entry.data)]));
  const licensePositions=licenses.map(row=>({id:row.id,type:row.licenseType,status:row.status,validUntil:row.validUntil?.toISOString().slice(0,10) ?? "",issuedAt:row.issueDate?.toISOString().slice(0,10) ?? "",taxpayer:String(memories.get(row.id)?.taxpayerName ?? row.taxpayerId ?? ""),inscription:String(memories.get(row.id)?.inscription ?? ""),updatedAt:row.updatedAt.toISOString(),authCode:row.qrCode ?? ""}));
  const [signatures, certificates] = await Promise.all([
    listFiscalEntries(database,{entityType:"LICENSE",entityIds:licenses.map(row=>row.id),categories:["LICENSE_SIGNATURE"],allowedBudgetUnitIds:allowed,order:"none"}),
    listPageSigningCertificates(database),
  ]);
  const signingLicenses = licensePositions.map(row => { const license = licenses.find(item => item.id === row.id)!; return { id: row.id, label: `${row.type} · ${row.inscription} · ${row.taxpayer}`, updatedAt: row.updatedAt, authCode: row.authCode, signed: signatures.some(entry => entry.entityId === row.id), available: license.status === "Emitido" && license.validUntil !== null && license.validUntil >= new Date() }; });
  return <div className="h-full overflow-auto"><ConfiguredLicensesClient units={units.map(unit=>({id:unit.budgetUnitId,entityId:unit.governmentEntityId,label:`${unit.governmentEntity.name} · ${unit.budgetUnit.code}`}))} policies={configurations} registrations={registrations.map(row=>({id:row.id,label:`${row.municipalInsc} · ${row.taxpayer.company?.corporateName ?? row.taxpayer.person?.fullName ?? row.taxpayerId}`,updatedAt:row.updatedAt.toISOString(),budgetUnitId:String(taxScopeSnapshot(latestProfiles.get(row.id)?.data).budgetUnitId)}))} taxes={taxes} licenses={licensePositions}/><LicensePortalPolicyClient policies={configurations}/><LicenseSignaturesClient licenses={signingLicenses} certificates={certificates.filter(row => Array.isArray(row.purposes) && row.purposes.includes("GED")).map(row => ({ id: row.id, label: `${row.alias} · ${row.ownerName}` }))}/></div>;
}
