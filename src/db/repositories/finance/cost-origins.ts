import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "../../decimal";
import { databaseTimestamp } from "@/db/temporal";
import type { DatabaseExecutor } from "../../transaction";
import { municipalCostSources } from "../../schema/finance-costs";
import { hrIntegrationEvents, hrPayrollRuns, hrPayrollStatements, hrRightEntries } from "../../schema/personnel-workforce";
import type { MunicipalCostSource } from "@/lib/contracts/finance-costs";

export type CostSettlement = {
  id: string; date: Date; status: string; valueDecimal: Decimal | null; executionFinancialYearId: string | null; commitmentId: string; documentId: string | null;
  commitment: { contractId: string | null; purchaseReceiptId: string | null; appropriation: { id: string; financialYearId: string; budgetUnitId: string; expenseNature: { code: string }; financialYear: { governmentEntityId: string | null } }; reservation: { expense: { id: string; supplierId: string | null; secretariatId: string; sourceModule: string; sourceType: string; sourceId: string | null; valueDecimal: Decimal | null } | null } | null };
};

/** Numeric columns cross the raw SQL boundary as text, including values frozen by RH. */
export async function readCostSettlement(db: DatabaseExecutor, id: string): Promise<CostSettlement> {
  const [row] = (await db.execute<{ id: string; date: Date | string; status: string; valueDecimal: string | null; executionFinancialYearId: string | null; commitmentId: string; documentId: string | null; contractId: string | null; purchaseReceiptId: string | null; appropriationId: string; financialYearId: string; budgetUnitId: string; natureCode: string; governmentEntityId: string | null; reservationId: string | null; expenseId: string | null; supplierId: string | null; secretariatId: string; sourceModule: string; sourceType: string; sourceId: string | null; expenseValueDecimal: string | null }>(sql`
    SELECT s.id,s.date,s.status,s."valueDecimal"::text,s."executionFinancialYearId",s."commitmentId",s."documentId",c."contractId",c."purchaseReceiptId",
      a.id AS "appropriationId",a."financialYearId",a."budgetUnitId",n.code AS "natureCode",y."governmentEntityId",r.id AS "reservationId",
      e.id AS "expenseId",e."supplierId",e."secretariatId",e."sourceModule",e."sourceType",e."sourceId",e."valueDecimal"::text AS "expenseValueDecimal"
    FROM "Settlement" s JOIN "Commitment" c ON c.id=s."commitmentId" JOIN "BudgetAppropriation" a ON a.id=c."appropriationId"
    JOIN "FinancialYear" y ON y.id=a."financialYearId" JOIN "ExpenseNature" n ON n.id=a."expenseNatureId"
    LEFT JOIN "BudgetReservation" r ON r.id=c."reservationId" LEFT JOIN "Expense" e ON e.id=r."expenseId" WHERE s.id=${id}`)).rows;
  if (!row) throw new Error("Liquidação de origem de custos não encontrada.");
  return { id: row.id, date: databaseTimestamp(row.date), status: row.status, valueDecimal: row.valueDecimal === null ? null : new Decimal(row.valueDecimal), executionFinancialYearId: row.executionFinancialYearId, commitmentId: row.commitmentId, documentId: row.documentId,
    commitment: { contractId: row.contractId, purchaseReceiptId: row.purchaseReceiptId, appropriation: { id: row.appropriationId, financialYearId: row.financialYearId, budgetUnitId: row.budgetUnitId, expenseNature: { code: row.natureCode }, financialYear: { governmentEntityId: row.governmentEntityId } }, reservation: row.reservationId ? { expense: row.expenseId ? { id: row.expenseId, supplierId: row.supplierId, secretariatId: row.secretariatId, sourceModule: row.sourceModule, sourceType: row.sourceType, sourceId: row.sourceId, valueDecimal: row.expenseValueDecimal === null ? null : new Decimal(row.expenseValueDecimal) } : null } : null } };
}

