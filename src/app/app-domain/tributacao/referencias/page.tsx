import {db} from "@/db/client";
import {getTenantContextForModule,isSystemAdministrator} from "@/lib/platform/tenant-context";
import {listPageTaxpayers,listFiscalEntries} from "@/db/repositories/taxation-pages/registry";
import {listFiscalActiveUsers,listFiscalPlanningUnits} from "@/db/repositories/taxation-pages/lookups";
import {taxReferenceSchema,latestTaxReferences,taxReferenceCatalogs,type TaxReferenceKind} from "@/lib/tributacao/reference-catalog";
import TaxReferenceClient from "./TaxReferenceClient";
export const dynamic="force-dynamic";
export default async function TaxReferencePage({searchParams}:{searchParams:Promise<{catalogo?:string}>}){
 const query=await searchParams;const initialKind=query.catalogo&&Object.prototype.hasOwnProperty.call(taxReferenceCatalogs,query.catalogo)?query.catalogo as TaxReferenceKind:"atividade";
 const context=await getTenantContextForModule("TRIBUTACAO");const database=context.database??db;
 const allowed=isSystemAdministrator(context.user)?undefined:context.user.allowedBudgetUnitIds;
 const [entries,units,taxpayers,users]=await Promise.all([listFiscalEntries(database,{entityType:"TAX_REFERENCE",categories:["TAX_REFERENCE"],allowedBudgetUnitIds:allowed}),listFiscalPlanningUnits(database,allowed),listPageTaxpayers(database,{active:true}),listFiscalActiveUsers(database)]);
 const rows=latestTaxReferences(entries.map(entry=>({id:entry.entityId,version:entry.version,deleted:entry.status==="EXCLUIDO",data:taxReferenceSchema.parse(entry.data)})));
 return <TaxReferenceClient key={initialKind} initialKind={initialKind} users={users.map(user=>({id:user.id,label:user.nome}))} taxpayers={taxpayers.map(row=>({id:row.id,label:row.company?.corporateName??row.person?.fullName??row.id}))} rows={rows} units={units.map(unit=>({id:unit.budgetUnitId,entityId:unit.governmentEntityId,label:`${unit.governmentEntity.name} · ${unit.budgetUnit.code} · ${unit.budgetUnit.name}`}))}/>;
}
