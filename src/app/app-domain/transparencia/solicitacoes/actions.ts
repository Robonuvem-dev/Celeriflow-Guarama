"use server";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getTenantContextForModuleOperation} from "@/lib/platform/tenant-context";
export async function respondCitizenRequest(form:FormData):Promise<void>{
 const context=await getTenantContextForModuleOperation("TRANSPARENCIA","update");
 const input=z.object({id:z.string().min(1),status:z.enum(["EM_ANALISE","RESPONDIDO"]),response:z.string().trim().max(12000),outcome:z.enum(["CONCEDIDO","PARCIAL","INDEFERIDO"]).default("CONCEDIDO")}).refine(data=>data.status!=="RESPONDIDO"||data.response.length>=5,"Registre a resposta antes de concluir.").parse(Object.fromEntries(form));
 await context.prisma.$transaction(async tx=>{const existing=await tx.transparencyCitizenRequest.findUniqueOrThrow({where:{id:input.id},select:{nativeTicketId:true,nativeOmbudsmanId:true}});if(existing.nativeTicketId||existing.nativeOmbudsmanId)throw new Error("Pedido integrado: responda no Atendimento/Ouvidoria vinculado.");await tx.transparencyCitizenRequest.update({where:{id:input.id},data:{status:input.status,response:input.response||null,outcome:input.status==="RESPONDIDO"?input.outcome:null,respondedAt:input.status==="RESPONDIDO"?new Date():null}});await tx.financialAuditLog.create({data:{action:"RESPOND_TRANSPARENCY_CITIZEN_REQUEST",entityType:"TransparencyCitizenRequest",entityId:input.id,authorUsuarioId:context.user.id,payload:{status:input.status,outcome:input.outcome}}});});
 revalidatePath("/transparencia/solicitacoes");
}

export async function extendCitizenDeadline(form:FormData):Promise<void>{
 const context=await getTenantContextForModuleOperation("TRANSPARENCIA","update"),input=z.object({id:z.string().min(1),reason:z.string().trim().min(20).max(4000)}).parse(Object.fromEntries(form));
 await context.prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "TransparencyCitizenRequest" WHERE id=${input.id} FOR UPDATE`;const row=await tx.transparencyCitizenRequest.findUniqueOrThrow({where:{id:input.id}});if(row.extendedAt||row.status==="RESPONDIDO"||row.dueAt<new Date())throw new Error("Prorrogação deve ser única, justificada e anterior ao vencimento/resposta.");await tx.transparencyCitizenRequest.update({where:{id:row.id},data:{dueAt:new Date(row.dueAt.getTime()+(row.type==="ESIC"?10:30)*86400000),extendedAt:new Date(),extensionReason:input.reason}});await tx.financialAuditLog.create({data:{action:"EXTEND_CITIZEN_DEADLINE",entityType:"TransparencyCitizenRequest",entityId:row.id,authorUsuarioId:context.user.id,payload:{reason:input.reason}}});});revalidatePath("/transparencia/solicitacoes");
}
export async function respondCitizenAppeal(form:FormData):Promise<void>{
 const context=await getTenantContextForModuleOperation("TRANSPARENCIA","update"),input=z.object({id:z.string().min(1),response:z.string().trim().min(10).max(12000)}).parse(Object.fromEntries(form));
 await context.prisma.$transaction(async tx=>{await tx.transparencyCitizenAppeal.update({where:{id:input.id},data:{response:input.response,status:"RESPONDIDO",respondedAt:new Date()}});await tx.financialAuditLog.create({data:{action:"RESPOND_CITIZEN_APPEAL",entityType:"TransparencyCitizenAppeal",entityId:input.id,authorUsuarioId:context.user.id,payload:{responded:true}}});});revalidatePath("/transparencia/solicitacoes");
}
