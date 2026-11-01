"use server";
import { revalidatePath } from "next/cache";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { saveDesifMetadata } from "@/lib/tributacao/desif-requirements";
export async function saveDesifMetadataAction(form: FormData): Promise<void> {
  const { connection, user } = await taxActionContext("update");
  const id = String(form.get("caseId") ?? "");
  await saveDesifMetadata(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, id, form);
  revalidatePath(`/tributacao/iss-bancario/gestao/autos/${id}`);
  revalidatePath("/tributacao/iss-bancario/gestao");
}
