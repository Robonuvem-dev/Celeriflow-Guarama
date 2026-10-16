import { getTenantContextForModule,isSystemAdministrator } from "@/lib/platform/tenant-context";
import { economicActivitySchema } from "@/lib/tributacao/economic-activity-registry";
import EconomicActivitiesClient from "./EconomicActivitiesClient";
import EconomicActivityUnificationClient from "./EconomicActivityUnificationClient";

export const dynamic="force-dynamic";
export default async function EconomicActivitiesPage() {
  const {prisma,user}=await getTenantContextForModule("TRIBUTACAO");const allowed=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units,entries,services,cbos]=await Promise.all([
    prisma.planningEntityUnit.findMany({where:allowed ? {budgetUnitId:{in:allowed}} : {},include:{governmentEntity:true,budgetUnit:true}}),
    prisma.taxRegistryEntry.findMany({where:{entityType:"ECONOMIC_ACTIVITY",category:"ECONOMIC_ACTIVITY_DEFINITION",...(allowed ? {OR:allowed.map(budgetUnitId=>({data:{path:["budgetUnitId"],equals:budgetUnitId}}))} : {})},orderBy:{version:"desc"}}),
    prisma.taxServiceActivity.findMany({where:{isActive:true,tax:{name:{equals:"ISS",mode:"insensitive"}}},select:{id:true,code:true,name:true},orderBy:{code:"asc"}}),
    prisma.healthCbo.findMany({where:{isActive:true},select:{code:true,description:true},orderBy:{code:"asc"}}),
  ]);
  const latest=new Map<string,typeof entries[number]>();for(const entry of entries) if(!latest.has(entry.entityId)) latest.set(entry.entityId,entry);
  const activities=[...latest.values()].map(entry=>({id:entry.entityId,version:entry.version,status:entry.status,data:economicActivitySchema.parse(entry.data)}));
  return <div className="h-full overflow-auto"><EconomicActivitiesClient units={units.map(unit=>({id:unit.budgetUnitId,entityId:unit.governmentEntityId,label:`${unit.governmentEntity.name} · ${unit.budgetUnit.code}`}))} activities={activities} services={services.map(service=>({id:service.id,label:`${service.code} · ${service.name}`}))} cbos={cbos.map(cbo=>({id:cbo.code,label:`${cbo.code} · ${cbo.description}`}))}/><EconomicActivityUnificationClient activities={activities}/></div>;
}
