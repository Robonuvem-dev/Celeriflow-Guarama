import { Prisma } from "@prisma/client";
import type { FleetScope } from "./service";
import { readingError, type FleetMeter } from "./control-policy";

export class FleetControlError extends Error {}
export type FleetControlTx = Prisma.TransactionClient;
export async function lockFleetResources(tx: FleetControlTx, keys: string[]) {
  for (const key of [...new Set(keys)].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`FLEET_CONTROL:${key}`}))`;
}
export async function scopedFleetUnit(tx: FleetControlTx, scope: FleetScope, id: string, available = true) {
  const unit = await tx.fleetUnit.findFirst({ where: { id, ...(scope.administrator ? {} : { departmentId: scope.departmentId }) }, include: { control: true, asset: { select: { status: true, acquisitionDate: true, departmentId: true, responsibleId: true } } } });
  if (!unit || !unit.departmentId) throw new FleetControlError("Unidade não encontrada ou fora do setor atual.");
  if (available && (unit.status !== "ATIVO" || unit.operationalStatus !== "ATIVO" || ["Baixado", "Inativo", "Em manutenção"].includes(unit.asset?.status || ""))) throw new FleetControlError("A unidade está inativa, baixada ou em manutenção.");
  return unit;
}
export async function scopedFleetDriver(tx: FleetControlTx, scope: FleetScope, id: string, departmentId?: string) {
  const driver = await tx.fleetDriver.findUnique({ where: { id } });
  if (!driver) throw new FleetControlError("Motorista não encontrado.");
  const person = await tx.person.findUnique({ where: { id: driver.personId }, select: { fullName: true, cpf: true, status: true } });
  const employee = driver.employeeId ? await tx.employee.findUnique({ where: { id: driver.employeeId }, select: { id: true, name: true, isActive: true, departmentId: true, personId: true } }) : null;
  const currentDepartment = employee?.departmentId || driver.departmentId;
  if (!person || (!scope.administrator && currentDepartment !== scope.departmentId) || (departmentId && currentDepartment !== departmentId)) throw new FleetControlError("Motorista fora da repartição autorizada.");
  return { ...driver, person, employee, currentDepartment };
}
export async function eligibleFleetDriver(tx: FleetControlTx, scope: FleetScope, driverId: string, unit: { departmentId: string | null; control: { allowedLicenseCategories: Prisma.JsonValue } | null }, on = new Date()) {
  const driver = await scopedFleetDriver(tx, scope, driverId, unit.departmentId || undefined);
  if (!driver.active || driver.person.status !== "Ativo" || (driver.employeeId && (!driver.employee?.isActive || driver.employee.personId !== driver.personId))) throw new FleetControlError("Motorista ou vínculo de origem inativo/divergente.");
  const day = new Date(on.toISOString().slice(0, 10) + "T00:00:00Z");
  if (!driver.cnhNumber || driver.cnhExpiresAt < day) throw new FleetControlError("CNH ausente ou vencida.");
  if (driver.suspensionUntil && driver.suspensionUntil >= day) throw new FleetControlError("Motorista com suspensão vigente.");
  const allowed = unit.control?.allowedLicenseCategories;
  if (!Array.isArray(allowed) || !allowed.length) throw new FleetControlError("Configure as categorias de CNH admitidas para esta unidade.");
  if (!Array.isArray(driver.cnhCategories) || !driver.cnhCategories.some((category) => allowed.includes(category))) throw new FleetControlError("Categoria de CNH incompatível com a unidade.");
  const from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - driver.pointWindowMonths, day.getUTCDate()));
  const points = await tx.fleetFine.aggregate({ where: { driverId, status: { not: "CANCELADA" }, occurredAt: { gte: from, lte: day } }, _sum: { points: true } });
  if ((points._sum.points || 0) >= driver.pointLimit) throw new FleetControlError(`Pontuação atingiu o limite ${driver.pointLimit} configurado na política da CNH.`);
  return driver;
}
export function fleetControlReading(unit: { control: { meterType: string; currentReading: Prisma.Decimal | null } | null }, value: string) {
  const meter = (unit.control?.meterType || "HODOMETRO") as FleetMeter;
  const error = readingError(meter, unit.control?.currentReading?.toString() || null, value || null);
  if (error) throw new FleetControlError(error);
  return value ? new Prisma.Decimal(value) : null;
}
export async function scopedFleetEvidence(tx: FleetControlTx, scope: FleetScope, versionId: string, unitId?: string) {
  const attachment = await tx.fleetAttachment.findFirst({ where: { versionId, withdrawnAt: null, ...(unitId ? { unitId } : {}) } });
  if (!attachment) throw new FleetControlError("Vincule um anexo de Frota válido como evidência.");
  await scopedFleetUnit(tx, scope, attachment.unitId, false);
  const version = await tx.documentVersion.findFirst({ where: { id: versionId, status: { in: ["FINAL", "SIGNED"] }, document: { status: { in: ["Válido", "Assinado"] } } }, select: { id: true, hashSha256: true, documentId: true } });
  if (!version) throw new FleetControlError("A versão da evidência foi retirada, substituída ou invalidada.");
  return version;
}
export async function nextFleetCode(tx: FleetControlTx, kind: string) {
  const year = new Date().getUTCFullYear();
  const sequence = await tx.fleetSequence.upsert({ where: { year_kind: { year, kind } }, create: { year, kind, nextNumber: 2 }, update: { nextNumber: { increment: 1 } }, select: { nextNumber: true } });
  return `${kind}-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
}
export function assertFleetVersion(actual: Date, expected: string) { if (!expected || actual.toISOString() !== expected) throw new FleetControlError("Cadastro alterado por outra sessão. Atualize antes de salvar."); }
