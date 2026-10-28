import "server-only";
import { canViewModule, type AppContext } from "@/lib/platform/tenant-context";
import { isCompletedDemand, type AdministrationBiData, type AdministrationBiRow } from "./bi-model";
import { db } from "@/db/client";
import { loadAdministrationBiSource } from "@/db/repositories/administration/bi";

export async function getAdministrationBi(context: AppContext, selection = ""): Promise<AdministrationBiData> {
  if (!canViewModule(context.user, "ADMINISTRACAO")) throw new Error("Acesso negado aos indicadores administrativos.");
  const now = new Date();
  const { institution, secretariats, departments, roles, demands, unassignedEmployees } = await loadAdministrationBiSource(context.database ?? db, selection);
  if (selection && !secretariats.some(s => s.id === selection)) throw new Error("Secretaria não encontrada. Selecione uma secretaria cadastrada.");
  const scopeDemands = demands.filter(d => !selection || (d.secretariatId || d.department?.secretariatId) === selection);
  const rows: AdministrationBiRow[] = secretariats.filter(s => !selection || s.id === selection).map(s => {
    const items = scopeDemands.filter(d => (d.secretariatId || d.department?.secretariatId) === s.id);
    const open = items.filter(d => !isCompletedDemand(d.status));
    return { id: s.id, name: s.name, acronym: s.acronym, active: s.isActive, managerName: s.manager?.name || null, managerRole: s.manager?.role?.name || null, managerValid: Boolean(s.manager?.isActive && s.manager.secretariatId === s.id && s.manager.role?.isActive), employees: s._count.employees, inactiveEmployees: unassignedEmployees.find(e => e.secretariatId === s.id && !e.isActive)?._count._all || 0, departments: s._count.departments, units: s._count.units, demands: items.length, openDemands: open.length, completedDemands: items.length - open.length, overdueDemands: open.filter(d => d.deadline && d.deadline < now).length };
  });
  const timeline = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1));
    const month = date.toISOString().slice(0, 7);
    return { month, label: date.toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }), demands: scopeDemands.filter(d => d.createdAt.toISOString().startsWith(month)).length };
  });
  const unassigned = selection ? [] : scopeDemands.filter(d => !d.secretariatId && !d.department?.secretariatId);
  const unassignedOpen = unassigned.filter(d => !isCompletedDemand(d.status));
  return { institution: institution?.name || "Prefeitura Municipal", capturedAt: now.toISOString(), selection, options: secretariats.map(s => ({ id: s.id, name: s.name, active: s.isActive })), rows, departments: departments.map(d => ({ id: d.id, name: d.name, employees: d._count.employees })), roles, timeline, unassignedEmployees: selection ? 0 : unassignedEmployees.filter(e => !e.secretariatId && e.isActive).reduce((sum, e) => sum + e._count._all, 0), unassignedDemands: unassigned.length, unassignedOpenDemands: unassignedOpen.length, unassignedCompletedDemands: unassigned.length - unassignedOpen.length, unassignedOverdueDemands: unassignedOpen.filter(d => d.deadline && d.deadline < now).length };
}
