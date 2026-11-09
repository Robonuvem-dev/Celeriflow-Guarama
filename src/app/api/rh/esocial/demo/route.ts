import { getTenantContextForModule, AccessError } from "@/lib/platform/tenant-context";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { executeDemoCommand, readDemo } from "@/lib/rh/esocial/service";
import { reconciliation } from "@/lib/rh/esocial/engine";
export const runtime="nodejs";
export const maxDuration=180;
export async function POST(request:Request){
  if(!isSameOriginRequest(request))return Response.json({error:'Origem inválida.'},{status:403});
  try{const text=await request.text();if(Buffer.byteLength(text)>2_000_000)return Response.json({error:'Envie até 2 MB.'},{status:413});return Response.json(await executeDemoCommand(await getTenantContextForModule('RH'),JSON.parse(text)));}
  catch(error){return Response.json({error:error instanceof Error?error.message:'Falha no comando.'},{status:error instanceof AccessError?error.status:400});}
}
export async function GET(request:Request){
  try{const p=new URL(request.url).searchParams, row=await readDemo(await getTenantContextForModule('RH'),p.get('employerId')||'',p.get('period')||'2026-10');
    if(!row)return Response.json({run:null},{headers:{'Cache-Control':'private, no-store'}});
    const {artifacts,...state}=row.state;
    return Response.json({runId:row.id,...state,artifacts:artifacts.map(({xml,objectUrl,...metadata})=>metadata),reconciliation:reconciliation(row.state)},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Consulta indisponível.'},{status:error instanceof AccessError?error.status:400});}
}
