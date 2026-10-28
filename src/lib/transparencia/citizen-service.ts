import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { transparencyCitizenRequests, transparencyCitizenAppeals, transparencySatisfactions } from "@/db/schema/citizen-channels";
import { tickets, ombudsmans, supportChannels } from "@/db/schema/attendance-portals";
import { processes } from "@/db/schema/processes";
import {getTransparencySettings} from "./presentation-settings";
import { openCitizenChannelProcess } from "@/lib/portal-cidadao/citizen-channel-process";

export const citizenRequestSchema=z.object({requestKey:z.uuid().optional(),type:z.enum(["ESIC","DENUNCIA","RECLAMACAO","SUGESTAO","ELOGIO"]),entity:z.enum(["prefeitura","camara"]).default("prefeitura"),name:z.string().trim().max(200).default(""),email:z.union([z.email(),z.literal("")]).default(""),subject:z.string().trim().min(5).max(250),message:z.string().trim().min(20).max(12000)}).strict().refine(value=>value.type!=="ESIC"||Boolean(value.name&&value.email),"Informe nome e e-mail para pedidos de informação.");
const accessHash=(token:string)=>createHash("sha256").update(token).digest("hex");
export async function createCitizenRequest(db:DatabaseConnection,input:unknown){
  const {requestKey,...data}=citizenRequestSchema.parse(input), requestKeyHash=requestKey?accessHash(`request:${requestKey}`):null,inputHash=accessHash(JSON.stringify(data)),token=requestKey?accessHash(`access:${requestKey}`):randomBytes(32).toString("hex"), protocol=`${new Date().getUTCFullYear()}-${randomBytes(6).toString("hex").toUpperCase()}`;
 const settings=await getTransparencySettings(db.db),dueAt=new Date(Date.now()+(data.type==="ESIC"?20:30)*86400000);
  return withDatabaseTransaction(db,async tx=>{
   if(requestKeyHash){
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CITIZEN_CHANNEL:${requestKeyHash}`}))`);
    const [prior]=await tx.select({protocol:transparencyCitizenRequests.protocol,inputHash:transparencyCitizenRequests.inputHash,status:transparencyCitizenRequests.status,protocolNumber:processes.protocolNumber}).from(transparencyCitizenRequests).leftJoin(processes,eq(processes.id,transparencyCitizenRequests.processId)).where(eq(transparencyCitizenRequests.requestKeyHash,requestKeyHash)).limit(1);
    if(prior){if(prior.inputHash!==inputHash)throw new Error("Chave já utilizada com outro conteúdo.");return {protocol:prior.protocol,token,status:prior.status,centralProtocolNumber:prior.protocolNumber||null};}
   }
  const routing=settings.citizenService;
  const channelId=data.type==="ESIC"?routing.ticketChannelId:routing.ombudsmanChannelId;
   let nativeTicketId:string|null=null,nativeOmbudsmanId:string|null=null;
   const process=await openCitizenChannelProcess(tx,data.type==="ESIC"?"ESIC":"OUVIDORIA",routing.departmentId,dueAt);
  if(channelId){const [channel]=await tx.select({isActive:supportChannels.isActive}).from(supportChannels).where(eq(supportChannels.id,channelId)).limit(1);if(!channel?.isActive)throw new Error("Canal de atendimento desativado.");
    if(data.type==="ESIC")nativeTicketId=(await tx.insert(tickets).values({ticketNumber:`SIC-${protocol}`,subject:data.subject,description:data.message,channelId,departmentId:routing.departmentId,dueAt,isAnonymous:false,processId:process.id}).returning({id:tickets.id}))[0].id;
    else nativeOmbudsmanId=(await tx.insert(ombudsmans).values({protocolNumber:`PORTAL-${protocol}`,type:({DENUNCIA:"Denúncia",RECLAMACAO:"Reclamação",SUGESTAO:"Sugestão",ELOGIO:"Elogio"} as Record<string,string>)[data.type],subject:data.subject,description:data.message,channelId,departmentId:routing.departmentId,isAnonymous:!data.name,isConfidential:true,processId:process.id}).returning({id:ombudsmans.id}))[0].id;
  }
   await tx.insert(transparencyCitizenRequests).values({...data,name:data.name||null,email:data.email||null,protocol,accessHash:accessHash(token),dueAt,nativeTicketId,nativeOmbudsmanId,processId:process.id,requestKeyHash,inputHash});
   return {protocol,token,status:"RECEBIDO",centralProtocolNumber:process.protocolNumber};
  },{timeoutMs:5_000});
}
export async function consultCitizenRequest(db:DatabaseExecutor,protocol:string,token:string){
 if(!/^[a-f0-9]{64}$/.test(token)||!/^\d{4}-[A-F0-9]{12}$/.test(protocol)) return null;
 const [entry]=await db.select({id:transparencyCitizenRequests.id,protocol:transparencyCitizenRequests.protocol,type:transparencyCitizenRequests.type,entity:transparencyCitizenRequests.entity,subject:transparencyCitizenRequests.subject,status:transparencyCitizenRequests.status,response:transparencyCitizenRequests.response,createdAt:transparencyCitizenRequests.createdAt,respondedAt:transparencyCitizenRequests.respondedAt,dueAt:transparencyCitizenRequests.dueAt,outcome:transparencyCitizenRequests.outcome,extensionReason:transparencyCitizenRequests.extensionReason,nativeTicket:{status:tickets.status,solution:tickets.solution,resolvedAt:tickets.resolvedAt},nativeOmbudsman:{status:ombudsmans.status,response:ombudsmans.response,respondedAt:ombudsmans.respondedAt}}).from(transparencyCitizenRequests).leftJoin(tickets,eq(tickets.id,transparencyCitizenRequests.nativeTicketId)).leftJoin(ombudsmans,eq(ombudsmans.id,transparencyCitizenRequests.nativeOmbudsmanId)).where(and(eq(transparencyCitizenRequests.protocol,protocol),eq(transparencyCitizenRequests.accessHash,accessHash(token)))).limit(1);
 if(!entry)return null;
 const {nativeTicket,nativeOmbudsman}=entry;
 const appeals=await db.select({level:transparencyCitizenAppeals.level,status:transparencyCitizenAppeals.status,response:transparencyCitizenAppeals.response,dueAt:transparencyCitizenAppeals.dueAt,respondedAt:transparencyCitizenAppeals.respondedAt,createdAt:transparencyCitizenAppeals.createdAt}).from(transparencyCitizenAppeals).where(eq(transparencyCitizenAppeals.requestId,entry.id)).orderBy(asc(transparencyCitizenAppeals.level));
 const safe={protocol:entry.protocol,type:entry.type,entity:entry.entity,subject:entry.subject,status:entry.status,response:entry.response,createdAt:entry.createdAt,respondedAt:entry.respondedAt,dueAt:entry.dueAt,outcome:entry.outcome,extensionReason:entry.extensionReason,appeals};
 const ticketAnswered=nativeTicket&&["Resolvido","Concluído"].includes(nativeTicket.status),ombudsmanAnswered=nativeOmbudsman&&["Respondida","Concluída","Concluído"].includes(nativeOmbudsman.status);
 const nativeResponse=(ticketAnswered?nativeTicket.solution:null)||(ombudsmanAnswered?nativeOmbudsman.response:null),nativeDate=(ticketAnswered?nativeTicket.resolvedAt:null)||(ombudsmanAnswered?nativeOmbudsman.respondedAt:null);
 return nativeResponse&&nativeDate?{...safe,status:"RESPONDIDO",response:nativeResponse,respondedAt:nativeDate}:safe;
}

