import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { healthProductionFacts, healthProductionCompetences, healthProductionCriticisms } from "@/db/schema/health-production";
import { healthUnits, healthProfessionals } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { healthSusProcedures, healthSusReferences } from "@/db/schema/health-catalogs";
import { medicalRecords, healthMedicationAdministrations } from "@/db/schema/health-care";
import { materialMovements, materials, warehouses } from "@/db/schema/assets-stock";
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
  const database = context.database ?? db;
  const [factRows, competenceRows] = await Promise.all([
    database.select({ fact: healthProductionFacts, unit: { name: healthUnits.name, cnes: healthUnits.cnes }, professional: { cns: healthProfessionals.cns, cbo: healthProfessionals.cbo }, employee: { name: employees.name }, patient: { cns: patients.cns }, person: { fullName: people.fullName, birthDate: people.birthDate, gender: people.gender }, procedure: { code: healthSusProcedures.code, description: healthSusProcedures.description }, cidReference: { code: healthSusReferences.code } }).from(healthProductionFacts).leftJoin(healthUnits, eq(healthUnits.id, healthProductionFacts.unitId)).leftJoin(healthProfessionals, eq(healthProfessionals.id, healthProductionFacts.professionalId)).leftJoin(employees, eq(employees.id, healthProfessionals.employeeId)).leftJoin(patients, eq(patients.id, healthProductionFacts.patientId)).leftJoin(people, eq(people.id, patients.personId)).leftJoin(healthSusProcedures, eq(healthSusProcedures.id, healthProductionFacts.procedureId)).leftJoin(healthSusReferences, eq(healthSusReferences.id, healthProductionFacts.cidReferenceId)).where(and(eq(healthProductionFacts.period, input.period), unitIds ? inArray(healthProductionFacts.unitId, unitIds) : undefined, input.professionalId ? eq(healthProductionFacts.professionalId, input.professionalId) : undefined, input.patientId ? eq(healthProductionFacts.patientId, input.patientId) : undefined)).orderBy(asc(healthProductionFacts.occurredAt), asc(healthProductionFacts.id)),
    database.select({ status: healthProductionCompetences.status }).from(healthProductionCompetences).where(eq(healthProductionCompetences.period, input.period)).limit(1),
  ]);
  const criticisms = await database.select({ factId: healthProductionCriticisms.factId, code: healthProductionCriticisms.code, message: healthProductionCriticisms.message }).from(healthProductionCriticisms).where(and(inArray(healthProductionCriticisms.factId, factRows.map(row => row.fact.id)), eq(healthProductionCriticisms.status, "ABERTA")));
  const competence = competenceRows[0], facts = factRows.map(row => ({ ...row.fact, unit: row.unit, professional: row.professional && row.employee ? { ...row.professional, employee: row.employee } : null, patient: row.patient && row.person ? { ...row.patient, person: row.person } : null, procedure: row.procedure, cidReference: row.cidReference, criticisms: criticisms.filter(item => item.factId === row.fact.id) }));
  const validated = competence && ["PROCESSADA", "FECHADA"].includes(competence.status);
  type Group = { key: string; name: string; quantity: number; validQuantity: number; criticizedQuantity: number; pendingQuantity: number; knownValue: Decimal; unknownValueFacts: number; patientIds: Set<string> };
  const groups = new Map<string, Group>();
  const rows = facts.map(fact => {
    const pricing = z.object({ source: z.string().optional(), table: z.object({ id: z.string(), code: z.string(), version: z.number() }).nullable().optional(), billingContext: appointmentBillingContextSchema.nullable().optional() }).safeParse(fact.pricingSnapshot);
    const provider = pricing.success ? pricing.data.billingContext?.providerUnit : null;
    const key = input.groupBy === "GENERAL" ? "GENERAL" : input.groupBy === "PROFESSIONAL" ? fact.professionalId || "UNKNOWN" : fact.unitId || "UNKNOWN";
    const name = input.groupBy === "GENERAL" ? "Geral do recorte autorizado" : input.groupBy === "PROFESSIONAL" ? fact.professional?.employee.name || "Profissional não informado" : fact.unit?.name || "Unidade não informada";
    const status = fact.criticisms.length || fact.status === "CRITICADO" ? "CRITICADO" : validated ? "VALIDO" : "PENDENTE_VALIDACAO";
    const group = groups.get(key) || { key, name, quantity: 0, validQuantity: 0, criticizedQuantity: 0, pendingQuantity: 0, knownValue: new Decimal(0), unknownValueFacts: 0, patientIds: new Set<string>() };
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
  const database = context.database ?? db;
  const [patientRow] = await database.select({ patient: patients, person: { fullName: people.fullName } }).from(patients).innerJoin(people, eq(people.id, patients.personId)).where(eq(patients.id, input.patientId)).limit(1);
  if (!patientRow) throw new Error("Paciente não encontrado.");
  const patient = { ...patientRow.patient, person: patientRow.person };
  if (unitIds && (!patient.referenceUnitId || !unitIds.includes(patient.referenceUnitId))) {
    if (!(await database.select({ id: medicalRecords.id }).from(medicalRecords).where(and(eq(medicalRecords.patientId, patient.id), inArray(medicalRecords.unitId, unitIds))).limit(1)).length) throw new Error("Paciente fora do escopo de unidades autorizado.");
  }
  const [year, month] = input.period.split("-").map(Number);
  const dateRange = { gte: new Date(`${input.period}-01T00:00:00-03:00`), lt: new Date(`${new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)}T00:00:00-03:00`) };
  const [dispensationResult, administrations, vaccinationResult, distributionResult, fulfillmentResult, kitResult] = await Promise.all([
    database.execute<{ id: string; movementId: string | null; medicineName: string }>(sql`SELECT d.id, d."movementId", m.name AS "medicineName" FROM "MedicineDispensation" d JOIN "Medicine" m ON m.id=d."medicineId" WHERE d."patientId"=${patient.id} AND d.status='ACTIVE' AND d.date>=${dateRange.gte} AND d.date<${dateRange.lt} AND ${unitIds ? inArray(sql`d."unitId"`, unitIds) : sql`true`}`),
    database.select({ id: healthMedicationAdministrations.id, movementId: healthMedicationAdministrations.movementId, materials: healthMedicationAdministrations.materials, patientOwned: healthMedicationAdministrations.patientOwned, medicineName: healthMedicationAdministrations.medicineName, medicalRecordId: healthMedicationAdministrations.medicalRecordId }).from(healthMedicationAdministrations).innerJoin(medicalRecords, eq(medicalRecords.id, healthMedicationAdministrations.medicalRecordId)).where(and(eq(medicalRecords.patientId, patient.id), gte(healthMedicationAdministrations.administeredAt, dateRange.gte), lt(healthMedicationAdministrations.administeredAt, dateRange.lt), unitIds ? inArray(medicalRecords.unitId, unitIds) : undefined)),
    database.execute<{ id: string; movementId: string | null; vaccineName: string; diluentMovementId: string | null; totalDoses: number | null }>(sql`SELECT v.id, v."movementId", x.name AS "vaccineName", f."diluentMovementId", f."totalDoses" FROM "VaccinationRecord" v JOIN "Vaccine" x ON x.id=v."vaccineId" LEFT JOIN "HealthVaccineOpenedVial" f ON f.id=v."openedVialId" WHERE v."patientId"=${patient.id} AND v.date>=${dateRange.gte} AND v.date<${dateRange.lt} AND ${unitIds ? inArray(sql`v."unitId"`, unitIds) : sql`true`}`),
    database.execute<{ id: string; movementId: string | null }>(sql`SELECT d.id, d."movementId" FROM "SpecializedDistribution" d JOIN "Warehouse" w ON w.id=d."warehouseId" WHERE d."patientId"=${patient.id} AND d."deliveredAt">=${dateRange.gte} AND d."deliveredAt"<${dateRange.lt} AND ${unitIds ? inArray(sql`w."healthUnitId"`, unitIds) : sql`true`}`),
    database.execute<{ id: string; movementId: string | null }>(sql`SELECT f.id, f."movementId" FROM "PharmacyRequestFulfillment" f JOIN "PharmacyRequestItem" i ON i.id=f."requestItemId" JOIN "PharmacyRequest" r ON r.id=i."requestId" LEFT JOIN "Warehouse" w ON w.id=r."destinationWarehouseId" WHERE f.status='ACTIVE' AND f."dispensationId" IS NULL AND f."createdAt">=${dateRange.gte} AND f."createdAt"<${dateRange.lt} AND r."patientId"=${patient.id} AND ${unitIds ? inArray(sql`w."healthUnitId"`, unitIds) : sql`true`}`),
    database.execute<{ id: string; movementId: string | null }>(sql`SELECT i.id, i."movementId" FROM "HealthPharmacyKitDeliveryItem" i JOIN "HealthPharmacyKitDelivery" d ON d.id=i."deliveryId" JOIN "Warehouse" w ON w.id=d."warehouseId" WHERE NOT EXISTS (SELECT 1 FROM "MedicineDispensation" x WHERE x."kitDeliveryItemId"=i.id) AND d."patientId"=${patient.id} AND d.status='DELIVERED' AND d."deliveredAt">=${dateRange.gte} AND d."deliveredAt"<${dateRange.lt} AND ${unitIds ? inArray(sql`w."healthUnitId"`, unitIds) : sql`true`}`),
  ]);
  const dispensations = dispensationResult.rows, vaccinations = vaccinationResult.rows, distributions = distributionResult.rows, fulfillments = fulfillmentResult.rows, kits = kitResult.rows;
  const references = new Map<string, { origins: string[]; weight: Decimal; full: boolean }>();
  const unlinked: string[] = [], patientOwned: string[] = [];
  const add = (movementId: string | null, origin: string, weight?: Decimal) => {
    if (!movementId) { unlinked.push(origin); return; }
    const current = references.get(movementId) || { origins: [], weight: new Decimal(0), full: false };
    current.origins.push(origin);
    if (!weight) current.full = true; else current.weight = current.weight.plus(weight);
    references.set(movementId, current);
  };
  for (const item of dispensations) add(item.movementId, `DISPENSACAO:${item.id} · ${item.medicineName}`);
  for (const item of administrations) {
    if (item.patientOwned) patientOwned.push(`${item.id} · ${item.medicineName}`); else add(item.movementId, `ADMINISTRACAO:${item.id} · ${item.medicineName}`);
    const materials = z.array(z.object({ movementId: z.string().min(1) })).safeParse(item.materials);
    if (!materials.success) unlinked.push(`MATERIAIS_ADMINISTRACAO:${item.id}`);
    else for (const material of materials.data) add(material.movementId, `MATERIAIS_ADMINISTRACAO:${item.id}`);
  }
  for (const item of vaccinations) {
    add(item.movementId, `VACINACAO:${item.id} · ${item.vaccineName}`);
    if (item.diluentMovementId && item.totalDoses !== null && item.totalDoses > 0) add(item.diluentMovementId, `DILUENTE_RATEADO:${item.id}`, new Decimal(1).div(item.totalDoses));
  }
  for (const item of distributions) add(item.movementId, `DISTRIBUICAO_ESPECIALIZADA:${item.id}`);
  for (const item of fulfillments) add(item.movementId, `ENTREGA_CORRELATO:${item.id}`);
  for (const item of kits) add(item.movementId, `KIT_CORRELATO:${item.id}`);
  const movementRows = await database.select({ movement: materialMovements, material: { name: materials.name }, warehouse: { name: warehouses.name }, reversed: sql<boolean>`EXISTS (SELECT 1 FROM "MaterialMovement" r WHERE r."reversedMovementId"=${materialMovements.id})` }).from(materialMovements).innerJoin(materials, eq(materials.id, materialMovements.materialId)).innerJoin(warehouses, eq(warehouses.id, materialMovements.warehouseId)).where(and(inArray(materialMovements.id, [...references.keys()]), unitIds ? inArray(warehouses.healthUnitId, unitIds) : undefined));
  const returns = await database.select({ originId: materialMovements.returnedMovementId, quantity: materialMovements.quantity, quantityDecimal: materialMovements.quantityDecimal, reversed: sql<boolean>`EXISTS (SELECT 1 FROM "MaterialMovement" r WHERE r."reversedMovementId"="MaterialMovement"."id")` }).from(materialMovements).where(inArray(materialMovements.returnedMovementId, movementRows.map(row => row.movement.id)));
  const movements = movementRows.map(row => ({ ...row.movement, material: row.material, warehouse: row.warehouse, reversalMovement: row.reversed, returnMovements: returns.filter(item => item.originId === row.movement.id) }));
  let knownCost = new Decimal(0), unknownCosts = unlinked.length;
  const rows = movements.map(movement => {
    const reference = references.get(movement.id)!;
    const originalQuantity = movement.quantityDecimal || new Decimal(movement.quantity);
    const returned = movement.returnMovements.filter(item => !item.reversed).reduce((sum, item) => sum.plus(item.quantityDecimal || item.quantity), new Decimal(0));
    const netQuantity = movement.reversalMovement ? new Decimal(0) : Decimal.max(0, originalQuantity.minus(returned));
    const weight = reference.full ? new Decimal(1) : Decimal.min(reference.weight, 1);
    let cost: Decimal | null = netQuantity.isZero() ? new Decimal(0) : null;
    if (!cost && originalQuantity.gt(0)) {
      if (movement.totalValueDecimal !== null) cost = movement.totalValueDecimal.mul(netQuantity).div(originalQuantity);
      else if (movement.unitValueDecimal !== null || movement.unitValue !== null) cost = new Decimal(movement.unitValueDecimal ?? movement.unitValue!).mul(netQuantity);
    }
    const allocatedCost = cost?.mul(weight) ?? null;
    if (allocatedCost === null) unknownCosts += 1; else knownCost = knownCost.plus(allocatedCost);
    return { movementId: movement.id, material: movement.material.name, warehouse: movement.warehouse.name, origins: reference.origins, netQuantity: netQuantity.mul(weight).toFixed(6), allocation: reference.full ? "INTEGRAL" : "DILUENTE_POR_DOSE_DO_FRASCO", cost: allocatedCost?.toFixed(6) ?? null, reversed: Boolean(movement.reversalMovement) };
  });
  const returnedIds = new Set(movements.map(movement => movement.id));
  for (const [movementId, reference] of references) if (!returnedIds.has(movementId)) { unknownCosts += 1; unlinked.push(`${movementId} · ${reference.origins.join("; ")}`); }
  return { patientId: patient.id, patientName: patient.person.fullName, period: input.period, knownCost: knownCost.toFixed(6), totalCost: unknownCosts ? null : knownCost.toFixed(6), unknownCosts, patientOwnedMedicines: patientOwned, unlinked, rows };
}
