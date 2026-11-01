import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../../connection";
import { withDatabaseTransaction } from "../../transaction";
import { socialMessages } from "../../schema/social-workflows";
import { socialMessageDispatches } from "../../schema/social-operation-models";
import { assertSocialUnitAccess, type SocialAccess } from "@/lib/social/access-policy";
import { readSocialParameters } from "./parameters";
import { checkSocialSmsConfiguration, querySocialSms, socialSmsPhone, transmitSocialSms, type SocialSmsConfiguration, type SocialSmsResult } from "@/lib/social/sms-adapter";
import { insertAuditEvent } from "../platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";

async function recordResult(connection:DatabaseConnection,id:string,messageId:string,result:SocialSmsResult,actorId:string){
  await withDatabaseTransaction(connection,async tx=>{
    await tx.execute(sql`SELECT id FROM "SocialMessageDispatch" WHERE id=${id} FOR UPDATE`);
    const [dispatch]=await tx.select().from(socialMessageDispatches).where(eq(socialMessageDispatches.id,id));
    if(!dispatch)throw new Error("Processamento da mensagem não encontrado.");
    if(dispatch.state==="DELIVERED"&&result.state!=="DELIVERED")return;
    const [message]=await tx.select().from(socialMessages).where(eq(socialMessages.id,messageId));
    if(!message)throw new Error("Mensagem não encontrada.");
    const state=result.state==="UNKNOWN"&&["ACCEPTED","SENT"].includes(dispatch.state)?dispatch.state:dispatch.state==="SENT"&&result.state==="ACCEPTED"?"SENT":result.state;
    await tx.update(socialMessageDispatches).set({state,externalId:result.externalId||dispatch.externalId,error:result.error}).where(eq(socialMessageDispatches.id,id));
    const now=new Date();await tx.update(socialMessages).set({status:state,externalId:result.externalId||dispatch.externalId,lastError:result.error,...(["SENT","DELIVERED"].includes(state)&&!message.sentAt?{sentAt:now}:{}),...(state==="DELIVERED"&&!message.deliveredAt?{deliveredAt:now}:{})}).where(eq(socialMessages.id,messageId));
    await insertAuditEvent(tx,{actorUsuarioId:actorId,eventType:auditEventTypes.administrativeMutation,targetType:"SocialMessageStatus",targetId:messageId});
  });
}
export async function sendSocialMessage(connection:DatabaseConnection,access:SocialAccess,messageId:string){
  const claim=await withDatabaseTransaction(connection,async tx=>{
    await tx.execute(sql`SELECT id FROM "SocialMessage" WHERE id=${messageId} FOR UPDATE`);
    const [message]=await tx.select().from(socialMessages).where(eq(socialMessages.id,messageId));if(!message)throw new Error("Mensagem não encontrada.");assertSocialUnitAccess(access,message.unitId);
    const settings=await readSocialParameters(tx);
    if(settings.parameters.smsProvider==="QUEUE")return {info:"Mensagem preparada. Configure o canal de envio nos parâmetros municipais.",message:null,dispatch:null,configuration:null};
    const [previous]=await tx.select().from(socialMessageDispatches).where(eq(socialMessageDispatches.messageId,messageId));
    if(previous)return {info:"A mensagem já foi processada. Consulte a situação para conciliar o retorno do canal.",message:null,dispatch:null,configuration:null};
    if(!["AWAITING_PROVIDER","QUEUED"].includes(message.status))throw new Error("Mensagem não está disponível para envio.");
    const configuration:SocialSmsConfiguration={provider:settings.parameters.smsProvider,baseUrl:settings.parameters.smsBaseUrl,credentialReference:settings.parameters.smsCredentialReference,sender:settings.parameters.smsSender};
    checkSocialSmsConfiguration(configuration);socialSmsPhone(message.phone);
    const day=new Date().toISOString().slice(0,10);await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`social-sms-daily:${day}`},0))`);
    const [today]=await tx.select({total:count()}).from(socialMessageDispatches).where(gte(socialMessageDispatches.createdAt,new Date(`${day}T00:00:00Z`)));
    if(today.total>=settings.parameters.smsDailyLimit)throw new Error("Limite diário de mensagens atingido conforme os parâmetros municipais.");
    const [dispatch]=await tx.insert(socialMessageDispatches).values({messageId,provider:configuration.provider,parametersRevision:settings.revision,configuration:{baseUrl:configuration.baseUrl,credentialReference:configuration.credentialReference,sender:configuration.sender},state:"DISPATCHING",externalId:configuration.provider==="SMSGATE"?messageId:null,createdBy:access.userId!}).returning();
    await tx.update(socialMessages).set({status:"DISPATCHING",lastError:null}).where(eq(socialMessages.id,messageId));
    return {info:null,message,dispatch,configuration};
  });
  if(!claim.message||!claim.dispatch||!claim.configuration)return {info:claim.info||"Mensagem preparada."};
  const result=await transmitSocialSms(claim.configuration,{id:claim.message.id,phone:claim.message.phone,body:claim.message.body});
  await recordResult(connection,claim.dispatch.id,messageId,result,access.userId!);
  return {state:result.state,info:result.error||"Envio registrado. Consulte a situação para acompanhar a confirmação do canal."};
}
export async function refreshSocialMessage(connection:DatabaseConnection,access:SocialAccess,messageId:string){
  const [row]=await connection.db.select({message:socialMessages,dispatch:socialMessageDispatches}).from(socialMessages).innerJoin(socialMessageDispatches,eq(socialMessageDispatches.messageId,socialMessages.id)).where(eq(socialMessages.id,messageId));
  if(!row)throw new Error("Mensagem ainda não foi encaminhada a um canal de envio.");assertSocialUnitAccess(access,row.message.unitId);
  if(!row.dispatch.externalId)throw new Error("Canal não informou referência para consulta. Verifique o histórico de processamento.");
  const provider=row.dispatch.provider;if(provider!=="SMSGATE"&&provider!=="TEXTBELT")throw new Error("Canal não reconhecido.");
  const result=await querySocialSms({provider,...row.dispatch.configuration},row.dispatch.externalId);
  await recordResult(connection,row.dispatch.id,messageId,result,access.userId!);return {state:result.state,info:result.error||"Situação atualizada conforme o retorno do canal."};
}
export async function processSocialMessageQueue(connection:DatabaseConnection,access:SocialAccess,unitId:string){
  if(unitId)assertSocialUnitAccess(access,unitId);
  const settings=await readSocialParameters(connection.db);
  const rows=await connection.db.select({id:socialMessages.id}).from(socialMessages).where(and(inArray(socialMessages.status,["AWAITING_PROVIDER","QUEUED"]),unitId?eq(socialMessages.unitId,unitId):access.administrator?undefined:inArray(socialMessages.unitId,access.links.map(l=>l.unitId)))).orderBy(socialMessages.createdAt).limit(settings.parameters.smsBatchLimit);
  let processed=0;const deadline=Date.now()+20000;for(const row of rows){if(Date.now()>deadline)break;await sendSocialMessage(connection,access,row.id);processed++;}
  return {info:settings.parameters.smsProvider==="QUEUE"?`${processed} mensagens disponíveis para conferência. Configure o canal para efetuar o envio.`:`${processed} mensagens processadas. Consulte o histórico para acompanhar os retornos.`};
}
