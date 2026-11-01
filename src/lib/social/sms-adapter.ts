import { z } from "zod";
export type SocialSmsState = "ACCEPTED" | "SENT" | "DELIVERED" | "FAILED" | "UNKNOWN";
export type SocialSmsConfiguration = { provider: "SMSGATE" | "TEXTBELT"; baseUrl:string;credentialReference:string;sender:string };
export type SocialSmsResult = { state:SocialSmsState; externalId:string|null; error:string|null };
export function socialSmsPhone(value:string){const digits=value.replace(/\D/g,"");const normalized=value.startsWith("+")?`+${digits}`:digits.length===10||digits.length===11?`+55${digits}`:`+${digits}`;if(!/^\+[1-9]\d{7,14}$/.test(normalized))throw new Error("Telefone inválido para envio SMS.");return normalized;}
function credential(config:SocialSmsConfiguration){
  const raw=process.env[config.credentialReference];if(!raw)throw new Error("Credencial de envio não configurada no servidor.");
  let parsed:unknown;try{parsed=JSON.parse(raw);}catch{throw new Error("Configure a credencial JSON do canal de envio no servidor.");}
  if(config.provider==="TEXTBELT"){const value=z.object({apiKey:z.string().min(1)}).parse(parsed);if(value.apiKey.endsWith("_test"))throw new Error("Esta credencial não permite envio efetivo de SMS.");return {apiKey:value.apiKey,authorization:""};}
  const value=z.object({token:z.string().min(1).optional(),username:z.string().min(1).optional(),password:z.string().min(1).optional()}).parse(parsed);
  if(value.token)return {apiKey:"",authorization:`Bearer ${value.token}`};
  if(!value.username||!value.password)throw new Error("Configure usuário/senha ou token do SMSGate.");
  return {apiKey:"",authorization:`Basic ${Buffer.from(`${value.username}:${value.password}`).toString("base64")}`};
}
export function checkSocialSmsConfiguration(config:SocialSmsConfiguration){const url=new URL(config.baseUrl);if(url.protocol!=="https:"||url.username||url.password)throw new Error("URL do canal de envio inválida.");credential(config);}
function gateState(state:string):SocialSmsState {return state==="Delivered"?"DELIVERED":state==="Sent"?"SENT":state==="Failed"||state==="Cancelled"?"FAILED":state==="Pending"||state==="Processed"||state==="Cancelling"?"ACCEPTED":"UNKNOWN";}
async function responseJson(response:Response){const text=await response.text();if(text.length>65536)throw new Error("Retorno do canal excedeu o limite esperado.");return z.record(z.string(),z.unknown()).parse(JSON.parse(text));}
export async function transmitSocialSms(config:SocialSmsConfiguration,message:{id:string;phone:string;body:string},fetcher:typeof fetch=fetch):Promise<SocialSmsResult>{
  const auth=credential(config),phone=socialSmsPhone(message.phone);
  try{
    const gate=config.provider==="SMSGATE",url=gate?`${config.baseUrl.replace(/\/$/,"")}/messages`:"https://textbelt.com/text";
    const response=await fetcher(url,{method:"POST",headers:gate?{"Content-Type":"application/json",Authorization:auth.authorization}:{"Content-Type":"application/x-www-form-urlencoded"},body:gate?JSON.stringify({id:message.id,textMessage:{text:message.body},phoneNumbers:[phone],withDeliveryReport:true,ttl:86400}):new URLSearchParams({phone,message:message.body,key:auth.apiKey,sender:config.sender}),redirect:"error",signal:AbortSignal.timeout(15000)});
    if(!response.ok)return {state:response.status>=500?"UNKNOWN":"FAILED",externalId:gate?message.id:null,error:`O canal retornou HTTP ${response.status}.`};
    const result=await responseJson(response);
    if(gate){const id=typeof result.id==="string"?result.id:message.id;return {state:gateState(String(result.state||"Pending")),externalId:id,error:null};}
    if(result.success!==true)return {state:"FAILED",externalId:null,error:"O canal recusou o envio. Verifique o saldo, o número e a configuração."};
    if(typeof result.textId!=="string"&&typeof result.textId!=="number")return {state:"UNKNOWN",externalId:null,error:"O canal não informou a referência de envio."};
    return {state:"ACCEPTED",externalId:String(result.textId),error:null};
  }catch{return {state:"UNKNOWN",externalId:config.provider==="SMSGATE"?message.id:null,error:"Não foi possível confirmar a resposta do canal. Concilie o resultado antes de reenviar."};}
}
export async function querySocialSms(config:SocialSmsConfiguration,externalId:string,fetcher:typeof fetch=fetch):Promise<SocialSmsResult>{
  const auth=credential(config);
  try{
    const gate=config.provider==="SMSGATE",url=gate?`${config.baseUrl.replace(/\/$/,"")}/messages/${encodeURIComponent(externalId)}`:`https://textbelt.com/status/${encodeURIComponent(externalId)}`;
    const response=await fetcher(url,{headers:gate?{Authorization:auth.authorization}:{},redirect:"error",signal:AbortSignal.timeout(15000)});
    if(!response.ok)return {state:"UNKNOWN",externalId,error:`Consulta ao canal retornou HTTP ${response.status}.`};
    const result=await responseJson(response);if(gate)return {state:gateState(String(result.state||"")),externalId,error:null};
    const status=String(result.status||"").toUpperCase();return {state:status==="DELIVERED"?"DELIVERED":status==="SENT"?"SENT":status==="DELIVERY_FAILED"||status==="FAILED"?"FAILED":status==="PENDING"||status==="SENDING"?"ACCEPTED":"UNKNOWN",externalId,error:null};
  }catch{return {state:"UNKNOWN",externalId,error:"O canal ainda não confirmou a situação da mensagem."};}
}
