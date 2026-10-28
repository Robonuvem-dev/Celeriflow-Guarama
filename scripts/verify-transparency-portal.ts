import {config} from "dotenv";
import {createHash} from "node:crypto";
import {like} from "drizzle-orm";
import {transparencyPublications} from "../src/db/schema/transparency";
config({path:".env.local",quiet:true});
async function main(){
 const {db,databaseConnection}=await import("../src/db/client");
 try{
  const {GET}=await import("../src/app/api/transparencia/publicacoes/[publicKey]/route");
  const {runTransparencyConsultation}=await import("../src/lib/transparencia/consultation-service");
  const {parseTransparencyQuery}=await import("../src/lib/transparencia/query-contract");
  const {transparencyCatalog}=await import("../src/lib/transparencia/consultation-catalog");
  const archive=await db.select({id:transparencyPublications.id,publicKey:transparencyPublications.publicKey,year:transparencyPublications.year,status:transparencyPublications.status,sha256:transparencyPublications.sha256,filePathname:transparencyPublications.filePathname,contentType:transparencyPublications.contentType}).from(transparencyPublications).where(like(transparencyPublications.id,"ibema-archive-%"));
  if(archive.length!==136||archive.some(row=>row.status!=="PUBLISHED"||!row.sha256||!row.filePathname))throw new Error("Acervo não está integralmente publicado.");
  const library=await runTransparencyConsultation(db,"publicacoes",parseTransparencyQuery(new URLSearchParams("source=DOCUMENTOS&entity=prefeitura&year=2026")));
  if(library.total<100)throw new Error("Biblioteca não agrega os documentos por assunto.");
  let verified=0;
  for(const id of ["ibema-archive-ND-001-v1","ibema-archive-ND-053-v1","ibema-archive-ND-014-v1","ibema-archive-ND-081-v1"]){
   const entry=archive.find(row=>row.id===id)!;
   const response=await GET(new Request(`https://www.ibema.celeriflow.com.br/api/transparencia/publicacoes/${entry.publicKey}`),{params:Promise.resolve({publicKey:entry.publicKey})});
   if(response.status!==200)throw new Error(`Download indisponível: ${id}`);
   const bytes=Buffer.from(await response.arrayBuffer());if(createHash("sha256").update(bytes).digest("hex")!==entry.sha256)throw new Error(`Hash divergente: ${id}`);
   verified++;console.log(JSON.stringify({id,httpStatus:response.status,bytes:bytes.length,contentType:response.headers.get("Content-Type"),sha256Verified:true}));
  }
  const retired=await GET(new Request("https://www.ibema.celeriflow.com.br/api/transparencia/publicacoes/chave-inexistente"),{params:Promise.resolve({publicKey:"chave-inexistente"})});if(retired.status!==404)throw new Error("Download desconhecido não recusado.");
  let scenarios=0;
  for(const collection of transparencyCatalog)for(const entity of ["prefeitura","camara","consolidado"]){const result=await runTransparencyConsultation(db,collection.slug,parseTransparencyQuery(new URLSearchParams(`source=EXEMPLO&entity=${entity}&year=2026&page=3`)));if(result.total<125||result.records.length!==20)throw new Error(`Cenário não testável: ${collection.slug}/${entity}`);scenarios++;}
  console.log(JSON.stringify({archive:archive.length,library2026:library.total,verifiedDownloads:verified,exampleScenarios:scenarios,status:"PASS"}));
 }finally{await databaseConnection.pool.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
