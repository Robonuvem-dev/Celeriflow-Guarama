import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { actionExclusion } from "@/db/repositories/tax-actions/documents";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const database=taxActionConnection(await getTenantContextForModule("TRIBUTACAO")).db;const item=await actionExclusion(database,id);if(!item?.exportContent)return new Response("Arquivo não encontrado.",{status:404});return new Response(item.exportContent,{headers:{"content-type":"text/plain; charset=utf-8","content-disposition":`attachment; filename="preparacao-exclusao-${item.competence.replace("/","-")}.txt"`,"x-celeriflow-origin":"CONTROLLED_INTERNAL"}});}
