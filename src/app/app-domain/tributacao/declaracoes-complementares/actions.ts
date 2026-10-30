"use server";
import {revalidatePath} from "next/cache";
import {taxActionContext} from "@/db/repositories/tax-actions/context";
import {isSystemAdministrator} from "@/lib/platform/tenant-context";
import {saveComplementaryDeclaration} from "@/lib/tributacao/complementary-declarations";
export async function saveComplementaryDeclarationAction(form:FormData):Promise<void>{
 const id=String(form.get("id")??"");const {connection,user}=await taxActionContext(id?"update":"create");
 const data=Object.fromEntries(["type","taxpayerId","competence","protocol","status","amount","documentRef","description","governmentEntityId","budgetUnitId"].map(key=>[key,String(form.get(key)??"")]));
 await saveComplementaryDeclaration(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user)?undefined:user.allowedBudgetUnitIds},data,Number(form.get("version")??0),id||undefined);
 revalidatePath("/tributacao/declaracoes-complementares");
}
