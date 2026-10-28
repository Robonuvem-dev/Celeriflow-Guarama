"use server";

import { revalidatePath } from "next/cache";
import { isSystemAdministrator, type ModuleOperation } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { publishEconomicEventType, saveEconomicEvent, issueEconomicEventLicense, saveEconomicVehicle } from "@/lib/tributacao/economic-events";

async function context(operation: ModuleOperation) {
  const { connection, user } = await taxActionContext(operation);
  return { connection, actor: { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds } };
}
function refresh() { revalidatePath("/tributacao/economico/eventos-veiculos"); revalidatePath("/tributacao/alvaras/configurados"); }

export async function publishEventTypeAction(input: Parameters<typeof publishEconomicEventType>[2]) {
  try { const { connection, actor } = await context(input.typeId ? "update" : "create"); const row = await publishEconomicEventType(connection, actor, input); refresh(); return { id: row.entityId }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível publicar o tipo de evento." }; }
}
export async function saveEventAction(input: Parameters<typeof saveEconomicEvent>[2]) {
  try { const { connection, actor } = await context(input.eventId ? "update" : "create"); const row = await saveEconomicEvent(connection, actor, input); refresh(); return { id: row.entityId }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o evento." }; }
}
export async function issueEventLicenseAction(input: Parameters<typeof issueEconomicEventLicense>[2]) {
  try { const { connection, actor } = await context("create"); const row = await issueEconomicEventLicense(connection, actor, input); refresh(); return { id: row.id, code: row.qrCode }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível emitir o alvará de evento." }; }
}
export async function saveVehicleAction(input: Parameters<typeof saveEconomicVehicle>[2]) {
  try { const { connection, actor } = await context(input.vehicleId ? "update" : "create"); const row = await saveEconomicVehicle(connection, actor, input); refresh(); return { id: row.entityId }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível salvar o veículo." }; }
}
