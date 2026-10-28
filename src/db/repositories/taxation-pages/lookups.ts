import { and, asc, desc, eq, ilike, inArray, ne, or, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { planningEntityUnits } from "@/db/schema/planning-catalog";
import { planningBudgetUnits } from "@/db/schema/planning-budget";
import { governmentEntities } from "@/db/schema/master-data";
import { neighborhoods, streets } from "@/db/schema/localities";
import { realEstates, documents } from "@/db/schema/registry";
import { processes, processSubjects, processTypes } from "@/db/schema/processes";
import { users, accessProfiles } from "@/db/schema/identity";
import { taxes } from "@/db/schema/taxation-core";
import { economicRegistrations } from "@/db/schema/taxation-core";
import { financialYears } from "@/db/schema/finance-years";
import type { EconomicRegistrationRow, FiscalPlanningUnit } from "@/lib/contracts/taxation-pages";
import type { RealEstateRecord } from "@/lib/contracts/registry";

export async function listFiscalPlanningUnits(database: DatabaseExecutor, allowedBudgetUnitIds?: string[], order?: "entity-unit" | "unit"): Promise<FiscalPlanningUnit[]> {
  const query = database.select({ budgetUnitId: planningEntityUnits.budgetUnitId, governmentEntityId: planningEntityUnits.governmentEntityId, governmentEntity: governmentEntities, budgetUnit: planningBudgetUnits })
    .from(planningEntityUnits).innerJoin(governmentEntities, eq(governmentEntities.id, planningEntityUnits.governmentEntityId))
    .innerJoin(planningBudgetUnits, eq(planningBudgetUnits.id, planningEntityUnits.budgetUnitId))
    .where(allowedBudgetUnitIds === undefined ? undefined : inArray(planningEntityUnits.budgetUnitId, allowedBudgetUnitIds)).$dynamic();
  if (order === "entity-unit") query.orderBy(asc(planningEntityUnits.governmentEntityId), asc(planningEntityUnits.budgetUnitId));
  if (order === "unit") query.orderBy(asc(planningEntityUnits.budgetUnitId));
  return query;
}
export async function listFiscalNeighborhoods(database: DatabaseExecutor): Promise<{ id: string; name: string }[]> {
  return database.select({ id: neighborhoods.id, name: neighborhoods.name }).from(neighborhoods).orderBy(asc(neighborhoods.name));
}
export async function listFiscalStreets(database: DatabaseExecutor): Promise<{ id: string; name: string }[]> {
  return database.select({ id: streets.id, name: streets.name }).from(streets).orderBy(asc(streets.name));
}
export async function listFiscalTaxLabels(database: DatabaseExecutor, order?: "name" | "name-id", active = false): Promise<{ id: string; name: string }[]> {
  const query = database.select({ id: taxes.id, name: taxes.name }).from(taxes).where(active ? eq(taxes.isActive, true) : undefined).$dynamic();
  if (order === "name") query.orderBy(asc(taxes.name));
  if (order === "name-id") query.orderBy(asc(taxes.name), asc(taxes.id));
  return query;
}
export async function listFiscalProperties(database: DatabaseExecutor, selection: { ids?: string[]; taxpayerId?: string; excludeId?: string; landOnly?: boolean; order?: boolean; createdOrder?: boolean; limit?: number; filter?: Record<string, string> } = {}): Promise<RealEstateRecord[]> {
  const predicates: SQL[] = [];
  if (selection.ids) predicates.push(inArray(realEstates.id, selection.ids));
  if (selection.excludeId) predicates.push(ne(realEstates.id, selection.excludeId));
  if (selection.landOnly) predicates.push(eq(realEstates.propertyType, "Terreno"), eq(realEstates.status, "Ativo"));
  if (selection.taxpayerId !== undefined) predicates.push(eq(realEstates.taxpayerId, selection.taxpayerId));
  const filter = selection.filter ?? {};
  if (filter.query?.trim()) predicates.push(or(ilike(realEstates.municipalInsc, `%${filter.query.trim()}%`), ilike(realEstates.registration, `%${filter.query.trim()}%`), ilike(realEstates.streetName, `%${filter.query.trim()}%`))!);
  if (filter.streetId) predicates.push(eq(realEstates.streetId, filter.streetId));
  if (filter.neighborhoodId) predicates.push(eq(realEstates.neighborhoodId, filter.neighborhoodId));
  if (filter.status) predicates.push(eq(realEstates.status, filter.status));
  if (filter.propertyUse) predicates.push(eq(realEstates.propertyUse, filter.propertyUse));
  const query = database.select().from(realEstates).where(and(...predicates)).$dynamic();
  if (selection.order) query.orderBy(asc(realEstates.municipalInsc));
  if (selection.createdOrder) query.orderBy(desc(realEstates.createdAt));
  if (selection.limit !== undefined) query.limit(selection.limit);
  return query;
}
export async function listFiscalProcessOptions(database: DatabaseExecutor, limit = 200, excludeArchived = false): Promise<{ id: string; protocolNumber: string; status: string }[]> {
  return database.select({ id: processes.id, protocolNumber: processes.protocolNumber, status: processes.status }).from(processes).where(excludeArchived ? ne(processes.status, "Arquivado") : undefined).orderBy(desc(processes.createdAt)).limit(limit);
}
export async function listFiscalDocumentOptions(database: DatabaseExecutor, limit = 200, order = false): Promise<{ id: string; title: string }[]> {
  const query = database.select({ id: documents.id, title: documents.title }).from(documents).where(eq(documents.status, "Válido")).limit(limit).$dynamic();
  if (order) query.orderBy(desc(documents.createdAt));
  return query;
}
export async function listFiscalActorNames(database: DatabaseExecutor, ids: string[]): Promise<{ id: string; nome: string }[]> {
  return database.select({ id: users.id, nome: users.nome }).from(users).where(inArray(users.id, ids));
}
export async function listFiscalActiveUsers(database: DatabaseExecutor): Promise<{ id: string; nome: string; email: string }[]> {
  return database.select({ id: users.id, nome: users.nome, email: users.email }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.ativo, true), eq(accessProfiles.ativo, true))).orderBy(asc(users.nome));
}
export async function listFiscalYears(database: DatabaseExecutor, governmentEntityId: string): Promise<{ id: string; year: number; status: string }[]> {
  return database.select({ id: financialYears.id, year: financialYears.year, status: financialYears.status }).from(financialYears).where(eq(financialYears.governmentEntityId, governmentEntityId)).orderBy(desc(financialYears.year));
}
export async function listFiscalRegistrations(database: DatabaseExecutor, selection: { ids?: string[]; taxpayerId?: string; active?: boolean; order?: boolean; limit?: number } = {}): Promise<EconomicRegistrationRow[]> {
  const query = database.select().from(economicRegistrations).where(and(selection.ids ? inArray(economicRegistrations.id, selection.ids) : undefined, selection.taxpayerId !== undefined ? eq(economicRegistrations.taxpayerId, selection.taxpayerId) : undefined, selection.active ? eq(economicRegistrations.status, "Ativo") : undefined)).$dynamic();
  if (selection.order) query.orderBy(asc(economicRegistrations.municipalInsc));
  if (selection.limit !== undefined) query.limit(selection.limit);
  return query;
}
export async function listFiscalSubjectOptions(database: DatabaseExecutor): Promise<{ id: string; name: string; processTypeId: string; processType: { name: string } }[]> {
  return database.select({ id: processSubjects.id, name: processSubjects.name, processTypeId: processSubjects.processTypeId, processType: { name: processTypes.name } }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId)).where(and(eq(processSubjects.isActive, true), eq(processTypes.isActive, true))).orderBy(asc(processSubjects.name));
}
