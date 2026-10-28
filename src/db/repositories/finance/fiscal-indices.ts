import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { PersistenceError } from "../../errors";
import { governmentEntities } from "../../schema/master-data";
import { fiscalAccountingEntries, fiscalAccountingTransactions, fiscalMonthlyCloses, municipalFiscalIndexDefinitions } from "../../schema/finance-fiscal-indices";
import { planningBudgetUnitLabels, planningEntityUnits } from "../../schema/planning-catalog";
import { listFinancialEntityYears } from "./report-scopes";
import type { FiscalAccountingEntry, FiscalAccountingTransaction, MunicipalFiscalIndexDefinitionRecord } from "@/lib/contracts/finance-fiscal-indices";

export async function readFiscalEntityType(db: DatabaseExecutor, id: string): Promise<string> {
  const [entity] = await db.select({ type: governmentEntities.type }).from(governmentEntities).where(eq(governmentEntities.id, id));
  if (!entity) throw new PersistenceError("not-found", "Entidade municipal não encontrada.");
  return entity.type;
}

export async function readFiscalDefinition(db: DatabaseExecutor, financialYearId: string, code: string, through: Date): Promise<MunicipalFiscalIndexDefinitionRecord | null> {
  const [definition] = await db.select().from(municipalFiscalIndexDefinitions).where(and(eq(municipalFiscalIndexDefinitions.financialYearId, financialYearId), eq(municipalFiscalIndexDefinitions.code, code), lte(municipalFiscalIndexDefinitions.effectiveFrom, through)))
    .orderBy(desc(municipalFiscalIndexDefinitions.effectiveFrom), desc(municipalFiscalIndexDefinitions.revision)).limit(1);
  return definition ?? null;
}

export async function listFiscalCloses(db: DatabaseExecutor, financialYearId: string, from: Date, through: Date): Promise<{ id: string; competence: Date }[]> {
  return db.select({ id: fiscalMonthlyCloses.id, competence: fiscalMonthlyCloses.competence }).from(fiscalMonthlyCloses).where(and(eq(fiscalMonthlyCloses.financialYearId, financialYearId), eq(fiscalMonthlyCloses.status, "FECHADO"), gte(fiscalMonthlyCloses.competence, from), lte(fiscalMonthlyCloses.competence, through)));
}

export async function listFiscalEntries(db: DatabaseExecutor, input: { accountIds: string[]; financialYearId: string; governmentEntityId: string; budgetUnitIds: string[]; from: Date; through: Date }): Promise<FiscalAccountingEntry[]> {
  const rows = await db.select({ entry: fiscalAccountingEntries, transaction: fiscalAccountingTransactions }).from(fiscalAccountingEntries)
    .innerJoin(fiscalAccountingTransactions, eq(fiscalAccountingTransactions.id, fiscalAccountingEntries.transactionId))
    .where(and(inArray(fiscalAccountingEntries.accountId, input.accountIds), eq(fiscalAccountingTransactions.financialYearId, input.financialYearId), eq(fiscalAccountingTransactions.governmentEntityId, input.governmentEntityId), inArray(fiscalAccountingTransactions.budgetUnitId, input.budgetUnitIds), eq(fiscalAccountingTransactions.status, "POSTADO"), gte(fiscalAccountingTransactions.date, input.from), lte(fiscalAccountingTransactions.date, input.through)))
    .orderBy(asc(fiscalAccountingEntries.id));
  return rows.map(({ entry, transaction }) => ({ ...entry, transaction }));
}

export async function listFiscalOriginalTransactions(db: DatabaseExecutor, ids: string[]): Promise<FiscalAccountingTransaction[]> {
  if (!ids.length) return [];
  return db.select().from(fiscalAccountingTransactions).where(inArray(fiscalAccountingTransactions.id, ids));
}

