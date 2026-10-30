"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { processes } from "@/db/schema/processes";
import { processPrintSettings } from "@/db/schema/process-reference-catalog";
import { getProtocolContextForOperation, protocolScopeCondition } from "@/lib/protocols/access";
export async function saveProcessPrintSetting(form: FormData): Promise<void> {
 const context=await getProtocolContextForOperation("update"),database=context.database??db;
 if(!context.protocolAccess.isAdmin) throw new Error("Somente administradores podem parametrizar relatórios por tipo de processo.");
 const id=String(form.get("processId")||"");
 const [process]=await database.select({typeId:processes.processTypeId}).from(processes).where(and(eq(processes.id,id),protocolScopeCondition(context))).limit(1);
 if(!process) throw new Error("Processo não encontrado no seu escopo.");
 const includeOpening=form.get("includeOpening")==="on",includeMovements=form.get("includeMovements")==="on";
 if(!includeOpening&&!includeMovements) throw new Error("Selecione pelo menos uma seção para impressão.");
 await database.insert(processPrintSettings).values({processTypeId:process.typeId,includeOpening,includeMovements}).onConflictDoUpdate({target:processPrintSettings.processTypeId,set:{includeOpening,includeMovements}});
 revalidatePath(`/protocolos/processos/${id}`);
}
