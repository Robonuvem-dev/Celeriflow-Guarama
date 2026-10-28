import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { municipalCostAllocations, municipalCostItems, municipalCostObjectItems, municipalCostObjects, municipalCostRules, municipalCostSources } from "../../schema/finance-costs";
import type { MunicipalCostItem, MunicipalCostObject, MunicipalCostRule } from "@/lib/contracts/finance-costs";

export async function findCostObject(db: DatabaseExecutor, id: string): Promise<MunicipalCostObject | null> {
  return (await db.select().from(municipalCostObjects).where(eq(municipalCostObjects.id, id)))[0] ?? null;
}
export async function listCostObjects(db: DatabaseExecutor, filter: { financialYearId?: string; ids?: string[]; activeOnly?: boolean; parentId?: string | null }): Promise<MunicipalCostObject[]> {
  return db.select().from(municipalCostObjects).where(and(filter.financialYearId ? eq(municipalCostObjects.financialYearId, filter.financialYearId) : undefined, filter.ids ? inArray(municipalCostObjects.id, filter.ids) : undefined, filter.activeOnly ? eq(municipalCostObjects.isActive, true) : undefined, filter.parentId === null ? isNull(municipalCostObjects.parentId) : filter.parentId === undefined ? undefined : eq(municipalCostObjects.parentId, filter.parentId)));
}
export async function findCostObjectBySource(db: DatabaseExecutor, financialYearId: string, sourceKey: string): Promise<MunicipalCostObject | null> {
  return (await db.select().from(municipalCostObjects).where(and(eq(municipalCostObjects.financialYearId, financialYearId), eq(municipalCostObjects.sourceKey, sourceKey))))[0] ?? null;
}
export async function insertCostObject(tx: DatabaseTransaction, data: typeof municipalCostObjects.$inferInsert): Promise<MunicipalCostObject> {
  return (await tx.insert(municipalCostObjects).values(data).returning())[0];
}
export async function deleteCostObject(tx: DatabaseTransaction, id: string): Promise<void> {
  await tx.delete(municipalCostObjects).where(eq(municipalCostObjects.id, id));
}
export async function hasCostObjectHistory(db: DatabaseExecutor, ids: string[]): Promise<boolean> {
  const [links, allocations] = await Promise.all([db.select({ id: municipalCostObjectItems.id }).from(municipalCostObjectItems).where(inArray(municipalCostObjectItems.objectId, ids)).limit(1), db.select({ id: municipalCostAllocations.id }).from(municipalCostAllocations).where(inArray(municipalCostAllocations.objectId, ids)).limit(1)]);
  return links.length > 0 || allocations.length > 0;
}
export async function listCostCatalogRules(db: DatabaseExecutor, financialYearId: string): Promise<MunicipalCostRule[]> {
  return db.select().from(municipalCostRules).where(eq(municipalCostRules.financialYearId, financialYearId));
}
export async function listCostCatalogItems(db: DatabaseExecutor, filter: { ids?: string[]; financialYearId?: string; activeOnly?: boolean }): Promise<MunicipalCostItem[]> {
  return db.select().from(municipalCostItems).where(and(filter.ids ? inArray(municipalCostItems.id, filter.ids) : undefined, filter.financialYearId ? eq(municipalCostItems.financialYearId, filter.financialYearId) : undefined, filter.activeOnly ? eq(municipalCostItems.isActive, true) : undefined));
}
export async function findCostItemByIdentifier(db: DatabaseExecutor, financialYearId: string, identifier: string): Promise<MunicipalCostItem | null> {
  return (await db.select().from(municipalCostItems).where(and(eq(municipalCostItems.financialYearId, financialYearId), eq(municipalCostItems.identifier, identifier))))[0] ?? null;
}
export async function saveCostCatalogItem(tx: DatabaseTransaction, id: string | undefined, data: typeof municipalCostItems.$inferInsert): Promise<MunicipalCostItem> {
  return (id ? await tx.update(municipalCostItems).set(data).where(eq(municipalCostItems.id, id)).returning() : await tx.insert(municipalCostItems).values(data).returning())[0];
}
export async function insertStandardCostItem(tx: DatabaseTransaction, data: typeof municipalCostItems.$inferInsert): Promise<void> {
  await tx.insert(municipalCostItems).values(data).onConflictDoNothing({ target: [municipalCostItems.financialYearId, municipalCostItems.identifier] });
}
export async function linkCostCatalogItem(tx: DatabaseTransaction, objectId: string, itemId: string, copiedFromId?: string): Promise<void> {
  await tx.insert(municipalCostObjectItems).values({ objectId, itemId, copiedFromId }).onConflictDoNothing({ target: [municipalCostObjectItems.objectId, municipalCostObjectItems.itemId] });
}
export async function listCostCatalogRelations(db: DatabaseExecutor, financialYearId: string) {
  const rows = await db.select({ relation: municipalCostObjectItems, object: municipalCostObjects, item: municipalCostItems }).from(municipalCostObjectItems).innerJoin(municipalCostObjects, eq(municipalCostObjects.id, municipalCostObjectItems.objectId)).innerJoin(municipalCostItems, eq(municipalCostItems.id, municipalCostObjectItems.itemId)).where(eq(municipalCostObjects.financialYearId, financialYearId));
  return rows.map(({ relation, object, item }) => ({ ...relation, object, item }));
}
export async function insertCostCatalogRule(tx: DatabaseTransaction, data: typeof municipalCostRules.$inferInsert): Promise<MunicipalCostRule> {
  return (await tx.insert(municipalCostRules).values(data).returning())[0];
}
export async function retireCostCatalogRule(tx: DatabaseTransaction, id: string, reason: string): Promise<MunicipalCostRule> {
  return (await tx.update(municipalCostRules).set({ isActive: false, retiredAt: new Date(), retirementReason: reason }).where(eq(municipalCostRules.id, id)).returning())[0];
}
export async function hasCostSelectorAppropriation(db: DatabaseExecutor, id: string, financialYearId: string, budgetUnitId: string): Promise<boolean> {
  return (await db.execute(sql`SELECT id FROM "BudgetAppropriation" WHERE id=${id} AND "financialYearId"=${financialYearId} AND "budgetUnitId"=${budgetUnitId} LIMIT 1`)).rows.length > 0;
}
export async function hasCostSelectorCenter(db: DatabaseExecutor, id: string, governmentEntityId: string): Promise<boolean> {
  return (await db.execute(sql`SELECT id FROM "CostCenter" WHERE id=${id} AND "governmentEntityId"=${governmentEntityId} AND "isActive"=true LIMIT 1`)).rows.length > 0;
}
export async function hasCostSelectorSubcategory(db: DatabaseExecutor, id: string, categoryId?: string): Promise<boolean> {
  return (await db.execute(sql`SELECT s.id FROM "MaterialSubcategory" s JOIN "MaterialCategory" c ON c.id=s."categoryId" WHERE s.id=${id} AND s."isActive"=true AND c."isActive"=true ${categoryId ? sql`AND s."categoryId"=${categoryId}` : sql``} LIMIT 1`)).rows.length > 0;
}
export async function hasCostSelectorMaterial(db: DatabaseExecutor, id: string, categoryId?: string, subcategoryId?: string): Promise<boolean> {
  return (await db.execute(sql`SELECT id FROM "Material" WHERE id=${id} AND "isActive"=true ${categoryId ? sql`AND "categoryId"=${categoryId}` : sql``} ${subcategoryId ? sql`AND "subcategoryId"=${subcategoryId}` : sql``} LIMIT 1`)).rows.length > 0;
}
export async function hasCostSelectorCategory(db: DatabaseExecutor, id: string): Promise<boolean> {
  return (await db.execute(sql`SELECT id FROM "MaterialCategory" WHERE id=${id} AND "isActive"=true LIMIT 1`)).rows.length > 0;
}
export async function hasCostSelectorWarehouse(db: DatabaseExecutor, id: string, governmentEntityId: string, secretariatId: string, costCenterId?: string): Promise<boolean> {
  return (await db.execute(sql`SELECT w.id FROM "Warehouse" w JOIN "CostCenter" c ON c.id=w."costCenterId" WHERE w.id=${id} AND w."isActive"=true AND c."governmentEntityId"=${governmentEntityId} AND c."secretariatId"=${secretariatId} ${costCenterId ? sql`AND c.id=${costCenterId}` : sql``} LIMIT 1`)).rows.length > 0;
}
export async function hasCostSelectorDepartment(db: DatabaseExecutor, id: string, secretariatId: string): Promise<boolean> {
  return (await db.execute(sql`SELECT id FROM "Department" WHERE id=${id} AND "secretariatId"=${secretariatId} LIMIT 1`)).rows.length > 0;
}
export async function listCostSelectorCenters(db: DatabaseExecutor, governmentEntityId: string, secretariatId: string) {
  return (await db.execute<{ id: string }>(sql`SELECT id FROM "CostCenter" WHERE "governmentEntityId"=${governmentEntityId} AND "secretariatId"=${secretariatId} AND "isActive"=true`)).rows;
}
export async function hasCostSelectorContract(db: DatabaseExecutor, centerIds: string[], selector: Record<string, string>): Promise<boolean> {
  if (!centerIds.length) return false;
  return (await db.execute(sql`SELECT id FROM "HrEmploymentContract" WHERE "costCenterId" IN (${sql.join(centerIds.map(id => sql`${id}`), sql`,`)}) ${selector.employeeId ? sql`AND "employeeId"=${selector.employeeId}` : sql``} ${selector.contractId ? sql`AND id=${selector.contractId}` : sql``} ${selector.workLocation ? sql`AND "workLocation"=${selector.workLocation}` : sql``} LIMIT 1`)).rows.length > 0;
}
export async function hasCapturedCostIdentity(db: DatabaseExecutor, financialYearId: string, budgetUnitId: string, selector: Record<string, string>): Promise<boolean> {
  const [row] = await db.select({ id: municipalCostSources.id }).from(municipalCostSources).where(and(eq(municipalCostSources.financialYearId, financialYearId), eq(municipalCostSources.budgetUnitId, budgetUnitId), eq(municipalCostSources.sourceType, "PAYROLL"), ...Object.entries(selector).filter(([key]) => ["employeeId", "contractId", "workLocation"].includes(key)).map(([key, value]) => sql`${municipalCostSources.snapshot}->'dimensions'->>${key} = ${value}`))).limit(1);
  return !!row;
}
export async function hasCostSelectorRubric(db: DatabaseExecutor, code: string): Promise<boolean> {
  return (await db.execute(sql`SELECT r.id FROM "HrPayrollRubric" r JOIN "HrPayrollRuleSet" s ON s.id=r."ruleSetId" WHERE r.code=${code} AND r.type='PROVENTO' AND r."isActive"=true AND s.scope='PRODUCAO' AND s."isDemo"=false LIMIT 1`)).rows.length > 0;
}
export async function readCostLoa(db: DatabaseExecutor, id: string, year: number) {
  const [instrument] = (await db.execute<{ id: string; code: string; kind: string; governmentEntityId: string; startYear: number }>(sql`SELECT id,code,kind,"governmentEntityId","startYear" FROM "PlanningInstrument" WHERE id=${id}`)).rows;
  if (!instrument) return null;
  const lines = (await db.execute<{ id: string; code: string; budgetUnitId: string; functionCode: string | null; subfunctionCode: string | null; programId: string | null; actionId: string | null; budgetUnit: { secretariatId: string; name: string; secretariat: { name: string } }; program: { name: string } | null; action: { name: string } | null }>(sql`SELECT l.id,l.code,l."budgetUnitId",l."functionCode",l."subfunctionCode",l."programId",l."actionId",jsonb_build_object('secretariatId',u."secretariatId",'name',u.name,'secretariat',jsonb_build_object('name',s.name)) AS "budgetUnit",CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('name',p.name) END AS program,CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('name',a.name) END AS action FROM "PlanningBudgetLine" l JOIN "BudgetUnit" u ON u.id=l."budgetUnitId" JOIN "Secretariat" s ON s.id=u."secretariatId" LEFT JOIN "ProgramPPA" p ON p.id=l."programId" LEFT JOIN "ActionPPA" a ON a.id=l."actionId" WHERE l."instrumentId"=${id} AND l.kind='EXPENSE' AND l.year=${year} ORDER BY l.id ASC`)).rows;
  return { ...instrument, lines };
}
