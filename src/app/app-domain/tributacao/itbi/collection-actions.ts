"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { createItbiPropertyCollection } from "@/lib/tributacao/itbi-property-collection";

export async function createItbiPropertyCollectionAction(input:Parameters<typeof createItbiPropertyCollection>[2]) {
  try {const {connection,user}=await taxActionContext("create");const result=await createItbiPropertyCollection(connection,{usuarioId:user.id,employeeId:user.employeeId,allowedBudgetUnitIds:isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds},input);revalidatePath("/tributacao/itbi");return {count:result.declarations.length};}catch(error){return {error:error instanceof Error ? error.message : "Não foi possível incluir o conjunto de imóveis."};}
}
