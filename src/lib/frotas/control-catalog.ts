import { Prisma } from "@prisma/client";
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
  if (unit.control && unit.control.meterType !== input.meterType && (unit.control.currentReading !== null || await tx.fleetTrip.count({ where: { unitId: unit.id } }) || await tx.fleetAuthorization.count({ where: { unitId: unit.id } }))) throw new FleetControlError("O marcador possui histórico; não altere a unidade de leitura.");
  if (unit.control?.currentReading !== null && unit.control?.currentReading !== undefined && input.currentReading && new Prisma.Decimal(input.currentReading).lt(unit.control.currentReading)) throw new FleetControlError("Leitura não pode regredir.");
  if (unit.assetId && input.acquisitionDate && input.acquisitionDate !== unit.asset?.acquisitionDate.toISOString().slice(0, 10)) throw new FleetControlError("Aquisição do bem é definida em Patrimônio.");
  if (input.fixedRouteId && !await tx.fleetRoute.findFirst({ where: { id: input.fixedRouteId, departmentId: unit.departmentId!, active: true }, select: { id: true } })) throw new FleetControlError("Rota fixa deve estar ativa na repartição da unidade.");
  if (input.costCenterId) {
    const department = await tx.department.findUniqueOrThrow({ where: { id: unit.departmentId! }, select: { secretariatId: true } });
    if (!await tx.costCenter.findFirst({ where: { id: input.costCenterId, secretariatId: department.secretariatId }, select: { id: true } })) throw new FleetControlError("Centro de custo fora da secretaria responsável.");
  }
  if (input.fipeModelId) {
    const item = await tx.fleetCatalogEntry.findFirst({ where: { id: input.fipeModelId, version: { kind: "FIPE", published: true } }, select: { details: true } });
    if (!item) throw new FleetControlError("Modelo FIPE não publicado.");
    const fipe = item.details as { brand: string; model: string };
    const origin = unit.assetId ? await tx.asset.findUniqueOrThrow({ where: { id: unit.assetId }, select: { brand: true, model: true } }) : unit;
    if (origin.brand && origin.brand.toLocaleLowerCase("pt-BR") !== fipe.brand.toLocaleLowerCase("pt-BR") || origin.model && origin.model.toLocaleLowerCase("pt-BR") !== fipe.model.toLocaleLowerCase("pt-BR")) throw new FleetControlError("O modelo FIPE diverge da marca/modelo de origem. Concilie o cadastro de origem.");
  }
  const machine = input.machineTypeId ? await tx.fleetMachineType.findFirst({ where: { id: input.machineTypeId, active: true } }) : null;
  if (unit.category === "MAQUINA" && (!machine || !input.machineTypeId)) throw new FleetControlError("Selecione tipo configurado de maquinário.");
  if (input.machineTypeId && !machine) throw new FleetControlError("Tipo de máquina indisponível.");
  if (machine) validateMachineValues(machineFieldsSchema.parse(machine.fields), input.machineValues);
  if (input.meterType === "SEM_MARCADOR" && input.currentReading) throw new FleetControlError("Unidade sem marcador não recebe leitura.");
  const data = { species: input.species || null, color: input.color || null, fuelType: input.fuelType || null, tankCapacity: input.tankCapacity ? new Prisma.Decimal(input.tankCapacity) : null, meterType: input.meterType, currentReading: input.currentReading ? new Prisma.Decimal(input.currentReading) : unit.control?.currentReading || null, expectedConsumption: input.expectedConsumption ? new Prisma.Decimal(input.expectedConsumption) : null, tolerancePercent: new Prisma.Decimal(input.tolerancePercent), costCenterId: input.costCenterId || null, acquisitionDate: unit.assetId ? null : input.acquisitionDate ? dateOnly(input.acquisitionDate) : null, fipeModelId: input.fipeModelId || null, machineTypeId: input.machineTypeId || null, machineValues: input.machineValues, fixedRouteId: input.fixedRouteId || null, allowedLicenseCategories: [...new Set(input.allowedLicenseCategories)] };
  const result = await tx.fleetUnitControl.upsert({ where: { unitId: unit.id }, create: { unitId: unit.id, ...data }, update: data });
  return { id: result.unitId, type: "UNIT_CONTROL", unitId: unit.id };
}

export async function saveFleetDriver(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.driver.parse(raw);
  if (!scope.administrator && input.departmentId !== scope.departmentId || !await tx.department.findFirst({ where: { id: input.departmentId, isActive: true }, select: { id: true } })) throw new FleetControlError("Repartição não autorizada.");
  const employee = input.employeeId ? await tx.employee.findFirst({ where: { id: input.employeeId, isActive: true, departmentId: input.departmentId }, select: { id: true, personId: true } }) : null;
  const personId = employee?.personId || input.personId;
  if (input.employeeId && (!employee || !employee.personId)) throw new FleetControlError("Servidor deve ter pessoa canônica e repartição ativa no RH.");
  if (!input.employeeId && !input.outsourced) throw new FleetControlError("Motorista sem vínculo RH deve estar identificado como terceirizado.");
  if (!await tx.person.findFirst({ where: { id: personId, status: "Ativo" }, select: { id: true } })) throw new FleetControlError("Pessoa de origem ausente ou inativa.");
  await lockFleetResources(tx, [`DRIVER_PERSON:${personId}`, ...(input.id ? [`DRIVER:${input.id}`] : [])]);
  const previous = input.id ? await tx.fleetDriver.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !previous) throw new FleetControlError("Motorista não encontrado.");
  if (previous) {
    const originEmployee = previous.employeeId ? await tx.employee.findUnique({ where: { id: previous.employeeId }, select: { departmentId: true } }) : null;
    assertFleetVersion(previous.updatedAt, input.version);
    if (!scope.administrator && (originEmployee?.departmentId || previous.departmentId) !== scope.departmentId || previous.personId !== personId || previous.employeeId !== (employee?.id || null)) throw new FleetControlError("Preserve identidade e vínculo de origem do motorista.");
  }
  const values = { personId, employeeId: employee?.id || null, departmentId: input.departmentId, outsourced: input.outsourced, cnhNumber: input.cnhNumber, cnhCategories: [...new Set(input.cnhCategories)], cnhExpiresAt: dateOnly(input.cnhExpiresAt), active: input.active, suspensionUntil: input.suspensionUntil ? dateOnly(input.suspensionUntil) : null, pointLimit: input.pointLimit, pointWindowMonths: input.pointWindowMonths, policyReference: input.policyReference };
  const driver = previous ? await tx.fleetDriver.update({ where: { id: previous.id }, data: values }) : await tx.fleetDriver.create({ data: { ...values, createdById: scope.actorId } });
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
  const previous = await tx.fleetCatalogVersion.findUnique({ where: { kind_reference_sha256: { kind: input.kind, reference: input.reference, sha256: hash } } });
  if (previous) return { id: previous.id, type: "CATALOG" };
  const version = await tx.fleetCatalogVersion.create({ data: { kind: input.kind, reference: input.reference, sourceReference: input.sourceReference, sha256: hash, complete: input.complete, published: true, createdById: scope.actorId, entries: { create: input.entries.map((entry) => ({ code: entry.code, name: entry.name, details: entry.details as Prisma.InputJsonValue })) } } });
  return { id: version.id, type: "CATALOG" };
}
