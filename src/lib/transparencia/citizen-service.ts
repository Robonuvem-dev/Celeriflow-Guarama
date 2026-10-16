import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import {getTransparencySettings} from "./presentation-settings";
import { openCitizenChannelProcess } from "@/lib/portal-cidadao/citizen-channel-process";

export const citizenRequestSchema=z.object({requestKey:z.uuid().optional(),type:z.enum(["ESIC","DENUNCIA","RECLAMACAO","SUGESTAO","ELOGIO"]),entity:z.enum(["prefeitura","camara"]).default("prefeitura"),name:z.string().trim().max(200).default(""),email:z.union([z.email(),z.literal("")]).default(""),subject:z.string().trim().min(5).max(250),message:z.string().trim().min(20).max(12000)}).strict().refine(value=>value.type!=="ESIC"||Boolean(value.name&&value.email),"Informe nome e e-mail para pedidos de informação.");
const accessHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export async function createCitizenRequest(db:PrismaClient,input:unknown){
  const {requestKey,...data}=citizenRequestSchema.parse(input), requestKeyHash=requestKey?accessHash(`request:${requestKey}`):null,inputHash=accessHash(JSON.stringify(data)),token=requestKey?accessHash(`access:${requestKey}`):randomBytes(32).toString("hex"), protocol=`${new Date().getUTCFullYear()}-${randomBytes(6).toString("hex").toUpperCase()}`;
 const settings=await getTransparencySettings(db),dueAt=new Date(Date.now()+(data.type==="ESIC"?20:30)*86400000);
  return db.$transaction(async tx=>{
   if(requestKeyHash){await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`CITIZEN_CHANNEL:${requestKeyHash}`}))`;const prior=await tx.transparencyCitizenRequest.findUnique({where:{requestKeyHash},select:{protocol:true,inputHash:true,status:true,process:{select:{protocolNumber:true}}}});if(prior){if(prior.inputHash!==inputHash)throw new Error("Chave já utilizada com outro conteúdo.");return {protocol:prior.protocol,token,status:prior.status,centralProtocolNumber:prior.process?.protocolNumber||null};}}
  const routing=settings.citizenService;
  const channelId=data.type==="ESIC"?routing.ticketChannelId:routing.ombudsmanChannelId;
   let nativeTicketId:string|null=null,nativeOmbudsmanId:string|null=null;
   const process=await openCitizenChannelProcess(tx,data.type==="ESIC"?"ESIC":"OUVIDORIA",routing.departmentId,dueAt);
  if(channelId){const channel=await tx.supportChannel.findUniqueOrThrow({where:{id:channelId},select:{isActive:true}});if(!channel.isActive)throw new Error("Canal de atendimento desativado.");
    if(data.type==="ESIC")nativeTicketId=(await tx.ticket.create({data:{ticketNumber:`SIC-${protocol}`,subject:data.subject,description:data.message,channelId,departmentId:routing.departmentId,dueAt,isAnonymous:false,processId:process.id}})).id;
    else nativeOmbudsmanId=(await tx.ombudsman.create({data:{protocolNumber:`PORTAL-${protocol}`,type:({DENUNCIA:"Denúncia",RECLAMACAO:"Reclamação",SUGESTAO:"Sugestão",ELOGIO:"Elogio"} as Record<string,string>)[data.type],subject:data.subject,description:data.message,channelId,departmentId:routing.departmentId,isAnonymous:!data.name,isConfidential:true,processId:process.id}})).id;
  }
   await tx.transparencyCitizenRequest.create({data:{...data,name:data.name||null,email:data.email||null,protocol,accessHash:accessHash(token),dueAt,nativeTicketId,nativeOmbudsmanId,processId:process.id,requestKeyHash,inputHash}});
   return {protocol,token,status:"RECEBIDO",centralProtocolNumber:process.protocolNumber};
  });
}
export async function consultCitizenRequest(db:PrismaClient,protocol:string,token:string){
 if(!/^[a-f0-9]{64}$/.test(token)||!/^\d{4}-[A-F0-9]{12}$/.test(protocol)) return null;
 const entry=await db.transparencyCitizenRequest.findFirst({where:{protocol,accessHash:accessHash(token)},select:{protocol:true,type:true,entity:true,subject:true,status:true,response:true,createdAt:true,respondedAt:true,dueAt:true,outcome:true,extensionReason:true,appeals:{select:{level:true,status:true,response:true,dueAt:true,respondedAt:true,createdAt:true},orderBy:{level:"asc"}},nativeTicket:{select:{status:true,solution:true,resolvedAt:true}},nativeOmbudsman:{select:{status:true,response:true,respondedAt:true}}}});
 if(!entry)return null;
 const {nativeTicket,nativeOmbudsman}=entry;
 const safe={protocol:entry.protocol,type:entry.type,entity:entry.entity,subject:entry.subject,status:entry.status,response:entry.response,createdAt:entry.createdAt,respondedAt:entry.respondedAt,dueAt:entry.dueAt,outcome:entry.outcome,extensionReason:entry.extensionReason,appeals:entry.appeals};
 const ticketAnswered=nativeTicket&&["Resolvido","Concluído"].includes(nativeTicket.status),ombudsmanAnswered=nativeOmbudsman&&["Respondida","Concluída","Concluído"].includes(nativeOmbudsman.status);
 const nativeResponse=(ticketAnswered?nativeTicket.solution:null)||(ombudsmanAnswered?nativeOmbudsman.response:null),nativeDate=(ticketAnswered?nativeTicket.resolvedAt:null)||(ombudsmanAnswered?nativeOmbudsman.respondedAt:null);
 return nativeResponse&&nativeDate?{...safe,status:"RESPONDIDO",response:nativeResponse,respondedAt:nativeDate}:safe;
}

export async function appealCitizenRequest(db:PrismaClient,protocol:string,token:string,message:string){
 const text=z.string().trim().min(20).max(12000).parse(message),own=await consultCitizenRequest(db,protocol,token);
 if(!own||own.type!=="ESIC"||own.status!=="RESPONDIDO"||!own.respondedAt)throw new Error("Recurso exige pedido e-SIC respondido e chave válida.");
 const latest=own.appeals[own.appeals.length-1],answered=latest?latest.respondedAt:own.respondedAt;
 if(!answered||Date.now()-new Date(answered).getTime()>10*86400000)throw new Error("Recurso fora do prazo de 10 dias ou recurso anterior ainda pendente.");
 const level=(latest?.level||0)+1;if(level>3)throw new Error("Instâncias recursais cadastradas encerradas.");
 const request=await db.transparencyCitizenRequest.findUniqueOrThrow({where:{protocol},select:{id:true}});
 return db.transparencyCitizenAppeal.create({data:{requestId:request.id,level,message:text,dueAt:new Date(Date.now()+5*86400000)},select:{level:true,status:true,dueAt:true}});
}

export async function rateCitizenService(db:PrismaClient,protocol:string,token:string,rating:unknown,comment:unknown){
 const own=await consultCitizenRequest(db,protocol,token);if(!own||own.status!=="RESPONDIDO")throw new Error("Avaliação exige resposta e chave válida.");
  const request=await db.transparencyCitizenRequest.findUniqueOrThrow({where:{protocol},select:{id:true}}),scores=typeof rating==="object"&&rating!==null?z.object({serviceScore:z.coerce.number().int().min(1).max(5),qualityScore:z.coerce.number().int().min(1).max(5),deadlineScore:z.coerce.number().int().min(1).max(5)}).strict().parse(rating):null,data=z.object({rating:z.coerce.number().int().min(1).max(5),comment:z.string().trim().max(2000),qualityRating:z.number().int().min(1).max(5).nullable(),deadlineRating:z.number().int().min(1).max(5).nullable()}).parse({rating:scores?.serviceScore??rating,comment:comment||"",qualityRating:scores?.qualityScore??null,deadlineRating:scores?.deadlineScore??null});
 await db.transparencySatisfaction.upsert({where:{requestId:request.id},create:{requestId:request.id,...data},update:data});return {recorded:true};
}
