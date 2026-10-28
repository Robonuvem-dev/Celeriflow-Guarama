"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { publishSimplesOptionLayout, importSimplesOptionFile, decideSimplesOptionCompany } from "@/lib/tributacao/simples-option-files";

async function context() { const { connection, user } = await taxActionContext("update"); return { connection, actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } }; }
export async function publishSimplesLayoutAction(input: Parameters<typeof publishSimplesOptionLayout>[2]) {
  try { const { connection, actor } = await context(); await publishSimplesOptionLayout(connection, actor, input); revalidatePath("/tributacao/simples-nacional/arquivos"); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar o layout." }; }
}
export async function importSimplesOptionFileAction(input: Parameters<typeof importSimplesOptionFile>[2]) {
  try { const { connection, actor } = await context(); const row = await importSimplesOptionFile(connection, actor, input); revalidatePath("/tributacao/simples-nacional/arquivos"); return { id: row.entityId }; } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível importar o arquivo." }; }
}
export async function decideSimplesOptionAction(input: Parameters<typeof decideSimplesOptionCompany>[2]) {
  try { const { connection, actor } = await context(); await decideSimplesOptionCompany(connection, actor, input); revalidatePath("/tributacao/simples-nacional/arquivos"); return {}; } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a decisão." }; }
}
