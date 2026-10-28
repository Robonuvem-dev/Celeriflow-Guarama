import { sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import type { JsonValue } from "../../json";

export type AccountingOrigin = { sourceModule?: string; sourceType?: string; sourceId?: string; date: Date; governmentEntityId: string; budgetUnitId: string };
export type AppropriationDimensions = { id: string; resourceSourceId: string; expenseNatureId: string; budgetUnitId: string; financialYear: { governmentEntityId: string | null }; programPPA: { id: string; code: string } | null; actionPPA: { id: string; code: string } | null; planningLine: { id: string; functionCode: string | null; subfunctionCode: string | null } | null };
export type PlanningLineDimensions = { id: string; resourceSourceId: string | null; budgetUnitId: string; revenueNatureId: string | null; expenseNatureId: string | null; functionCode: string | null; subfunctionCode: string | null; classificationSnapshot: JsonValue | null; instrument: { governmentEntityId: string }; program: { id: string; code: string } | null; action: { id: string; code: string } | null };

/** Only these canonical paths can assign a financial UG/appropriation. */
function appropriationIdQuery(type: string, id: string): SQL | null {
  if (type === "BUDGET_APPROPRIATION_OPENING") return sql`SELECT id FROM "BudgetAppropriation" WHERE id=${id}`;
  if (["COMMITMENT", "COMMITMENT_REVERSAL"].includes(type)) return sql`SELECT "appropriationId" FROM "Commitment" WHERE id=${id}`;
  if (type === "SETTLEMENT" || type === "PAYMENT" || type === "COMMITMENT_MOVEMENT") {
    const table = { SETTLEMENT: "Settlement", PAYMENT: "Payment", COMMITMENT_MOVEMENT: "CommitmentMovement" }[type];
    return sql`SELECT c."appropriationId" FROM ${sql.identifier(table)} s JOIN "Commitment" c ON c.id=s."commitmentId" WHERE s.id=${id}`;
  }
  if (type === "WITHHOLDING_PAYABLE") return sql`SELECT c."appropriationId" FROM "WithholdingPayable" w JOIN "PaymentRetention" r ON r.id=w."retentionId" JOIN "Payment" p ON p.id=r."paymentId" JOIN "Commitment" c ON c.id=p."commitmentId" WHERE w.id=${id}`;
  return null;
}
export async function findCanonicalRevenueUnit(db: DatabaseExecutor, sourceModule: string, sourceType: string, id: string): Promise<{ budgetUnitId: string | null } | null> {
  const [row] = (await db.execute<{ budgetUnitId: string | null }>(sql`SELECT "budgetUnitId" FROM "Revenue" WHERE id=${id} AND "sourceModule"=${sourceModule} AND "sourceType"=${sourceType} LIMIT 1`)).rows;
  return row ?? null;
}
export async function findCanonicalAccountingUnit(db: DatabaseExecutor, type: string, id: string): Promise<string | null> {
  const appropriation = appropriationIdQuery(type, id);
  let query: SQL;
  if (appropriation) query = sql`SELECT "budgetUnitId" FROM "BudgetAppropriation" WHERE id IN (${appropriation})`;
  else if (["BANK_ACCOUNT", "BANK_ACCOUNT_OPENING_BALANCE"].includes(type)) query = sql`SELECT "budgetUnitId" FROM "BankAccount" WHERE id=${id}`;
  else if (["BANK_STATEMENT_INVESTMENT_TRANSFER", "BANK_STATEMENT_CLASSIFICATION"].includes(type)) query = sql`SELECT a."budgetUnitId" FROM "BankStatementItem" s LEFT JOIN "BankAccount" a ON a.id=s."bankAccountId" WHERE s.id=${id}`;
  else if (type === "PLANNING_BUDGET") {
    const [movement] = (await db.execute<{ budgetUnitId: string }>(sql`SELECT l."budgetUnitId" FROM "PlanningLineMovement" m JOIN "PlanningBudgetLine" l ON l.id=m."lineId" WHERE m.id=${id}`)).rows;
    if (movement) return movement.budgetUnitId;
    query = sql`SELECT "budgetUnitId" FROM "PlanningBudgetLine" WHERE id=${id}`;
  } else if (type === "REVENUE_REVERSAL" || type === "REVENUE_RESOURCE_REDISTRIBUTION") {
    const table = type === "REVENUE_REVERSAL" ? "RevenueReversal" : "RevenueResourceRedistribution";
    query = sql`SELECT r."budgetUnitId" FROM ${sql.identifier(table)} s JOIN "Revenue" r ON r.id=s."revenueId" WHERE s.id=${id}`;
  } else return null;
  return (await db.execute<{ budgetUnitId: string | null }>(query)).rows[0]?.budgetUnitId ?? null;
}
export async function readAppropriationDimensions(db: DatabaseExecutor, type: string, id: string): Promise<AppropriationDimensions | null> {
  const origin = appropriationIdQuery(type, id);
  if (!origin) return null;
  const [row] = (await db.execute<AppropriationDimensions>(sql`
    SELECT a.id,a."resourceSourceId",a."expenseNatureId",a."budgetUnitId",jsonb_build_object('governmentEntityId',y."governmentEntityId") AS "financialYear",
      CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'code',p.code) END AS "programPPA",
      CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object('id',c.id,'code',c.code) END AS "actionPPA",
      CASE WHEN l.id IS NULL THEN NULL ELSE jsonb_build_object('id',l.id,'functionCode',l."functionCode",'subfunctionCode',l."subfunctionCode") END AS "planningLine"
    FROM "BudgetAppropriation" a JOIN "FinancialYear" y ON y.id=a."financialYearId" LEFT JOIN "ProgramPPA" p ON p.id=a."programPPAId"
    LEFT JOIN "ActionPPA" c ON c.id=a."actionPPAId" LEFT JOIN "PlanningBudgetLine" l ON l."appropriationId"=a.id WHERE a.id IN (${origin})`)).rows;
  return row ?? null;
}
export async function readPlanningLineDimensions(db: DatabaseExecutor, id: string): Promise<PlanningLineDimensions | null> {
  const [movement] = (await db.execute<{ lineId: string }>(sql`SELECT "lineId" FROM "PlanningLineMovement" WHERE id=${id}`)).rows;
  const [row] = (await db.execute<PlanningLineDimensions>(sql`
    SELECT l.id,l."resourceSourceId",l."budgetUnitId",l."revenueNatureId",l."expenseNatureId",l."functionCode",l."subfunctionCode",l."classificationSnapshot",
      jsonb_build_object('governmentEntityId',i."governmentEntityId") AS instrument,
      CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'code',p.code) END AS program,
      CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_build_object('id',a.id,'code',a.code) END AS action
    FROM "PlanningBudgetLine" l JOIN "PlanningInstrument" i ON i.id=l."instrumentId" LEFT JOIN "ProgramPPA" p ON p.id=l."programId" LEFT JOIN "ActionPPA" a ON a.id=l."actionId" WHERE l.id=${movement?.lineId ?? id}`)).rows;
  return row ?? null;
}
export async function readAccountingStockOrigin(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ settlementId: string | null; returnedMovementId: string | null; reversedMovementId: string | null }>(sql`SELECT "settlementId","returnedMovementId","reversedMovementId" FROM "MaterialMovement" WHERE id=${id}`)).rows;
  if (!row) throw new Error("Movimento de material não encontrado.");
  return row;
}
export async function findAccountingBankSource(db: DatabaseExecutor, type: string, id: string): Promise<string | null> {
  const query = type === "BANK_STATEMENT_CLASSIFICATION" ? sql`SELECT a."resourceSourceId" FROM "BankStatementItem" s LEFT JOIN "BankAccount" a ON a.id=s."bankAccountId" WHERE s.id=${id}` : sql`SELECT "resourceSourceId" FROM "BankAccount" WHERE id=${id}`;
  return (await db.execute<{ resourceSourceId: string | null }>(query)).rows[0]?.resourceSourceId ?? null;
}
export async function findAccountingTransferSources(db: DatabaseExecutor, type: string, id: string) {
  return (await db.execute<{ resourceSourceId: string | null }>(sql`SELECT m."resourceSourceId" FROM "TreasuryTransfer" t JOIN "TreasuryMovement" m ON m.id=t."sourceMovementId" WHERE t.id=${id} OR (m."sourceId"=${id} AND m."sourceType"=${type}) LIMIT 2`)).rows;
}
export async function findAccountingTaxCreditData(db: DatabaseExecutor, id: string): Promise<JsonValue | null> {
  return (await db.execute<{ data: JsonValue }>(sql`SELECT data FROM "TaxRegistryEntry" WHERE id=${id}`)).rows[0]?.data ?? null;
}
export async function findAccountingRevenueSources(db: DatabaseExecutor, origin: AccountingOrigin, reversal = false) {
  if (reversal) return (await db.execute<{ resourceSourceId: string; revenueNatureId: string }>(sql`SELECT r."resourceSourceId",r."revenueNatureId" FROM "RevenueReversal" s JOIN "Revenue" r ON r.id=s."revenueId" WHERE s.id=${origin.sourceId!}`)).rows;
  const scope = sql`r."sourceModule"=${origin.sourceModule ?? "MANUAL"} AND r."sourceType"=${origin.sourceType ?? ""} AND r."budgetUnitId"=${origin.budgetUnitId} AND y."governmentEntityId"=${origin.governmentEntityId}`;
  const canonical = (await db.execute<{ resourceSourceId: string; revenueNatureId: string }>(sql`SELECT r."resourceSourceId",r."revenueNatureId" FROM "Revenue" r JOIN "FinancialYear" y ON y.id=r."financialYearId" WHERE r.id=${origin.sourceId!} AND ${scope} LIMIT 1`)).rows;
  return canonical.length ? canonical : (await db.execute<{ resourceSourceId: string; revenueNatureId: string }>(sql`SELECT r."resourceSourceId",r."revenueNatureId" FROM "Revenue" r JOIN "FinancialYear" y ON y.id=r."financialYearId" WHERE r."sourceId"=${origin.sourceId!} AND ${scope} LIMIT 2`)).rows;
}
export async function readAccountingRedistribution(db: DatabaseExecutor, id: string) {
  const [row] = (await db.execute<{ id: string; sourceResourceSourceId: string; destinationResourceSourceId: string; budgetUnitId: string | null; governmentEntityId: string | null }>(sql`SELECT s.id,s."sourceResourceSourceId",s."destinationResourceSourceId",r."budgetUnitId",y."governmentEntityId" FROM "RevenueResourceRedistribution" s JOIN "Revenue" r ON r.id=s."revenueId" LEFT JOIN "FinancialYear" y ON y.id=r."financialYearId" WHERE s.id=${id}`)).rows;
  if (!row) throw new Error("Redistribuição de fontes não encontrada.");
  return row;
}
