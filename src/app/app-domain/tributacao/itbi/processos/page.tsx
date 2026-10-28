import { getTenantContextForModule,isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import ItbiContestationClient from "./ItbiContestationClient";
import { db } from "@/db/client";
import { listFiscalDocumentOptions } from "@/db/repositories/taxation-pages/lookups";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import { listPageItbiDeclarations } from "@/db/repositories/taxation-pages/itbi";

export const dynamic="force-dynamic";
export default async function ItbiProcessesPage() {
  const context=await getTenantContextForModule("TRIBUTACAO"); const {user}=context; const database=context.database ?? db; const allowed=isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds;
  const declarations=await listPageItbiDeclarations(database,{allowedBudgetUnitIds:allowed,order:"created-desc",limit:1000});
  const [requests,documents]=await Promise.all([listFiscalEntries(database,{entityType:"ITBI_DECLARATION",entityIds:declarations.map(row=>row.id),categories:["ITBI_CONTESTATION"],order:"created"}),listFiscalDocumentOptions(database)]);
  return <ItbiContestationClient declarations={declarations.map(row=>({id:row.id,label:`${row.declarationNumber} · ${row.protocolNumber ?? ""}`,status:row.status,updatedAt:row.updatedAt.toISOString(),declaredValue:row.declaredPropertyValue.toFixed(2),base:row.taxableBase.toFixed(2)}))} requests={requests.map(entry=>({id:entry.id,declarationId:entry.entityId,reason:String(taxScopeSnapshot(entry.data).reason),proposedValue:String(taxScopeSnapshot(entry.data).proposedPropertyValue)}))} documents={documents}/>;
}
