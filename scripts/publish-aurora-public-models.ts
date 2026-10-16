import {config} from "dotenv";
import {createHash} from "node:crypto";
import {put,get} from "@vercel/blob";
import {getBlobDocumentPrefix} from "../src/lib/platform/blob";
import {auroraPublicModels} from "../src/lib/transparencia/aurora-models";
import {renderTransparencyFile} from "../src/lib/transparencia/export-files";
import {parseTransparencyQuery,type PublicCollection,type PublicDataset} from "../src/lib/transparencia/query-contract";
config({path:".env.local",quiet:true});
const apply=process.argv.includes("--apply");
async function main(){const {prisma}=await import("../src/lib/prisma");try{let created=0,reused=0;for(const model of auroraPublicModels)for(const entity of ["prefeitura","camara"] as const){const id=`aurora-public-model:${entity}:${model.code}:v1`;if(await prisma.transparencyPublication.findUnique({where:{id}})){reused++;continue;}if(!apply){created++;continue;}
 const collection:PublicCollection={slug:"publicacoes",title:`Aurora das Veredas — MODELO/PROPOSTA — ${model.title}`,group:model.group,description:"Modelo próprio autorizado para apresentação e adoção; não é ato promulgado nem decisão de tribunal.",columns:[{key:"section",label:"Seção"},{key:"text",label:"Conteúdo do modelo"}],filters:[],amountFields:[]};
 const query=parseTransparencyQuery(new URLSearchParams(`entity=${entity}&source=EXEMPLO&year=2026`)),dataset:PublicDataset={records:model.sections.map(([section,text],index)=>({key:`model-${index}`,entity,year:2026,values:{section,text}})),source:"EXEMPLO",status:"AVAILABLE",complete:true,updatedAt:null,provenance:"Modelo próprio de Aurora das Veredas, baseado em fontes públicas e autorizado pelo responsável. Estágio REFERENCIA; sem ato, nomeação, aprovação ou julgamento presumidos."};
 const file=await renderTransparencyFile(collection,dataset,query,"pdf"),sha256=createHash("sha256").update(file.bytes).digest("hex"),filename=`aurora-${entity}-${model.code}-modelo-v1.pdf`,blob=await put(`${getBlobDocumentPrefix()}transparencia/modelos/${filename}`,file.bytes,{access:"private",token:process.env.BLOB_READ_WRITE_TOKEN,contentType:file.contentType,addRandomSuffix:true});
 const stored=await get(blob.url,{access:"private",token:process.env.BLOB_READ_WRITE_TOKEN});if(!stored||createHash("sha256").update(Buffer.from(await new Response(stored.stream).arrayBuffer())).digest("hex")!==sha256)throw new Error("Modelo não confirmado no Blob.");
 await prisma.transparencyPublication.create({data:{id,title:`MODELO/PROPOSTA — Aurora — ${model.title}`,collectionSlug:"publicacoes",entity,year:2026,group:model.group,referencePeriod:"2026 — modelo próprio para adoção",documentKind:model.kind,legalStage:"REFERENCIA",source:"DOCUMENTOS",status:"PUBLISHED",publishedAt:new Date(),values:{origin:dataset.provenance,sourceMunicipality:"Aurora das Veredas — modelo, não documento de Ibema",sizeBytes:file.bytes.length},fileUrl:blob.url,filePathname:blob.pathname,filename,contentType:file.contentType,sha256}});created++;
 }console.log(JSON.stringify({mode:apply?"PUBLISHED_MODELS":"READ_ONLY",created,reused,legalStage:"REFERENCIA",presumedLegalActs:false,presumedCourtJudgments:false}));}finally{await prisma.$disconnect();}}
main().catch(error=>{console.error(error);process.exitCode=1;});
