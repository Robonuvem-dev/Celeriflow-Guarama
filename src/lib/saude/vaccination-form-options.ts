import type { AppContext } from "@/lib/platform/tenant-context";
export async function vaccinationFormOptions(context: AppContext) {
  const units = context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
  const warehouseScope = { healthUnitId: units ? { in: units } : { not: null } };
  const [vaccines, stocks, diluents, vials, professionals, campaigns] = await Promise.all([
    context.prisma.vaccine.findMany({ where: { isActive: true, materialId: { not: null } }, select: { id: true, name: true, diluentMaterialId: true }, orderBy: { name: "asc" } }),
    context.prisma.materialStock.findMany({ where: { quantity: { gt: 0 }, warehouse: warehouseScope, material: { vaccine: { isActive: true } } }, include: { warehouse: true, vaccineLotProfile: true, material: { select: { vaccine: { select: { id: true } } } } }, orderBy: { expirationDate: "asc" } }),
    context.prisma.materialStock.findMany({ where: { quantity: { gt: 0 }, warehouse: warehouseScope, material: { isActive: true, healthProfile: { productKind: "DILUENT", isActive: true } } }, include: { warehouse: true, material: { select: { name: true } } } }),
    context.prisma.healthVaccineOpenedVial.findMany({ where: { remainingDoses: { gt: 0 }, stock: { warehouse: warehouseScope } }, orderBy: { openedAt: "asc" } }),
    context.prisma.healthProfessional.findMany({ where: { isActive: true, employee: { isActive: true }, ...(units ? { OR: [{ unitId: { in: units } }, { assignments: { some: { unitId: { in: units }, isActive: true } } }] } : {}) }, include: { employee: { select: { name: true } }, assignments: { where: { isActive: true }, select: { unitId: true } } }, orderBy: { employee: { name: "asc" } } }),
    context.prisma.healthVaccinationCampaign.findMany({ orderBy: { startsAt: "desc" } }),
  ]);
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