export async function listCostSourcesByEvidence(db: DatabaseExecutor, sourceTypes: string[], key: "settlementId" | "transactionId", id: string, activeOnly = false): Promise<MunicipalCostSource[]> {
  return db.select().from(municipalCostSources).where(and(inArray(municipalCostSources.sourceType, sourceTypes), sql`${municipalCostSources.snapshot}->'evidence'->>${key} = ${id}`, activeOnly ? eq(municipalCostSources.status, "ACTIVE") : undefined)).orderBy(asc(municipalCostSources.id));
}
export async function hasActiveSettlementCost(db: DatabaseExecutor, settlementId: string): Promise<boolean> {
  const [row] = await db.select({ id: municipalCostSources.id }).from(municipalCostSources).where(and(eq(municipalCostSources.sourceId, settlementId), inArray(municipalCostSources.sourceType, ["SETTLEMENT", "PAYROLL"]), eq(municipalCostSources.status, "ACTIVE"))).limit(1);
  return !!row;
}
export async function hasActiveCostUserBinding(db: DatabaseExecutor, usuarioId: string, budgetUnitId: string): Promise<boolean> {
  return (await db.execute(sql`SELECT u.id FROM "Usuario" u JOIN "UsuarioUnidadeGestora" b ON b."usuarioId"=u.id WHERE u.id=${usuarioId} AND u.ativo=true AND b."budgetUnitId"=${budgetUnitId} LIMIT 1`)).rows.length > 0;
}
export async function readCostUnitSecretariat(db: DatabaseExecutor, id: string): Promise<string> {
  const [row] = (await db.execute<{ secretariatId: string }>(sql`SELECT "secretariatId" FROM "BudgetUnit" WHERE id=${id}`)).rows;
  if (!row) throw new Error("Unidade gestora de custos não encontrada.");
  return row.secretariatId;
}
export async function hasCostCenterScope(db: DatabaseExecutor, id: string, governmentEntityId: string, secretariatId: string): Promise<boolean> {
  return (await db.execute(sql`SELECT id FROM "CostCenter" WHERE id=${id} AND "governmentEntityId"=${governmentEntityId} AND "secretariatId"=${secretariatId} LIMIT 1`)).rows.length > 0;
}
export async function readCostMaterial(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ type: string; categoryId: string; category: { code: string; name: string }; subcategoryId: string | null; subcategory: { code: string; name: string } | null }>(sql`SELECT m.type,m."categoryId",jsonb_build_object('code',c.code,'name',c.name) AS category,m."subcategoryId",CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('code',s.code,'name',s.name) END AS subcategory FROM "Material" m JOIN "MaterialCategory" c ON c.id=m."categoryId" LEFT JOIN "MaterialSubcategory" s ON s.id=m."subcategoryId" WHERE m.id=${id}`)).rows;
  if (!row) throw new Error("Material da origem de custos não encontrado.");
  return row;
}
export async function hasCostReceiptStock(db: DatabaseExecutor, receiptId: string, materialId: string, warehouseId: string, stockId: string): Promise<boolean> {
  return (await db.execute(sql`SELECT i.id FROM "PurchaseReceiptItem" i JOIN "MaterialMovement" m ON m.id=i."stockMovementId" WHERE i."purchaseReceiptId"=${receiptId} AND i."materialId"=${materialId} AND i."warehouseId"=${warehouseId} AND m."stockId"=${stockId} LIMIT 1`)).rows.length > 0;
}
export async function readCostWarehouse(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ costCenter: { id: string; governmentEntityId: string | null; secretariatId: string } | null }>(sql`SELECT CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'governmentEntityId',c."governmentEntityId",'secretariatId',c."secretariatId") END AS "costCenter" FROM "Warehouse" w LEFT JOIN "CostCenter" c ON c.id=w."costCenterId" WHERE w.id=${id}`)).rows;
  if (!row) throw new Error("Almoxarifado de custos não encontrado.");
  return row;
}
export async function readCostDepartment(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ secretariatId: string }>(sql`SELECT "secretariatId" FROM "Department" WHERE id=${id}`)).rows;
  if (!row) throw new Error("Destino do consumo não encontrado.");
  return row;
}
export async function readCostStockValuation(db: DatabaseExecutor, stockId: string, movementId: string) {
  const [stock] = (await db.execute<{ valuationEnabled: boolean }>(sql`SELECT "valuationEnabled" FROM "MaterialStock" WHERE id=${stockId}`)).rows;
  if (!stock?.valuationEnabled) return { valuationEnabled: false, event: null };
  const [row] = (await db.execute<{ id: string; hash: string; amountDelta: string; budgetUnitId: string; method: string }>(sql`SELECT e.id,e.hash,e."amountDelta"::text,v."budgetUnitId",v.method FROM "MaterialStockValuationEvent" e JOIN "MaterialStockValuation" v ON v.id=e."valuationId" WHERE e."movementId"=${movementId}`)).rows;
  return { valuationEnabled: true, event: row ? { ...row, amountDelta: new Decimal(row.amountDelta), valuation: { budgetUnitId: row.budgetUnitId, method: row.method } } : null };
}
export async function listCostMaterialReturns(db: DatabaseExecutor, id: string) {
  const rows = (await db.execute<{ id: string; quantityDecimal: string | null }>(sql`SELECT id,"quantityDecimal"::text FROM "MaterialMovement" WHERE "returnedMovementId"=${id} AND operation='RETURN'`)).rows;
  return rows.map(row => ({ ...row, quantityDecimal: row.quantityDecimal === null ? null : new Decimal(row.quantityDecimal) }));
}
export async function readCostRightEntry(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(hrRightEntries).where(eq(hrRightEntries.id, id));
  if (!row) throw new Error("Registro de provisão de custos não encontrado.");
  return row;
}
export async function readCostPayrollStatement(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(hrPayrollStatements).where(eq(hrPayrollStatements.id, id));
  if (!row) throw new Error("Demonstrativo de custos não encontrado.");
  return row;
}
export async function readCostPayrollRun(db: DatabaseExecutor, id: string) {
  const [row] = await db.select().from(hrPayrollRuns).where(eq(hrPayrollRuns.id, id));
  if (!row) throw new Error("Folha de origem de custos não encontrada.");
  return row;
}
export async function listCostPayrollStatements(db: DatabaseExecutor, runId: string) {
  return db.select().from(hrPayrollStatements).where(eq(hrPayrollStatements.runId, runId)).orderBy(asc(hrPayrollStatements.id));
}
export async function findCostPayrollIntegration(db: DatabaseExecutor, sourceKey: string) {
  const [row] = await db.select().from(hrIntegrationEvents).where(eq(hrIntegrationEvents.sourceKey, sourceKey));
  return row ?? null;
}