export async function appealCitizenRequest(db:DatabaseExecutor,protocol:string,token:string,message:string){
 const text=z.string().trim().min(20).max(12000).parse(message),own=await consultCitizenRequest(db,protocol,token);
 if(!own||own.type!=="ESIC"||own.status!=="RESPONDIDO"||!own.respondedAt)throw new Error("Recurso exige pedido e-SIC respondido e chave válida.");
 const latest=own.appeals[own.appeals.length-1],answered=latest?latest.respondedAt:own.respondedAt;
 if(!answered||Date.now()-new Date(answered).getTime()>10*86400000)throw new Error("Recurso fora do prazo de 10 dias ou recurso anterior ainda pendente.");
 const level=(latest?.level||0)+1;if(level>3)throw new Error("Instâncias recursais cadastradas encerradas.");
 const [request]=await db.select({id:transparencyCitizenRequests.id}).from(transparencyCitizenRequests).where(eq(transparencyCitizenRequests.protocol,protocol)).limit(1);
 if(!request)throw new Error("Pedido não encontrado.");
 const [appeal]=await db.insert(transparencyCitizenAppeals).values({requestId:request.id,level,message:text,dueAt:new Date(Date.now()+5*86400000)}).returning({level:transparencyCitizenAppeals.level,status:transparencyCitizenAppeals.status,dueAt:transparencyCitizenAppeals.dueAt});
 return appeal;
}

export async function rateCitizenService(db:DatabaseExecutor,protocol:string,token:string,rating:unknown,comment:unknown){
 const own=await consultCitizenRequest(db,protocol,token);if(!own||own.status!=="RESPONDIDO")throw new Error("Avaliação exige resposta e chave válida.");
  const [request]=await db.select({id:transparencyCitizenRequests.id}).from(transparencyCitizenRequests).where(eq(transparencyCitizenRequests.protocol,protocol)).limit(1);
  if(!request)throw new Error("Pedido não encontrado.");
  const scores=typeof rating==="object"&&rating!==null?z.object({serviceScore:z.coerce.number().int().min(1).max(5),qualityScore:z.coerce.number().int().min(1).max(5),deadlineScore:z.coerce.number().int().min(1).max(5)}).strict().parse(rating):null,data=z.object({rating:z.coerce.number().int().min(1).max(5),comment:z.string().trim().max(2000),qualityRating:z.number().int().min(1).max(5).nullable(),deadlineRating:z.number().int().min(1).max(5).nullable()}).parse({rating:scores?.serviceScore??rating,comment:comment||"",qualityRating:scores?.qualityScore??null,deadlineRating:scores?.deadlineScore??null});
 await db.insert(transparencySatisfactions).values({requestId:request.id,...data}).onConflictDoUpdate({target:transparencySatisfactions.requestId,set:{...data,updatedAt:new Date()}});return {recorded:true};
}
