"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { readPropertyBulkSelection, bulkChangeProperties } from "@/lib/tributacao/property-bulk-change";

export async function previewPropertyBulkAction(input: Parameters<typeof readPropertyBulkSelection>[2]) {
  try {
    const { database, user } = await taxActionContext("update");
    const result = await readPropertyBulkSelection(database, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    return { fingerprint: result.fingerprint, properties: result.selection.map(row => ({ id: row.property.id, inscription: row.property.municipalInsc ?? row.property.id, address: `${row.property.streetName ?? ""}, ${row.property.number ?? ""}`, status: row.property.status })) };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível selecionar os imóveis." }; }
}
export async function changePropertiesBulkAction(input: Parameters<typeof bulkChangeProperties>[2]) {
  try {
    const { connection, user } = await taxActionContext("update");
    const result = await bulkChangeProperties(connection, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, input);
    revalidatePath("/tributacao/imoveis", "layout"); return { changed: result.changed };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível efetivar a alteração geral." }; }
}
