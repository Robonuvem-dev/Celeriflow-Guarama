"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { publishFiscalCatalog, saveConfiguredFiscalRecord } from "@/lib/tributacao/configurable-cadastres";

export async function publishFiscalCatalogAction(input: Parameters<typeof publishFiscalCatalog>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    await publishFiscalCatalog(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/configuracoes-cadastrais"); return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar o catálogo." }; }
}

export async function saveConfiguredFiscalRecordAction(input: Parameters<typeof saveConfiguredFiscalRecord>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    await saveConfiguredFiscalRecord(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/configuracoes-cadastrais");
    if (input.entityType === "REAL_ESTATE") revalidatePath(`/tributacao/imoveis/${input.entityId}`);
    if (input.entityType === "ECONOMIC_REGISTRATION") revalidatePath(`/tributacao/economico/${input.entityId}`);
    if (input.entityType === "ITBI_DECLARATION") revalidatePath("/tributacao/itbi");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o formulário." }; }
}
