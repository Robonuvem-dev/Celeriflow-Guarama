import { and, eq, gte, inArray, isNull, lte, ne, sql, sum } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import { fleetAttachments, fleetDrivers, fleetFines, fleetSequences } from "@/db/schema/fleet";
import { people } from "@/db/schema/people";
import { employees } from "@/db/schema/administration";
import { documentVersions } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { readFleetUnit, requiredFleetRecord } from "@/db/repositories/fleet/records";
import type { FleetScope } from "./service";
import { readingError, type FleetMeter } from "./control-policy";

export class FleetControlError extends Error {}
export type FleetControlTx = DatabaseExecutor;
export async function lockFleetResources(tx: FleetControlTx, keys: string[]) {
  for (const key of [...new Set(keys)].sort()) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`FLEET_CONTROL:${key}`}))`);
}
export async function scopedFleetUnit(tx: FleetControlTx, scope: FleetScope, id: string, available = true) {
  const unit = await readFleetUnit(tx, scope, id);
  if (!unit || !unit.departmentId) throw new FleetControlError("Unidade não encontrada ou fora do setor atual.");
  if (available && (unit.status !== "ATIVO" || unit.operationalStatus !== "ATIVO" || ["Baixado", "Inativo", "Em manutenção"].includes(unit.asset?.status || ""))) throw new FleetControlError("A unidade está inativa, baixada ou em manutenção.");
  return unit;
}
export async function scopedFleetDriver(tx: FleetControlTx, scope: FleetScope, id: string, departmentId?: string) {
  const [driver] = await tx.select().from(fleetDrivers).where(eq(fleetDrivers.id, id)).limit(1);
  if (!driver) throw new FleetControlError("Motorista não encontrado.");
  const [person] = await tx.select({ fullName: people.fullName, cpf: people.cpf, status: people.status }).from(people).where(eq(people.id, driver.personId)).limit(1);
  const employee = driver.employeeId ? (await tx.select({ id: employees.id, name: employees.name, isActive: employees.isActive, departmentId: employees.departmentId, personId: employees.personId }).from(employees).where(eq(employees.id, driver.employeeId)).limit(1))[0] ?? null : null;
  const currentDepartment = employee?.departmentId || driver.departmentId;
  if (!person || (!scope.administrator && currentDepartment !== scope.departmentId) || (departmentId && currentDepartment !== departmentId)) throw new FleetControlError("Motorista fora da repartição autorizada.");
  return { ...driver, person, employee, currentDepartment };
}
export async function eligibleFleetDriver(tx: FleetControlTx, scope: FleetScope, driverId: string, unit: { departmentId: string | null; control: { allowedLicenseCategories: JsonValue } | null }, on = new Date()) {
  const driver = await scopedFleetDriver(tx, scope, driverId, unit.departmentId || undefined);
  if (!driver.active || driver.person.status !== "Ativo" || (driver.employeeId && (!driver.employee?.isActive || driver.employee.personId !== driver.personId))) throw new FleetControlError("Motorista ou vínculo de origem inativo/divergente.");
  const day = new Date(on.toISOString().slice(0, 10) + "T00:00:00Z");
  if (!driver.cnhNumber || driver.cnhExpiresAt < day) throw new FleetControlError("CNH ausente ou vencida.");
  if (driver.suspensionUntil && driver.suspensionUntil >= day) throw new FleetControlError("Motorista com suspensão vigente.");
  const allowed = unit.control?.allowedLicenseCategories;
  if (!Array.isArray(allowed) || !allowed.length) throw new FleetControlError("Configure as categorias de CNH admitidas para esta unidade.");
  if (!Array.isArray(driver.cnhCategories) || !driver.cnhCategories.some((category) => allowed.includes(category))) throw new FleetControlError("Categoria de CNH incompatível com a unidade.");
  const from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - driver.pointWindowMonths, day.getUTCDate()));
  const [points] = await tx.select({ total: sum(fleetFines.points) }).from(fleetFines).where(and(eq(fleetFines.driverId, driverId), ne(fleetFines.status, "CANCELADA"), gte(fleetFines.occurredAt, from), lte(fleetFines.occurredAt, day)));
  if (Number(points.total || 0) >= driver.pointLimit) throw new FleetControlError(`Pontuação atingiu o limite ${driver.pointLimit} configurado na política da CNH.`);
  return driver;
}
export function fleetControlReading(unit: { control: { meterType: string; currentReading: Decimal | null } | null }, value: string) {
  const meter = (unit.control?.meterType || "HODOMETRO") as FleetMeter;
  const error = readingError(meter, unit.control?.currentReading?.toString() || null, value || null);
  if (error) throw new FleetControlError(error);
  return value ? new Decimal(value) : null;
}
export async function scopedFleetEvidence(tx: FleetControlTx, scope: FleetScope, versionId: string, unitId?: string) {
  const [attachment] = await tx.select().from(fleetAttachments).where(and(eq(fleetAttachments.versionId, versionId), isNull(fleetAttachments.withdrawnAt), unitId ? eq(fleetAttachments.unitId, unitId) : undefined)).limit(1);
  if (!attachment) throw new FleetControlError("Vincule um anexo de Frota válido como evidência.");
  await scopedFleetUnit(tx, scope, attachment.unitId, false);
  const [version] = await tx.select({ id: documentVersions.id, hashSha256: documentVersions.hashSha256, documentId: documentVersions.documentId }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).where(and(eq(documentVersions.id, versionId), inArray(documentVersions.status, ["FINAL", "SIGNED"]), inArray(documents.status, ["Válido", "Assinado"]))).limit(1);
  if (!version) throw new FleetControlError("A versão da evidência foi retirada, substituída ou invalidada.");
  return version;
}
export async function nextFleetCode(tx: FleetControlTx, kind: string) {
  const year = new Date().getUTCFullYear();
  const sequence = requiredFleetRecord(await tx.insert(fleetSequences).values({ year, kind, nextNumber: 2 }).onConflictDoUpdate({ target: [fleetSequences.year, fleetSequences.kind], set: { nextNumber: sql`${fleetSequences.nextNumber} + 1` } }).returning({ nextNumber: fleetSequences.nextNumber }));
  return `${kind}-${year}-${String(sequence.nextNumber - 1).padStart(6, "0")}`;
}
export function assertFleetVersion(actual: Date, expected: string) { if (!expected || actual.toISOString() !== expected) throw new FleetControlError("Cadastro alterado por outra sessão. Atualize antes de salvar."); }
