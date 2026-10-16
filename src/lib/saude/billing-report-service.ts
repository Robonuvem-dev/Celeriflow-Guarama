import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { appointmentBillingContextSchema } from "./billing-price-service";

const filtersSchema = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), unitId: z.string().max(200).default(""), professionalId: z.string().max(200).default(""), patientId: z.string().max(200).default(""), groupBy: z.enum(["UNIT", "PROFESSIONAL", "GENERAL"]).default("UNIT") }).strict();
function unitScope(context: AppContext, selected: string) {
  if (selected) { assertHealthUnitAccess(context.user, selected); return [selected]; }
  return context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined;
}

export async function healthBillingPreview(context: AppContext, raw: unknown) {
  const input = filtersSchema.parse(raw), unitIds = unitScope(context, input.unitId);
  const [facts, competence] = await Promise.all([
    context.prisma.healthProductionFact.findMany({ where: { period: input.period, ...(unitIds ? { unitId: { in: unitIds } } : {}), ...(input.professionalId ? { professionalId: input.professionalId } : {}), ...(input.patientId ? { patientId: input.patientId } : {}) }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], include: { unit: { select: { name: true, cnes: true } }, professional: { select: { employee: { select: { name: true } }, cns: true, cbo: true } }, patient: { select: { cns: true, person: { select: { fullName: true, birthDate: true, gender: true } } } }, procedure: { select: { code: true, description: true } }, cidReference: { select: { code: true } }, criticisms: { where: { status: "ABERTA" }, select: { code: true, message: true } } } }),
    context.prisma.healthProductionCompetence.findUnique({ where: { period: input.period }, select: { status: true } }),
  ]);
  const validated = competence && ["PROCESSADA", "FECHADA"].includes(competence.status);
  type Group = { key: string; name: string; quantity: number; validQuantity: number; criticizedQuantity: number; pendingQuantity: number; knownValue: Prisma.Decimal; unknownValueFacts: number; patientIds: Set<string> };
  const groups = new Map<string, Group>();
  const rows = facts.map(fact => {
    const pricing = z.object({ source: z.string().optional(), table: z.object({ id: z.string(), code: z.string(), version: z.number() }).nullable().optional(), billingContext: appointmentBillingContextSchema.nullable().optional() }).safeParse(fact.pricingSnapshot);
    const provider = pricing.success ? pricing.data.billingContext?.providerUnit : null;
    const key = input.groupBy === "GENERAL" ? "GENERAL" : input.groupBy === "PROFESSIONAL" ? fact.professionalId || "UNKNOWN" : fact.unitId || "UNKNOWN";
    const name = input.groupBy === "GENERAL" ? "Geral do recorte autorizado" : input.groupBy === "PROFESSIONAL" ? fact.professional?.employee.name || "Profissional não informado" : fact.unit?.name || "Unidade não informada";
    const status = fact.criticisms.length || fact.status === "CRITICADO" ? "CRITICADO" : validated ? "VALIDO" : "PENDENTE_VALIDACAO";
    const group = groups.get(key) || { key, name, quantity: 0, validQuantity: 0, criticizedQuantity: 0, pendingQuantity: 0, knownValue: new Prisma.Decimal(0), unknownValueFacts: 0, patientIds: new Set<string>() };
    group.quantity += fact.quantity;
    if (status === "VALIDO") group.validQuantity += fact.quantity;
    else if (status === "CRITICADO") group.criticizedQuantity += fact.quantity;
    else group.pendingQuantity += fact.quantity;
    if (fact.value === null) group.unknownValueFacts += 1; else group.knownValue = group.knownValue.plus(fact.value);
    if (fact.patientId) group.patientIds.add(fact.patientId);
    groups.set(key, group);
    return { id: fact.id, originType: fact.originType, originId: fact.originId, occurredAt: fact.occurredAt.toISOString(), unitId: fact.unitId, unit: fact.unit?.name || "Não informada", cnes: provider ? provider.cnes : fact.unit?.cnes || null, billingProviderUnitId: provider?.id || null, billingProviderUnit: provider?.name || null, professionalId: fact.professionalId, professional: fact.professional?.employee.name || "Não informado", professionalCns: fact.professional?.cns || null, cbo: fact.professional?.cbo || null, patientId: fact.patientId, patient: fact.patient?.person.fullName || null, patientCns: fact.patient?.cns || null, birthDate: fact.patient?.person.birthDate?.toISOString() || null, gender: fact.patient?.person.gender || null, municipality: fact.municipality, state: fact.state, cid: fact.cidReference?.code || null, procedureCode: fact.procedure?.code || null, procedure: fact.procedure?.description || null, quantity: fact.quantity, value: fact.value?.toFixed(2) ?? null, priceSource: pricing.success ? pricing.data.source || "SEM_MEMORIA" : "SEM_MEMORIA", priceTable: pricing.success && pricing.data.table ? `${pricing.data.table.code} · versão ${pricing.data.table.version} · ${pricing.data.table.id}` : null, status, criticisms: fact.criticisms.map(criticism => `${criticism.code}: ${criticism.message}`) };
  });
  return { period: input.period, competenceStatus: competence?.status || "NAO_ABERTA", groupBy: input.groupBy, groups: [...groups.values()].map(group => ({ key: group.key, name: group.name, quantity: group.quantity, validQuantity: group.validQuantity, criticizedQuantity: group.criticizedQuantity, pendingQuantity: group.pendingQuantity, knownValue: group.knownValue.toFixed(2), totalValue: group.unknownValueFacts ? null : group.knownValue.toFixed(2), unknownValueFacts: group.unknownValueFacts, patients: group.patientIds.size })), rows };
}

