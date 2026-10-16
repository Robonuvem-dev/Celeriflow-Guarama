import { getTenantContextForModule,isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ItbiContestationClient from "./ItbiContestationClient";

export const dynamic="force-dynamic";
export default async function ItbiProcessesPage() {
  const {prisma,user}=await getTenantContextForModule("TRIBUTACAO");const allowed=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const declarations=await prisma.itbiDeclaration.findMany({where:allowed ? {OR:allowed.map(budgetUnitId=>({calculationSnapshot:{path:["budgetUnitId"],equals:budgetUnitId}}))} : {},orderBy:{createdAt:"desc"},take:1000});
  const [requests,documents]=await Promise.all([prisma.taxRegistryEntry.findMany({where:{entityType:"ITBI_DECLARATION",entityId:{in:declarations.map(row=>row.id)},category:"ITBI_CONTESTATION"},orderBy:{createdAt:"desc"}}),prisma.document.findMany({where:{status:"Válido"},select:{id:true,title:true},take:200})]);
  return <ItbiContestationClient declarations={declarations.map(row=>({id:row.id,label:`${row.declarationNumber} · ${row.protocolNumber ?? ""}`,status:row.status,updatedAt:row.updatedAt.toISOString(),declaredValue:row.declaredPropertyValue.toFixed(2),base:row.taxableBase.toFixed(2)}))} requests={requests.map(entry=>({id:entry.id,declarationId:entry.entityId,reason:String(taxScopeSnapshot(entry.data).reason),proposedValue:String(taxScopeSnapshot(entry.data).proposedPropertyValue)}))} documents={documents}/>;
}
