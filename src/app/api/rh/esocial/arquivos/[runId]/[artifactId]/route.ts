import { getTenantContextForModule, AccessError } from "@/lib/platform/tenant-context";
import { downloadDemoArtifact } from "@/lib/rh/esocial/service";
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{runId:string;artifactId:string}>}){
 try{const p=await params,file=await downloadDemoArtifact(await getTenantContextForModule('RH'),p.runId,p.artifactId);
 return new Response(file.xml,{headers:{'Content-Type':'application/xml; charset=utf-8','Content-Disposition':`${new URL(request.url).searchParams.get('view')==='1'?'inline':'attachment'}; filename="DEMO-${file.kind}.xml"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Arquivo indisponível.'},{status:error instanceof AccessError?error.status:400});}
}
