import { and, eq } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { fleetJson, requiredFleetRecord } from "@/db/repositories/fleet/records";
import { fleetAuthorizations, fleetCatalogEntries, fleetCatalogVersions, fleetDrivers, fleetMachineTypes, fleetRoutes, fleetTrips, fleetUnitControls } from "@/db/schema/fleet";
import { departments, employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { costCenters } from "@/db/schema/master-data";
import { assets } from "@/db/schema/assets";
import { z } from "zod";
import type { FleetScope } from "./service";
import { assertFleetVersion, FleetControlError, lockFleetResources, scopedFleetUnit, type FleetControlTx } from "./control-access";
import { controlSchemas, machineFieldsSchema, stableFleetHash, validateMachineValues } from "./control-policy";
import { dateOnly } from "./contract";

export async function saveFleetUnitControl(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.unitControl.parse(raw);
  await lockFleetResources(tx, [`UNIT:${input.unitId}`]);
  const unit = await scopedFleetUnit(tx, scope, input.unitId, false);
  if (unit.control) assertFleetVersion(unit.control.updatedAt, input.version); else if (input.version) throw new FleetControlError("Configuração criada por outra sessão.");
  if (unit.control && unit.control.meterType !== input.meterType && (unit.control.currentReading !== null || (await tx.select({ id: fleetTrips.id }).from(fleetTrips).where(eq(fleetTrips.unitId, unit.id)).limit(1)).length || (await tx.select({ id: fleetAuthorizations.id }).from(fleetAuthorizations).where(eq(fleetAuthorizations.unitId, unit.id)).limit(1)).length)) throw new FleetControlError("O marcador possui histórico; não altere a unidade de leitura.");
  if (unit.control?.currentReading !== null && unit.control?.currentReading !== undefined && input.currentReading && new Decimal(input.currentReading).lt(unit.control.currentReading)) throw new FleetControlError("Leitura não pode regredir.");
  if (unit.assetId && input.acquisitionDate && input.acquisitionDate !== unit.asset?.acquisitionDate.toISOString().slice(0, 10)) throw new FleetControlError("Aquisição do bem é definida em Patrimônio.");
  if (input.fixedRouteId && !(await tx.select({ id: fleetRoutes.id }).from(fleetRoutes).where(and(eq(fleetRoutes.id, input.fixedRouteId), eq(fleetRoutes.departmentId, unit.departmentId!), eq(fleetRoutes.active, true))).limit(1)).length) throw new FleetControlError("Rota fixa deve estar ativa na repartição da unidade.");
  if (input.costCenterId) {
    const department = requiredFleetRecord(await tx.select({ secretariatId: departments.secretariatId }).from(departments).where(eq(departments.id, unit.departmentId!)).limit(1));
    if (!(await tx.select({ id: costCenters.id }).from(costCenters).where(and(eq(costCenters.id, input.costCenterId), eq(costCenters.secretariatId, department.secretariatId))).limit(1)).length) throw new FleetControlError("Centro de custo fora da secretaria responsável.");
  }
  if (input.fipeModelId) {
    const [item] = await tx.select({ details: fleetCatalogEntries.details }).from(fleetCatalogEntries).innerJoin(fleetCatalogVersions, eq(fleetCatalogVersions.id, fleetCatalogEntries.versionId)).where(and(eq(fleetCatalogEntries.id, input.fipeModelId), eq(fleetCatalogVersions.kind, "FIPE"), eq(fleetCatalogVersions.published, true))).limit(1);
    if (!item) throw new FleetControlError("Modelo FIPE não publicado.");
    const fipe = z.object({ brand: z.string(), model: z.string() }).parse(item.details);
    const origin = unit.assetId ? requiredFleetRecord(await tx.select({ brand: assets.brand, model: assets.model }).from(assets).where(eq(assets.id, unit.assetId)).limit(1)) : unit;
    if (origin.brand && origin.brand.toLocaleLowerCase("pt-BR") !== fipe.brand.toLocaleLowerCase("pt-BR") || origin.model && origin.model.toLocaleLowerCase("pt-BR") !== fipe.model.toLocaleLowerCase("pt-BR")) throw new FleetControlError("O modelo FIPE diverge da marca/modelo de origem. Concilie o cadastro de origem.");
  }
  const machine = input.machineTypeId ? (await tx.select().from(fleetMachineTypes).where(and(eq(fleetMachineTypes.id, input.machineTypeId), eq(fleetMachineTypes.active, true))).limit(1))[0] : null;
  if (unit.category === "MAQUINA" && (!machine || !input.machineTypeId)) throw new FleetControlError("Selecione tipo configurado de maquinário.");
  if (input.machineTypeId && !machine) throw new FleetControlError("Tipo de máquina indisponível.");
  if (machine) validateMachineValues(machineFieldsSchema.parse(machine.fields), input.machineValues);
  if (input.meterType === "SEM_MARCADOR" && input.currentReading) throw new FleetControlError("Unidade sem marcador não recebe leitura.");
  const data = { species: input.species || null, color: input.color || null, fuelType: input.fuelType || null, tankCapacity: input.tankCapacity ? new Decimal(input.tankCapacity) : null, meterType: input.meterType, currentReading: input.currentReading ? new Decimal(input.currentReading) : unit.control?.currentReading || null, expectedConsumption: input.expectedConsumption ? new Decimal(input.expectedConsumption) : null, tolerancePercent: new Decimal(input.tolerancePercent), costCenterId: input.costCenterId || null, acquisitionDate: unit.assetId ? null : input.acquisitionDate ? dateOnly(input.acquisitionDate) : null, fipeModelId: input.fipeModelId || null, machineTypeId: input.machineTypeId || null, machineValues: input.machineValues, fixedRouteId: input.fixedRouteId || null, allowedLicenseCategories: [...new Set(input.allowedLicenseCategories)] };
  const result = requiredFleetRecord(await tx.insert(fleetUnitControls).values({ unitId: unit.id, ...data }).onConflictDoUpdate({ target: fleetUnitControls.unitId, set: data }).returning());
  return { id: result.unitId, type: "UNIT_CONTROL", unitId: unit.id };
}

export async function saveFleetDriver(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.driver.parse(raw);
  if (!scope.administrator && input.departmentId !== scope.departmentId || !(await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, input.departmentId), eq(departments.isActive, true))).limit(1)).length) throw new FleetControlError("Repartição não autorizada.");
  const employee = input.employeeId ? (await tx.select({ id: employees.id, personId: employees.personId }).from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.isActive, true), eq(employees.departmentId, input.departmentId))).limit(1))[0] : null;
  const personId = employee?.personId || input.personId;
  if (input.employeeId && (!employee || !employee.personId)) throw new FleetControlError("Servidor deve ter pessoa canônica e repartição ativa no RH.");
  if (!input.employeeId && !input.outsourced) throw new FleetControlError("Motorista sem vínculo RH deve estar identificado como terceirizado.");
  if (!(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, personId), eq(people.status, "Ativo"))).limit(1)).length) throw new FleetControlError("Pessoa de origem ausente ou inativa.");
  await lockFleetResources(tx, [`DRIVER_PERSON:${personId}`, ...(input.id ? [`DRIVER:${input.id}`] : [])]);
  const previous = input.id ? (await tx.select().from(fleetDrivers).where(eq(fleetDrivers.id, input.id)).limit(1))[0] : null;
  if (input.id && !previous) throw new FleetControlError("Motorista não encontrado.");
  if (previous) {
    const originEmployee = previous.employeeId ? (await tx.select({ departmentId: employees.departmentId }).from(employees).where(eq(employees.id, previous.employeeId)).limit(1))[0] : null;
    assertFleetVersion(previous.updatedAt, input.version);
    if (!scope.administrator && (originEmployee?.departmentId || previous.departmentId) !== scope.departmentId || previous.personId !== personId || previous.employeeId !== (employee?.id || null)) throw new FleetControlError("Preserve identidade e vínculo de origem do motorista.");
  }
  const values = { personId, employeeId: employee?.id || null, departmentId: input.departmentId, outsourced: input.outsourced, cnhNumber: input.cnhNumber, cnhCategories: [...new Set(input.cnhCategories)], cnhExpiresAt: dateOnly(input.cnhExpiresAt), active: input.active, suspensionUntil: input.suspensionUntil ? dateOnly(input.suspensionUntil) : null, pointLimit: input.pointLimit, pointWindowMonths: input.pointWindowMonths, policyReference: input.policyReference };
  const driver = requiredFleetRecord(previous ? await tx.update(fleetDrivers).set(values).where(eq(fleetDrivers.id, previous.id)).returning() : await tx.insert(fleetDrivers).values({ ...values, createdById: scope.actorId }).returning());
  return { id: driver.id, type: "DRIVER" };
}

