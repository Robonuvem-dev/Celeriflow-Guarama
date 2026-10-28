import { and, count, eq, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { economicRegistrations, taxes } from "@/db/schema/taxation-core";
import { companies, documents, realEstates, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { processes } from "@/db/schema/processes";
import { accessProfiles, users } from "@/db/schema/identity";
import { governmentEntities, healthCbos } from "@/db/schema/master-data";
import { planningEntityUnits, planningBudgetUnitLabels } from "@/db/schema/planning-catalog";
import { pageActivities } from "@/db/schema/taxation-pages";
import { economicPortalAccess } from "@/db/schema/tax-economic";
import type { TaxpayerDetails } from "@/lib/contracts/registry";
import type { EconomicOriginRecord, EconomicRegistrationChange, EconomicRegistrationCreate, EconomicRegistrationDetails, EconomicRegistrationRecord } from "@/lib/contracts/tax-economic";

export async function hasEconomicOrigin(db: DatabaseExecutor, scope: { governmentEntityId: string; budgetUnitId: string }): Promise<boolean> {
  return (await db.select({ id: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(and(eq(planningEntityUnits.governmentEntityId, scope.governmentEntityId), eq(planningEntityUnits.budgetUnitId, scope.budgetUnitId))).limit(1)).length > 0;
}
export async function readEconomicOrigin(db: DatabaseExecutor, governmentEntityId: string, budgetUnitId: string): Promise<EconomicOriginRecord | null> {
  const [row] = await db.select({ governmentEntity: { name: governmentEntities.name }, budgetUnit: { code: planningBudgetUnitLabels.code } }).from(planningEntityUnits).innerJoin(governmentEntities, eq(governmentEntities.id, planningEntityUnits.governmentEntityId)).innerJoin(planningBudgetUnitLabels, eq(planningBudgetUnitLabels.id, planningEntityUnits.budgetUnitId)).where(and(eq(planningEntityUnits.governmentEntityId, governmentEntityId), eq(planningEntityUnits.budgetUnitId, budgetUnitId))).limit(1);
  return row ?? null;
}
export async function listEconomicOriginUnits(db: DatabaseExecutor, governmentEntityId: string, allowed?: string[]): Promise<{ budgetUnitId: string }[]> {
  return db.select({ budgetUnitId: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(and(eq(planningEntityUnits.governmentEntityId, governmentEntityId), allowed === undefined ? undefined : inArray(planningEntityUnits.budgetUnitId, allowed)));
}
export async function readEconomicTaxpayer(db: DatabaseExecutor, id: string, active = false): Promise<TaxpayerDetails | null> {
  const [row] = await db.select({ taxpayer: taxpayers, person: people, company: companies }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(and(eq(taxpayers.id, id), active ? eq(taxpayers.status, "Ativo") : undefined)).limit(1);
  return row ? { ...row.taxpayer, person: row.person, company: row.company } : null;
}
export async function listEconomicTaxpayerNames(db: DatabaseExecutor, ids: string[]): Promise<{ id: string; person: { fullName: string } | null; company: { corporateName: string } | null }[]> {
  return db.select({ id: taxpayers.id, person: { fullName: people.fullName }, company: { corporateName: companies.corporateName } }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(inArray(taxpayers.id, ids));
}
export async function countActiveEconomicTaxpayers(db: DatabaseExecutor, ids: string[]): Promise<number> {
  return (await db.select({ value: count() }).from(taxpayers).where(and(inArray(taxpayers.id, ids), eq(taxpayers.status, "Ativo"))))[0].value;
}
export async function countEconomicProperties(db: DatabaseExecutor, ids: string[]): Promise<number> {
  return (await db.select({ value: count() }).from(realEstates).where(inArray(realEstates.id, ids)))[0].value;
}
export async function countValidEconomicDocuments(db: DatabaseExecutor, ids: string[]): Promise<number> {
  return (await db.select({ value: count() }).from(documents).where(and(inArray(documents.id, ids), eq(documents.status, "Válido"))))[0].value;
}
export async function hasEconomicProcess(db: DatabaseExecutor, id: string): Promise<boolean> {
  return (await db.select({ id: processes.id }).from(processes).where(eq(processes.id, id)).limit(1)).length > 0;
}
export async function lockEconomicRegistration(tx: DatabaseTransaction, id: string): Promise<void> {
  await tx.select({ id: economicRegistrations.id }).from(economicRegistrations).where(eq(economicRegistrations.id, id)).for("update");
}
export async function readEconomicRegistration(db: DatabaseExecutor, id: string): Promise<EconomicRegistrationRecord> {
  const [row] = await db.select().from(economicRegistrations).where(eq(economicRegistrations.id, id)).limit(1);
  if (!row) throw new Error("Inscrição econômica não encontrada.");
  return row;
}
export async function listEconomicRegistrations(db: DatabaseExecutor, ids: string[]): Promise<EconomicRegistrationDetails[]> {
  const rows = await db.select({ registration: economicRegistrations, taxpayer: taxpayers, person: people, company: companies }).from(economicRegistrations).innerJoin(taxpayers, eq(taxpayers.id, economicRegistrations.taxpayerId)).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(inArray(economicRegistrations.id, ids));
  return rows.map(row => ({ ...row.registration, taxpayer: { ...row.taxpayer, person: row.person, company: row.company } }));
}
export async function readEconomicRegistrationDetails(db: DatabaseExecutor, id: string): Promise<EconomicRegistrationDetails> {
  const [row] = await listEconomicRegistrations(db, [id]);
  if (!row) throw new Error("Inscrição econômica não encontrada.");
  return row;
}
export async function insertEconomicRegistration(tx: DatabaseTransaction, input: EconomicRegistrationCreate): Promise<EconomicRegistrationRecord> {
  return (await tx.insert(economicRegistrations).values(input).returning())[0];
}
export async function changeEconomicRegistration(tx: DatabaseTransaction, id: string, input: EconomicRegistrationChange): Promise<EconomicRegistrationRecord> {
  const [row] = await tx.update(economicRegistrations).set({ ...input, updatedAt: new Date() }).where(eq(economicRegistrations.id, id)).returning();
  if (!row) throw new Error("Inscrição econômica não encontrada.");
  return row;
}
export async function countUnscopedEconomicRegistrations(db: DatabaseExecutor, cnae: string, scopedIds: string[]): Promise<number> {
  return (await db.select({ value: count() }).from(economicRegistrations).where(and(eq(economicRegistrations.primaryCnae, cnae), scopedIds.length ? notInArray(economicRegistrations.id, scopedIds) : undefined)))[0].value;
}
export async function readEconomicService(db: DatabaseExecutor, id: string) {
  const [row] = await db.select({ service: pageActivities, tax: { name: taxes.name } }).from(pageActivities).innerJoin(taxes, eq(taxes.id, pageActivities.taxId)).where(and(eq(pageActivities.id, id), eq(pageActivities.isActive, true))).limit(1);
  return row ? { ...row.service, tax: row.tax } : null;
}
export async function listEconomicCbos(db: DatabaseExecutor, codes: string[]): Promise<{ code: string; description: string }[]> {
  return db.select({ code: healthCbos.code, description: healthCbos.description }).from(healthCbos).where(and(inArray(healthCbos.code, codes), eq(healthCbos.isActive, true)));
}
export async function hasActiveLicenseTax(db: DatabaseExecutor, id: string): Promise<boolean> {
  return (await db.select({ id: taxes.id }).from(taxes).where(and(eq(taxes.id, id), eq(taxes.isActive, true))).limit(1)).length > 0;
}
export async function hasActiveEconomicAccount(db: DatabaseExecutor, id: string): Promise<boolean> {
  return (await db.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.id, id), eq(users.ativo, true), eq(accessProfiles.ativo, true))).limit(1)).length > 0;
}
export async function readEconomicPortalGrant(db: DatabaseExecutor, usuarioId: string, taxpayerId: string) {
  const [row] = await db.select({ scopes: economicPortalAccess.scopes }).from(economicPortalAccess).where(and(eq(economicPortalAccess.usuarioId, usuarioId), eq(economicPortalAccess.taxpayerId, taxpayerId), eq(economicPortalAccess.accessType, "TITULAR"), eq(economicPortalAccess.status, "ATIVO"), isNull(economicPortalAccess.revokedAt), lte(economicPortalAccess.grantedAt, new Date()))).limit(1);
  return row ?? null;
}
export async function setEconomicLicenseActor(tx: DatabaseTransaction, usuarioId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('celeriflow.license_actor',${usuarioId},true)`);
}
