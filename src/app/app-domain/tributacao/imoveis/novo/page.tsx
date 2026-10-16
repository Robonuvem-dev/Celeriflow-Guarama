import { getTenantContextForModule,isSystemAdministrator } from "@/lib/platform/tenant-context";
import { propertyRegistrationPolicySchema } from "@/lib/tributacao/property-profile-schema";
import PropertyProfileClient from "../[id]/perfil/PropertyProfileClient";

export const dynamic="force-dynamic";
export default async function NewPropertyWithProfilePage() {
  const {prisma,user}=await getTenantContextForModule("TRIBUTACAO");const allowed=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const scope=allowed ? {OR:allowed.map(budgetUnitId=>({data:{path:["budgetUnitId"],equals:budgetUnitId}}))} : {};
  const [units,policies,taxpayers,properties,processes,documents]=await Promise.all([
    prisma.planningEntityUnit.findMany({where:allowed ? {budgetUnitId:{in:allowed}} : {},include:{governmentEntity:true,budgetUnit:true}}),
    prisma.taxRegistryEntry.findMany({where:{entityType:"BUDGET_UNIT",category:"PROPERTY_REGISTRATION_POLICY",...scope},orderBy:{version:"desc"}}),
    prisma.taxpayer.findMany({where:{status:"Ativo"},select:{id:true,person:{select:{fullName:true}},company:{select:{corporateName:true}}},take:1000}),
    prisma.realEstate.findMany({where:{propertyType:"Terreno",status:"Ativo"},select:{id:true,municipalInsc:true},take:1000}),
    prisma.process.findMany({select:{id:true,protocolNumber:true},orderBy:{createdAt:"desc"},take:200}),
    prisma.document.findMany({where:{status:"Válido"},select:{id:true,title:true},take:200}),
  ]);
  const latest=new Map<string,typeof policies[number]>();for(const policy of policies) if(!latest.has(policy.entityId)) latest.set(policy.entityId,policy);
  return <PropertyProfileClient creating property={{id:"NEW",inscription:"",updatedAt:new Date().toISOString(),taxpayerId:null}} version={0} profile={null} units={units.map(unit=>({id:unit.budgetUnitId,entityId:unit.governmentEntityId,label:`${unit.governmentEntity.name} · ${unit.budgetUnit.code}`}))} policies={[...latest.values()].map(policy=>propertyRegistrationPolicySchema.parse(policy.data))} taxpayers={taxpayers.map(taxpayer=>({id:taxpayer.id,label:taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? taxpayer.id}))} properties={properties.map(property=>({id:property.id,label:property.municipalInsc ?? property.id}))} processes={processes.map(process=>({id:process.id,label:process.protocolNumber}))} documents={documents.map(document=>({id:document.id,label:document.title}))}/>;
}
