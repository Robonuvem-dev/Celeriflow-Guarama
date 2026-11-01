"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { databaseConnection } from "@/db/client";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { processSocialMessageQueue, refreshSocialMessage, sendSocialMessage } from "@/db/repositories/social/messages";
export async function socialMessageAction(raw:unknown):Promise<{info?:string;error?:string}>{
  try{
    const input=z.object({operation:z.enum(["send","refresh","queue"]),id:z.string().max(150).default(""),unitId:z.string().max(150).default("")}).parse(raw);
    const context=await getTenantContextForModuleOperation("SOCIAL","update"),access=await resolveSocialAccess(context);
    const result=input.operation==="queue"?await processSocialMessageQueue(databaseConnection,access,input.unitId):input.operation==="send"?await sendSocialMessage(databaseConnection,access,input.id):await refreshSocialMessage(databaseConnection,access,input.id);
    revalidatePath("/app-domain/social/gestao/comunicacoes");return {info:result.info};
  }catch(error){return {error:error instanceof z.ZodError?"Confira os parâmetros de processamento.":error instanceof Error?error.message:"Não foi possível processar a mensagem."};}
}