export async function findFiscalOriginFunction(db: DatabaseExecutor, sourceType: string, sourceId: string): Promise<{ financialYearId: string; budgetUnitId: string; functionCode: string | null } | null> {
  const origin = sourceType === "COMMITMENT" ? sql`SELECT "appropriationId" FROM "Commitment" WHERE id=${sourceId}`
    : sourceType === "SETTLEMENT" || sourceType === "PAYMENT" || sourceType === "COMMITMENT_MOVEMENT"
      ? sql`SELECT c."appropriationId" FROM ${sql.identifier({ SETTLEMENT: "Settlement", PAYMENT: "Payment", COMMITMENT_MOVEMENT: "CommitmentMovement" }[sourceType])} s JOIN "Commitment" c ON c.id=s."commitmentId" WHERE s.id=${sourceId}`
      : null;
  if (!origin) return null;
  const result = await db.execute<{ financialYearId: string; budgetUnitId: string; functionCode: string | null }>(sql`SELECT a."financialYearId", a."budgetUnitId", p."functionCode" FROM "BudgetAppropriation" a LEFT JOIN "PlanningBudgetLine" p ON p."appropriationId"=a.id WHERE a.id IN (${origin})`);
  return result.rows[0] ?? null;
}

export async function listFiscalAccounts(db: DatabaseExecutor, ids?: string[]): Promise<{ id: string; code: string; name: string }[]> {
  return (await db.execute<{ id: string; code: string; name: string }>(sql`SELECT id, code, name FROM "AccountingPlan" ${ids ? sql`WHERE ${inArray(sql`id`, ids)}` : sql``} ORDER BY code`)).rows;
}

export async function hasFiscalAccountChildren(db: DatabaseExecutor, codes: string[]): Promise<boolean> {
  if (!codes.length) return false;
  const result = await db.execute<{ found: boolean }>(sql`SELECT EXISTS(SELECT 1 FROM "AccountingPlan" WHERE ${sql.join(codes.map(code => sql`code LIKE ${`${code}.%`}`), sql` OR `)}) AS found`);
  return result.rows[0].found;
}

export async function insertFiscalDefinition(tx: DatabaseTransaction, input: Omit<MunicipalFiscalIndexDefinitionRecord, "id" | "revision" | "createdAt">): Promise<MunicipalFiscalIndexDefinitionRecord> {
  const [last] = await tx.select({ revision: municipalFiscalIndexDefinitions.revision }).from(municipalFiscalIndexDefinitions).where(and(eq(municipalFiscalIndexDefinitions.financialYearId, input.financialYearId), eq(municipalFiscalIndexDefinitions.code, input.code))).orderBy(desc(municipalFiscalIndexDefinitions.revision)).limit(1);
  const [record] = await tx.insert(municipalFiscalIndexDefinitions).values({ ...input, revision: (last?.revision ?? 0) + 1 }).returning();
  return record;
}

export async function listFiscalRevisions(db: DatabaseExecutor, financialYearId: string): Promise<MunicipalFiscalIndexDefinitionRecord[]> {
  return db.select().from(municipalFiscalIndexDefinitions).where(eq(municipalFiscalIndexDefinitions.financialYearId, financialYearId)).orderBy(asc(municipalFiscalIndexDefinitions.code), desc(municipalFiscalIndexDefinitions.revision));
}

export async function listFiscalEntityYears(db: DatabaseExecutor) {
  const years = await listFinancialEntityYears(db);
  const units = await db.select({ governmentEntityId: planningEntityUnits.governmentEntityId, budgetUnitId: planningEntityUnits.budgetUnitId, budgetUnit: { id: planningBudgetUnitLabels.id, name: planningBudgetUnitLabels.name } }).from(planningEntityUnits).innerJoin(planningBudgetUnitLabels, eq(planningBudgetUnitLabels.id, planningEntityUnits.budgetUnitId));
  return years.map(year => ({ ...year, governmentEntity: year.governmentEntity ? { ...year.governmentEntity, planningUnits: units.filter(unit => unit.governmentEntityId === year.governmentEntityId) } : null }));
}