export async function healthPatientConsumptionCost(context: AppContext, raw: unknown) {
  const input = filtersSchema.omit({ groupBy: true, professionalId: true }).extend({ patientId: z.string().min(1).max(200) }).parse(raw);
  const unitIds = unitScope(context, input.unitId);
  const patient = await context.prisma.patient.findUniqueOrThrow({ where: { id: input.patientId }, include: { person: { select: { fullName: true } } } });
  if (unitIds && (!patient.referenceUnitId || !unitIds.includes(patient.referenceUnitId))) {
    if (!await context.prisma.medicalRecord.count({ where: { patientId: patient.id, unitId: { in: unitIds } } })) throw new Error("Paciente fora do escopo de unidades autorizado.");
  }
  const [year, month] = input.period.split("-").map(Number);
  const dateRange = { gte: new Date(`${input.period}-01T00:00:00-03:00`), lt: new Date(`${new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)}T00:00:00-03:00`) };
  const [dispensations, administrations, vaccinations, distributions, fulfillments, kits] = await Promise.all([
    context.prisma.medicineDispensation.findMany({ where: { patientId: patient.id, status: "ACTIVE", date: dateRange, ...(unitIds ? { unitId: { in: unitIds } } : {}) }, select: { id: true, movementId: true, medicine: { select: { name: true } } } }),
    context.prisma.healthMedicationAdministration.findMany({ where: { administeredAt: dateRange, medicalRecord: { patientId: patient.id, ...(unitIds ? { unitId: { in: unitIds } } : {}) } }, select: { id: true, movementId: true, materials: true, patientOwned: true, medicineName: true, medicalRecordId: true } }),
    context.prisma.vaccinationRecord.findMany({ where: { patientId: patient.id, date: dateRange, ...(unitIds ? { unitId: { in: unitIds } } : {}) }, select: { id: true, movementId: true, vaccine: { select: { name: true } }, openedVial: { select: { diluentMovementId: true, totalDoses: true } } } }),
    context.prisma.specializedDistribution.findMany({ where: { patientId: patient.id, deliveredAt: dateRange, ...(unitIds ? { warehouse: { healthUnitId: { in: unitIds } } } : {}) }, select: { id: true, movementId: true } }),
    context.prisma.pharmacyRequestFulfillment.findMany({ where: { status: "ACTIVE", dispensationId: null, createdAt: dateRange, requestItem: { request: { patientId: patient.id, ...(unitIds ? { destinationWarehouse: { healthUnitId: { in: unitIds } } } : {}) } } }, select: { id: true, movementId: true } }),
    context.prisma.healthPharmacyKitDeliveryItem.findMany({ where: { dispensation: null, delivery: { patientId: patient.id, status: "DELIVERED", deliveredAt: dateRange, ...(unitIds ? { warehouse: { healthUnitId: { in: unitIds } } } : {}) } }, select: { id: true, movementId: true } }),
  ]);
  const references = new Map<string, { origins: string[]; weight: Prisma.Decimal; full: boolean }>();
  const unlinked: string[] = [], patientOwned: string[] = [];
  const add = (movementId: string | null, origin: string, weight?: Prisma.Decimal) => {
    if (!movementId) { unlinked.push(origin); return; }
    const current = references.get(movementId) || { origins: [], weight: new Prisma.Decimal(0), full: false };
    current.origins.push(origin);
    if (!weight) current.full = true; else current.weight = current.weight.plus(weight);
    references.set(movementId, current);
  };
  for (const item of dispensations) add(item.movementId, `DISPENSACAO:${item.id} · ${item.medicine.name}`);
  for (const item of administrations) {
    if (item.patientOwned) patientOwned.push(`${item.id} · ${item.medicineName}`); else add(item.movementId, `ADMINISTRACAO:${item.id} · ${item.medicineName}`);
    const materials = z.array(z.object({ movementId: z.string().min(1) })).safeParse(item.materials);
    if (!materials.success) unlinked.push(`MATERIAIS_ADMINISTRACAO:${item.id}`);
    else for (const material of materials.data) add(material.movementId, `MATERIAIS_ADMINISTRACAO:${item.id}`);
  }
  for (const item of vaccinations) {
    add(item.movementId, `VACINACAO:${item.id} · ${item.vaccine.name}`);
    if (item.openedVial?.diluentMovementId && item.openedVial.totalDoses > 0) add(item.openedVial.diluentMovementId, `DILUENTE_RATEADO:${item.id}`, new Prisma.Decimal(1).div(item.openedVial.totalDoses));
  }
  for (const item of distributions) add(item.movementId, `DISTRIBUICAO_ESPECIALIZADA:${item.id}`);
  for (const item of fulfillments) add(item.movementId, `ENTREGA_CORRELATO:${item.id}`);
  for (const item of kits) add(item.movementId, `KIT_CORRELATO:${item.id}`);
  const movements = await context.prisma.materialMovement.findMany({ where: { id: { in: [...references.keys()] }, ...(unitIds ? { warehouse: { healthUnitId: { in: unitIds } } } : {}) }, include: { material: { select: { name: true } }, warehouse: { select: { name: true } }, reversalMovement: { select: { id: true } }, returnMovements: { include: { reversalMovement: { select: { id: true } } } } } });
  let knownCost = new Prisma.Decimal(0), unknownCosts = unlinked.length;
  const rows = movements.map(movement => {
    const reference = references.get(movement.id)!;
    const originalQuantity = movement.quantityDecimal || new Prisma.Decimal(movement.quantity);
    const returned = movement.returnMovements.filter(item => !item.reversalMovement).reduce((sum, item) => sum.plus(item.quantityDecimal || item.quantity), new Prisma.Decimal(0));
    const netQuantity = movement.reversalMovement ? new Prisma.Decimal(0) : Prisma.Decimal.max(0, originalQuantity.minus(returned));
    const weight = reference.full ? new Prisma.Decimal(1) : Prisma.Decimal.min(reference.weight, 1);
    let cost: Prisma.Decimal | null = netQuantity.isZero() ? new Prisma.Decimal(0) : null;
    if (!cost && originalQuantity.gt(0)) {
      if (movement.totalValueDecimal !== null) cost = movement.totalValueDecimal.mul(netQuantity).div(originalQuantity);
      else if (movement.unitValueDecimal !== null || movement.unitValue !== null) cost = new Prisma.Decimal(movement.unitValueDecimal ?? movement.unitValue!).mul(netQuantity);
    }
    const allocatedCost = cost?.mul(weight) ?? null;
    if (allocatedCost === null) unknownCosts += 1; else knownCost = knownCost.plus(allocatedCost);
    return { movementId: movement.id, material: movement.material.name, warehouse: movement.warehouse.name, origins: reference.origins, netQuantity: netQuantity.mul(weight).toFixed(6), allocation: reference.full ? "INTEGRAL" : "DILUENTE_POR_DOSE_DO_FRASCO", cost: allocatedCost?.toFixed(6) ?? null, reversed: Boolean(movement.reversalMovement) };
  });
  const returnedIds = new Set(movements.map(movement => movement.id));
  for (const [movementId, reference] of references) if (!returnedIds.has(movementId)) { unknownCosts += 1; unlinked.push(`${movementId} · ${reference.origins.join("; ")}`); }
  return { patientId: patient.id, patientName: patient.person.fullName, period: input.period, knownCost: knownCost.toFixed(6), totalCost: unknownCosts ? null : knownCost.toFixed(6), unknownCosts, patientOwnedMedicines: patientOwned, unlinked, rows };
}