export async function importFleetCatalog(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  if (!scope.administrator) throw new FleetControlError("Catálogos FIPE/CTB exigem administração.");
  const input = controlSchemas.catalog.parse(raw);
  for (const entry of input.entries) {
    if (input.kind === "FIPE") z.object({ brand: z.string().min(1), model: z.string().min(1), yearLabel: z.string().min(1), referenceMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }).passthrough().parse(entry.details);
    else z.object({ nature: z.string().min(1), points: z.number().int().min(0).max(20), amount: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable(), article: z.string().min(1), validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).passthrough().parse(entry.details);
  }
  const hash = stableFleetHash(input.entries);
  const [previous] = await tx.select().from(fleetCatalogVersions).where(and(eq(fleetCatalogVersions.kind, input.kind), eq(fleetCatalogVersions.reference, input.reference), eq(fleetCatalogVersions.sha256, hash))).limit(1);
  if (previous) return { id: previous.id, type: "CATALOG" };
  const version = requiredFleetRecord(await tx.insert(fleetCatalogVersions).values({ kind: input.kind, reference: input.reference, sourceReference: input.sourceReference, sha256: hash, complete: input.complete, published: true, createdById: scope.actorId }).returning());
  for (let offset = 0; offset < input.entries.length; offset += 500) await tx.insert(fleetCatalogEntries).values(input.entries.slice(offset, offset + 500).map(entry => ({ versionId: version.id, code: entry.code, name: entry.name, details: fleetJson(entry.details) })));
  return { id: version.id, type: "CATALOG" };
}
