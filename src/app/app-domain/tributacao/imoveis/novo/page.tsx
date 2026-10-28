import { getTenantContextForModule,isSystemAdministrator } from "@/lib/platform/tenant-context";
import { propertyRegistrationPolicySchema } from "@/lib/tributacao/property-profile-schema";
import PropertyProfileClient from "../[id]/perfil/PropertyProfileClient";
import { db } from "@/db/client";
import { listFiscalPlanningUnits, listFiscalProperties, listFiscalProcessOptions, listFiscalDocumentOptions } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries, listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";

export const dynamic="force-dynamic";
export default async function NewPropertyWithProfilePage() {
  const context=await getTenantContextForModule("TRIBUTACAO"); const {user}=context; const database=context.database ?? db; const allowed=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units,policies,taxpayers,properties,processes,documents]=await Promise.all([
    listFiscalPlanningUnits(database,allowed),
    listFiscalEntries(database,{entityType:"BUDGET_UNIT",categories:["PROPERTY_REGISTRATION_POLICY"],allowedBudgetUnitIds:allowed}),
    listPageTaxpayers(database,{active:true,limit:1000}),
    listFiscalProperties(database,{landOnly:true,limit:1000}),
    listFiscalProcessOptions(database),
    listFiscalDocumentOptions(database),
  ]);
  const latest=new Map<string,typeof policies[number]>();for(const policy of policies) if(!latest.has(policy.entityId)) latest.set(policy.entityId,policy);
  return <PropertyProfileClient creating property={{id:"NEW",inscription:"",updatedAt:new Date().toISOString(),taxpayerId:null}} version={0} profile={null} units={units.map(unit=>({id:unit.budgetUnitId,entityId:unit.governmentEntityId,label:`${unit.governmentEntity.name} · ${unit.budgetUnit.code}`}))} policies={[...latest.values()].map(policy=>propertyRegistrationPolicySchema.parse(policy.data))} taxpayers={taxpayers.map(taxpayer=>({id:taxpayer.id,label:taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id}))} properties={properties.map(property=>({id:property.id,label:property.municipalInsc ?? property.id}))} processes={processes.map(process=>({id:process.id,label:process.protocolNumber}))} documents={documents.map(document=>({id:document.id,label:document.title}))}/>;
}
