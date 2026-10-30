"use server";
import { and,eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db,databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { processes } from "@/db/schema/processes";
import { getProtocolContextForOperation,protocolScopeCondition } from "@/lib/protocols/access";
import { joinProcesses,undoProcessJunction } from "@/lib/protocols/junction-service";
export async function joinProcessAction(form:FormData):Promise<void>{
 const context=await getProtocolContextForOperation("update"),database=context.database??db;
 if(!context.user.departmentId)throw new Error("Seu usuário precisa estar vinculado a um setor.");
 const parentId=String(form.get("parentId")||""),protocol=String(form.get("childProtocol")||"").trim();
 const [child]=await database.select({id:processes.id}).from(processes).where(and(eq(processes.protocolNumber,protocol),protocolScopeCondition(context))).limit(1);
 if(!child)throw new Error("Processo a juntar não encontrado no seu escopo.");
 await withDatabaseTransaction(databaseConnection,tx=>joinProcesses(tx,{parentId,childId:child.id,departmentId:context.user.departmentId!,actorId:context.user.id,reason:String(form.get("reason")||"")}));
 revalidatePath(`/protocolos/processos/${parentId}`);revalidatePath(`/protocolos/processos/${child.id}`);
}
export async function undoProcessJunctionAction(form:FormData):Promise<void>{
 const context=await getProtocolContextForOperation("update");
 if(!context.user.departmentId)throw new Error("Seu usuário precisa estar vinculado a um setor.");
 const result=await withDatabaseTransaction(databaseConnection,tx=>undoProcessJunction(tx,{id:String(form.get("junctionId")||""),departmentId:context.user.departmentId!,actorId:context.user.id,reason:String(form.get("reason")||"")}));
 revalidatePath(`/protocolos/processos/${result.parentId}`);revalidatePath(`/protocolos/processos/${result.childId}`);
}
