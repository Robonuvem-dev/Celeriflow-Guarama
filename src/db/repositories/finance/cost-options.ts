import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";

export async function listCostOptionUnits(db: DatabaseExecutor, governmentEntityId: string, allowedBudgetUnitIds?: string[]) {
  return (await db.execute<{ budgetUnitId: string; budgetUnit: { secretariatId: string } }>(sql`SELECT b."budgetUnitId",jsonb_build_object('secretariatId',u."secretariatId") AS "budgetUnit" FROM "PlanningEntityUnit" b JOIN "BudgetUnit" u ON u.id=b."budgetUnitId" WHERE b."governmentEntityId"=${governmentEntityId} ${allowedBudgetUnitIds ? allowedBudgetUnitIds.length ? sql`AND b."budgetUnitId" IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${id}`), sql`,`)})` : sql`AND false` : sql``}`)).rows;
}
export async function listCostOptionCenters(db: DatabaseExecutor, governmentEntityId: string, secretariatIds: string[]) {
  if (!secretariatIds.length) return [];
  return (await db.execute<{ id: string; name: string; secretariatId: string }>(sql`SELECT id,name,"secretariatId" FROM "CostCenter" WHERE "isActive"=true AND "governmentEntityId"=${governmentEntityId} AND "secretariatId" IN (${sql.join(secretariatIds.map(id => sql`${id}`), sql`,`)}) ORDER BY name ASC`)).rows;
}
export async function listCostOptionContracts(db: DatabaseExecutor, centerIds: string[]) {
  if (!centerIds.length) return [];
  return (await db.execute<{ id: string; employeeId: string; registration: string; workLocation: string; costCenterId: string | null; employee: { name: string } }>(sql`SELECT c.id,c."employeeId",c.registration,c."workLocation",c."costCenterId",jsonb_build_object('name',e.name) AS employee FROM "HrEmploymentContract" c JOIN "Employee" e ON e.id=c."employeeId" WHERE c."costCenterId" IN (${sql.join(centerIds.map(id => sql`${id}`), sql`,`)}) ORDER BY c.registration ASC`)).rows;
}
export async function listCostOptionRubrics(db: DatabaseExecutor) {
  return (await db.execute<{ code: string; name: string }>(sql`SELECT r.code,r.name FROM "HrPayrollRubric" r JOIN "HrPayrollRuleSet" s ON s.id=r."ruleSetId" WHERE r.type='PROVENTO' AND r."isActive"=true AND s.scope='PRODUCAO' AND s."isDemo"=false ORDER BY r.code ASC,r.id ASC`)).rows;
}
export async function listCostOptionMaterials(db: DatabaseExecutor) {
  return (await db.execute<{ id: string; code: string; name: string; categoryId: string; subcategoryId: string | null }>(sql`SELECT id,code,name,"categoryId","subcategoryId" FROM "Material" WHERE "isActive"=true AND type='MATERIAL' ORDER BY name ASC`)).rows;
}
export async function listCostOptionCategories(db: DatabaseExecutor) {
  return (await db.execute<{ id: string; code: string; name: string }>(sql`SELECT id,code,name FROM "MaterialCategory" WHERE "isActive"=true ORDER BY code ASC`)).rows;
}
export async function listCostOptionSubcategories(db: DatabaseExecutor) {
  return (await db.execute<{ id: string; categoryId: string; code: string; name: string }>(sql`SELECT s.id,s."categoryId",s.code,s.name FROM "MaterialSubcategory" s JOIN "MaterialCategory" c ON c.id=s."categoryId" WHERE s."isActive"=true AND c."isActive"=true ORDER BY s."categoryId" ASC,s.code ASC`)).rows;
}
export async function listCostOptionWarehouses(db: DatabaseExecutor, governmentEntityId: string, secretariatIds: string[]) {
  if (!secretariatIds.length) return [];
  return (await db.execute<{ id: string; name: string; costCenterId: string | null; costCenter: { secretariatId: string } | null }>(sql`SELECT w.id,w.name,w."costCenterId",jsonb_build_object('secretariatId',c."secretariatId") AS "costCenter" FROM "Warehouse" w JOIN "CostCenter" c ON c.id=w."costCenterId" WHERE w."isActive"=true AND c."governmentEntityId"=${governmentEntityId} AND c."secretariatId" IN (${sql.join(secretariatIds.map(id => sql`${id}`), sql`,`)}) ORDER BY w.name ASC`)).rows;
}
export async function listCostOptionDepartments(db: DatabaseExecutor, secretariatIds: string[]) {
  if (!secretariatIds.length) return [];
  return (await db.execute<{ id: string; name: string; secretariatId: string }>(sql`SELECT id,name,"secretariatId" FROM "Department" WHERE "secretariatId" IN (${sql.join(secretariatIds.map(id => sql`${id}`), sql`,`)}) ORDER BY name ASC`)).rows;
}
export async function listCostOptionLoas(db: DatabaseExecutor, governmentEntityId: string, year: number) {
  return (await db.execute<{ id: string; title: string }>(sql`SELECT id,title FROM "PlanningInstrument" WHERE "governmentEntityId"=${governmentEntityId} AND kind='LOA' AND "startYear"=${year}`)).rows;
}
export async function listCostOptionAppropriations(db: DatabaseExecutor, financialYearId: string, allowedBudgetUnitIds?: string[]) {
  return (await db.execute<{ id: string; code: string; budgetUnitId: string }>(sql`SELECT id,code,"budgetUnitId" FROM "BudgetAppropriation" WHERE "financialYearId"=${financialYearId} ${allowedBudgetUnitIds ? allowedBudgetUnitIds.length ? sql`AND "budgetUnitId" IN (${sql.join(allowedBudgetUnitIds.map(id => sql`${id}`), sql`,`)})` : sql`AND false` : sql``} ORDER BY code ASC`)).rows;
}
