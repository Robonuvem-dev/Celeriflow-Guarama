import {config} from "dotenv";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {randomUUID} from "node:crypto";
import assert from "node:assert/strict";
config({path:".env.local",quiet:true});
async function main(){
 const socket=createServer();await new Promise<void>(resolve=>socket.listen(0,"127.0.0.1",resolve));const address=socket.address();if(!address||typeof address==="string")throw new Error("Porta não disponível.");const port=address.port;await new Promise<void>((resolve,reject)=>socket.close(error=>error?reject(error):resolve()));
 const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{stdio:["ignore","pipe","pipe"],env:{...process.env,NODE_ENV:"production",CELERIFLOW_PUBLIC_BASE_URL:`http://127.0.0.1:${port}`}});
 child.stderr.on("data",chunk=>process.stderr.write(chunk));const base=`http://127.0.0.1:${port}`;
 const {prisma}=await import("../src/lib/prisma");let requestId:string|null=null;
 try{
  for(let attempt=0;attempt<60;attempt++){try{const response=await fetch(`${base}/api/health`);if(response.ok)break;}catch{}if(attempt===59)throw new Error("Servidor não iniciou.");await new Promise(resolve=>setTimeout(resolve,1000));}
  for(const path of ["/portal/portaldatransparencia?year=2026&source=DOCUMENTOS","/portal/portaldatransparencia?view=servidores&year=2026&source=EXEMPLO&entity=camara","/portal/portaldatransparencia?view=obras&year=2026&source=EXEMPLO&entity=consolidado","/portal/portaldatransparencia/painel?source=EXEMPLO&year=2026","/portal/acesso-informacao","/portal/ouvidoria","/portal/portaldatransparencia/pntp","/portal/portaldatransparencia/mapa","/portal/portaldatransparencia/estatisticas"]){const response=await fetch(base+path);assert.equal(response.status,200,path);const html=await response.text();assert.ok(!html.includes("Application error: a server-side exception"),path);console.log(JSON.stringify({path,status:response.status}));}
  const dataResponse=await fetch(`${base}/api/transparencia/consultas/despesas?source=EXEMPLO&year=2026&entity=camara&page=3&pageSize=20`),data=await dataResponse.json();assert.equal(data.total,180);assert.equal(data.records.length,20);assert.equal(data.page,3);
  for(const [format,signature] of [["csv",null],["txt",null],["pdf","%PDF-"],["xlsx","PK"],["docx","PK"],["jpeg","PK"]]){const response=await fetch(`${base}/api/transparencia/consultas/despesas?source=EXEMPLO&year=2026&format=${format}`);assert.equal(response.status,200,format||"");const bytes=Buffer.from(await response.arrayBuffer());if(signature)assert.equal(bytes.subarray(0,signature.length).toString(),signature);console.log(JSON.stringify({format,status:response.status,bytes:bytes.length}));}
  const fullJson=await fetch(`${base}/api/transparencia/consultas/despesas?source=EXEMPLO&year=2026&format=json`);assert.equal((await fullJson.json()).records.length,180);
  const dictionary=await fetch(`${base}/api/transparencia/consultas/despesas?source=API_IBEMA&year=2026&format=schema`);assert.equal(dictionary.status,200);assert.ok((await dictionary.json()).columns.length>0);
  const legacy=await fetch(`${base}/portal-transparencia?view=receitas`,{redirect:"manual"});assert.equal(legacy.status,307);assert.ok(legacy.headers.get("location")?.includes("/portal/portaldatransparencia?view=receitas"));
  const admin=await fetch(`${base}/transparencia/publicacoes`,{redirect:"manual"});assert.equal(admin.status,307);assert.ok(admin.headers.get("location")?.includes("/login"));
  const unauthorized=await fetch(`${base}/api/transparencia/gestao/confirmar-upload`,{method:"POST",headers:{"Content-Type":"application/json",origin:base},body:"{}"});assert.ok([401,403].includes(unauthorized.status));
  const create=await fetch(`${base}/api/transparencia/cidadao`,{method:"POST",headers:{"Content-Type":"application/json",origin:base},body:JSON.stringify({type:"ESIC",name:"Teste automatizado do Portal",email:"teste@example.test",subject:`TESTE TEMPORÁRIO ${randomUUID()}`,message:"Pedido de teste automatizado para verificar o protocolo, a chave privada e o acompanhamento da resposta."})});assert.equal(create.status,201);const receipt=await create.json();const request=await prisma.transparencyCitizenRequest.findUniqueOrThrow({where:{protocol:receipt.protocol}});requestId=request.id;
  await prisma.transparencyCitizenRequest.update({where:{id:requestId},data:{status:"RESPONDIDO",response:"Resposta de teste automatizado.",respondedAt:new Date()}});
  const consult=async(token:string)=>fetch(`${base}/api/transparencia/cidadao`,{method:"POST",headers:{"Content-Type":"application/json",origin:base},body:JSON.stringify({operation:"consultar",protocol:receipt.protocol,token})});
  assert.equal((await consult("0".repeat(64))).status,404);const answer=await consult(receipt.token);assert.equal(answer.status,200);const body=await answer.json();assert.equal(body.status,"RESPONDIDO");assert.equal(body.response,"Resposta de teste automatizado.");assert.ok(!("message"in body)&&!("email"in body)&&!("accessHash"in body));
  const operate=async(operation:string,data:Record<string,unknown>)=>fetch(`${base}/api/transparencia/cidadao`,{method:"POST",headers:{"Content-Type":"application/json",origin:base},body:JSON.stringify({operation,protocol:receipt.protocol,token:receipt.token,...data})});
  const appeal=await operate("recorrer",{message:"Fundamentação de teste para conferir o recurso privado ao SIC."});assert.equal(appeal.status,200);assert.equal((await appeal.json()).level,1);
  const rating=await operate("avaliar",{rating:5,comment:"Avaliação temporária do smoke HTTP"});assert.equal(rating.status,200);
  console.log(JSON.stringify({status:"PASS",pages:9,exports:7,dictionaryWithoutExternalFetch:true,privateRequestRoundTrip:true,appealAndRating:true,unauthorizedManagementBlocked:true}));
 }finally{if(requestId){await prisma.transparencyCitizenAppeal.deleteMany({where:{requestId}});await prisma.transparencySatisfaction.deleteMany({where:{requestId}});await prisma.transparencyCitizenRequest.delete({where:{id:requestId}});}await prisma.$disconnect();child.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
