"use server";
import {revalidatePath} from "next/cache";
import {taxActionContext} from "@/db/repositories/tax-actions/context";
import {isSystemAdministrator} from "@/lib/platform/tenant-context";
import {updateManagedDesifInfraction} from "@/lib/tributacao/desif-infraction-management";
export async function updateDesifInfractionAction(form:FormData):Promise<void>{
 const {connection,user}=await taxActionContext("update");
 const raw=Object.fromEntries(["caseId","expectedUpdatedAt","infractionType","status","reason"].map(key=>[key,String(form.get(key)??"")]));
 await updateManagedDesifInfraction(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user)?undefined:user.allowedBudgetUnitIds},raw);
 revalidatePath(`/tributacao/iss-bancario/fiscalizacoes/${raw.caseId}/auto`);revalidatePath("/tributacao/iss-bancario");
}
