import { getTenantContextForModule,isSystemAdministrator } from "@/lib/platform/tenant-context";
import { economicActivitySchema } from "@/lib/tributacao/economic-activity-registry";
import EconomicActivitiesClient from "./EconomicActivitiesClient";
import EconomicActivityUnificationClient from "./EconomicActivityUnificationClient";
import { db } from "@/db/client";
import { listFiscalPlanningUnits } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { listPageServiceActivities, listPageCbos } from "@/db/repositories/taxation-pages/fiscal-options";

export const dynamic="force-dynamic";
export default async function EconomicActivitiesPage() {
  const context=await getTenantContextForModule("TRIBUTACAO"); const {user}=context; const database=context.database ?? db; const allowed=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const [units,entries,services,cbos]=await Promise.all([
    listFiscalPlanningUnits(database,allowed),
    listFiscalEntries(database,{entityType:"ECONOMIC_ACTIVITY",categories:["ECONOMIC_ACTIVITY_DEFINITION"],allowedBudgetUnitIds:allowed}),
    listPageServiceActivities(database,true),
    listPageCbos(database),
  ]);
  const latest=new Map<string,typeof entries[number]>();for(const entry of entries) if(!latest.has(entry.entityId)) latest.set(entry.entityId,entry);
  const activities=[...latest.values()].map(entry=>({id:entry.entityId,version:entry.version,status:entry.status,data:economicActivitySchema.parse(entry.data)}));
  return <div className="h-full overflow-auto"><EconomicActivitiesClient units={units.map(unit=>({id:unit.budgetUnitId,entityId:unit.governmentEntityId,label:`${unit.governmentEntity.name} · ${unit.budgetUnit.code}`}))} activities={activities} services={services.map(service=>({id:service.id,label:`${service.code} · ${service.name}`}))} cbos={cbos.map(cbo=>({id:cbo.code,label:`${cbo.code} · ${cbo.description}`}))}/><EconomicActivityUnificationClient activities={activities}/></div>;
}
