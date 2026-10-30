"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { saveReferenceRecord, deleteReferenceRecord } from "@/lib/rh/reference-records";
export async function saveEducationLeaveType(data: FormData): Promise<{ error: string | null; message?: string }> {
 try {
  const id = String(data.get("id") || "");
  const context = await getTenantContextForModuleOperation("EDUCACAO", id ? "update" : "create");
  await saveReferenceRecord(context.database ?? db,id || undefined,{kind:"LICENCA_EDUCACAO",code:data.get("code"),name:data.get("name"),details:{maximumDays:String(data.get("maximumDays") || ""),legalReference:String(data.get("legalReference") || "")}});
  revalidatePath("/educacao/licencas"); return {error:null,message:"Tipo de afastamento salvo."};
 } catch(error) { return {error:error instanceof Error ? error.message : "Falha ao salvar."}; }
}
export async function deleteEducationLeaveType(data: FormData): Promise<void> {
 const context = await getTenantContextForModuleOperation("EDUCACAO","delete");
 await deleteReferenceRecord(context.database ?? db,String(data.get("id") || ""),"LICENCA_EDUCACAO"); revalidatePath("/educacao/licencas");
}
