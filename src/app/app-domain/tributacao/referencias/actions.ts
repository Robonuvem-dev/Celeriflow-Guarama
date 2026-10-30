"use server";
import {revalidatePath} from "next/cache";
import {taxActionContext} from "@/db/repositories/tax-actions/context";
import {isSystemAdministrator} from "@/lib/platform/tenant-context";
import {saveTaxReference} from "@/lib/tributacao/reference-catalog-service";
export async function saveTaxReferenceAction(raw:unknown,version:number,id?:string,remove=false){
 try{
  const {connection,user}=await taxActionContext(remove?"delete":id?"update":"create");
  await saveTaxReference(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user)?undefined:user.allowedBudgetUnitIds},raw,version,id,remove);
  revalidatePath("/tributacao/referencias");return {};
 }catch(error){return {error:error instanceof Error?error.message:"Não foi possível salvar a referência."};}
}
