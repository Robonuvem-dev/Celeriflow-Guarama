import { db } from "@/db/client";
import { listVaccinationFormRows } from "@/db/repositories/health-vaccination/search";
import type { HealthVaccinationContext } from "@/lib/contracts/health-vaccination";
export async function vaccinationFormOptions(context: HealthVaccinationContext) {
  const units = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const { vaccines, stocks, diluents, vials, professionals, campaigns } = await listVaccinationFormRows(context.database ?? db, units);
  return {
    vaccines,
    stocks: stocks.map(stock => ({ id: stock.id, vaccineId: stock.material.vaccine!.id, warehouseId: stock.warehouseId, warehouseName: stock.warehouse.name, unitId: stock.warehouse.healthUnitId!, batchNumber: stock.batchNumber, quantity: stock.quantity, expirationDate: stock.expirationDate?.toISOString().slice(0, 10) || null, configured: !!stock.vaccineLotProfile, blocked: !!stock.blockedAt })),
    diluents: diluents.map(stock => ({ id: stock.id, materialId: stock.materialId, warehouseId: stock.warehouseId, name: stock.material.name, batchNumber: stock.batchNumber, quantity: stock.quantity, blocked: !!stock.blockedAt })),
    vials: vials.map(vial => ({ id: vial.id, stockId: vial.stockId, remainingDoses: vial.remainingDoses, openedAt: vial.openedAt.toISOString(), expiresAt: vial.expiresAt?.toISOString() || null })),
    professionals: professionals.map(professional => ({ id: professional.id, name: professional.employee.name, unitIds: [...new Set([professional.unitId, ...professional.assignments.map(link => link.unitId)].filter((id): id is string => !!id))] })),
    currentProfessionalId: professionals.find(professional => professional.employeeId === context.user.employeeId)?.id || "",
    campaigns: campaigns.map(campaign => ({ id: campaign.id, name: campaign.name, startsAt: campaign.startsAt.toISOString(), endsAt: campaign.endsAt.toISOString() })),
    initialDate: new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T").slice(0, 16),
  };
}
export type VaccinationFormOptions = Awaited<ReturnType<typeof vaccinationFormOptions>>;
