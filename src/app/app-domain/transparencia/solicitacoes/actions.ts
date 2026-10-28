"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getTenantContextForModuleOperation} from "@/lib/platform/tenant-context";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { eq } from "drizzle-orm";
import { transparencyCitizenRequests, transparencyCitizenAppeals } from "@/db/schema/citizen-channels";
import { financialAuditLogs } from "@/db/schema/finance-identity";
export async function respondCitizenRequest(form:FormData):Promise<void>{
 const context=await getTenantContextForModuleOperation("TRANSPARENCIA","update");
 const input=z.object({id:z.string().min(1),status:z.enum(["EM_ANALISE","RESPONDIDO"]),response:z.string().trim().max(12000),outcome:z.enum(["CONCEDIDO","PARCIAL","INDEFERIDO"]).default("CONCEDIDO")}).refine(data=>data.status!=="RESPONDIDO"||data.response.length>=5,"Registre a resposta antes de concluir.").parse(Object.fromEntries(form));
  await withDatabaseTransaction(databaseConnection,async tx=>{const [existing]=await tx.select({nativeTicketId:transparencyCitizenRequests.nativeTicketId,nativeOmbudsmanId:transparencyCitizenRequests.nativeOmbudsmanId}).from(transparencyCitizenRequests).where(eq(transparencyCitizenRequests.id,input.id)).limit(1);if(!existing)throw new Error("Pedido não encontrado.");if(existing.nativeTicketId||existing.nativeOmbudsmanId)throw new Error("Pedido integrado: responda no Atendimento/Ouvidoria vinculado.");if(!(await tx.update(transparencyCitizenRequests).set({status:input.status,response:input.response||null,outcome:input.status==="RESPONDIDO"?input.outcome:null,respondedAt:input.status==="RESPONDIDO"?new Date():null}).where(eq(transparencyCitizenRequests.id,input.id)).returning({id:transparencyCitizenRequests.id})).length)throw new Error("Pedido não encontrado.");await tx.insert(financialAuditLogs).values({action:"RESPOND_TRANSPARENCY_CITIZEN_REQUEST",entityType:"TransparencyCitizenRequest",entityId:input.id,authorUsuarioId:context.user.id,payload:{status:input.status,outcome:input.outcome}});},{timeoutMs:5_000});
 revalidatePath("/transparencia/solicitacoes");
}

export async function extendCitizenDeadline(form:FormData):Promise<void>{
 const context=await getTenantContextForModuleOperation("TRANSPARENCIA","update"),input=z.object({id:z.string().min(1),reason:z.string().trim().min(20).max(4000)}).parse(Object.fromEntries(form));
  await withDatabaseTransaction(databaseConnection,async tx=>{const [row]=await tx.select().from(transparencyCitizenRequests).where(eq(transparencyCitizenRequests.id,input.id)).limit(1).for("update");if(!row)throw new Error("Pedido não encontrado.");if(row.extendedAt||row.status==="RESPONDIDO"||row.dueAt<new Date())throw new Error("Prorrogação deve ser única, justificada e anterior ao vencimento/resposta.");await tx.update(transparencyCitizenRequests).set({dueAt:new Date(row.dueAt.getTime()+(row.type==="ESIC"?10:30)*86400000),extendedAt:new Date(),extensionReason:input.reason}).where(eq(transparencyCitizenRequests.id,row.id));await tx.insert(financialAuditLogs).values({action:"EXTEND_CITIZEN_DEADLINE",entityType:"TransparencyCitizenRequest",entityId:row.id,authorUsuarioId:context.user.id,payload:{reason:input.reason}});},{timeoutMs:5_000});revalidatePath("/transparencia/solicitacoes");
}
export async function respondCitizenAppeal(form:FormData):Promise<void>{
 const context=await getTenantContextForModuleOperation("TRANSPARENCIA","update"),input=z.object({id:z.string().min(1),response:z.string().trim().min(10).max(12000)}).parse(Object.fromEntries(form));
  await withDatabaseTransaction(databaseConnection,async tx=>{if(!(await tx.update(transparencyCitizenAppeals).set({response:input.response,status:"RESPONDIDO",respondedAt:new Date()}).where(eq(transparencyCitizenAppeals.id,input.id)).returning({id:transparencyCitizenAppeals.id})).length)throw new Error("Recurso não encontrado.");await tx.insert(financialAuditLogs).values({action:"RESPOND_CITIZEN_APPEAL",entityType:"TransparencyCitizenAppeal",entityId:input.id,authorUsuarioId:context.user.id,payload:{responded:true}});},{timeoutMs:5_000});revalidatePath("/transparencia/solicitacoes");
}
