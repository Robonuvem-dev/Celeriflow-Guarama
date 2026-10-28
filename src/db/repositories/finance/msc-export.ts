import { and, asc, count, eq, gt, gte, inArray, lt, or, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { planningCatalogEntries, planningCatalogVersions, planningEntityUnits } from "../../schema/planning-catalog";
import { governmentEntities } from "../../schema/master-data";
import { financialYears } from "../../schema/finance-years";
import { fiscalMonthlyCloses } from "../../schema/finance-fiscal-indices";
import { mscAccountingEntries, mscAccountingTransactions, mscAnnualCloses } from "../../schema/finance-msc";
import { financialAuditLogs } from "../../schema/finance-identity";
import type { MscArchiveAudit, MscLedgerEntry } from "@/lib/contracts/finance-msc";
import type { JsonValue } from "../../json";

export async function hasMscReportingScopeSuccessor(db: DatabaseExecutor, canonicalId: string, predecessorId: string): Promise<boolean> {
  const [row] = await db.select({ total: count() }).from(planningCatalogEntries).innerJoin(planningCatalogVersions, eq(planningCatalogVersions.id, planningCatalogEntries.versionId)).where(and(
    eq(planningCatalogEntries.kind, "MSC_REPORTING_SCOPE"), eq(planningCatalogEntries.canonicalId, canonicalId), eq(planningCatalogVersions.year, 2026), eq(planningCatalogVersions.status, "PUBLISHED"),
    sql`${planningCatalogEntries.attributes}->'predecessorEntryId'=${JSON.stringify(predecessorId)}::jsonb`,
  ));
  return row.total > 0;
}

export async function listMscPerimeterEntities(db: DatabaseExecutor, canonicalId: string): Promise<{ id: string; type: string }[]> {
  return db.select({ id: governmentEntities.id, type: governmentEntities.type }).from(governmentEntities).where(or(
    eq(governmentEntities.id, canonicalId), and(eq(governmentEntities.parentId, canonicalId), eq(governmentEntities.status, "ATIVA")),
  ));
}

export async function listMscPerimeterUnits(db: DatabaseExecutor, entityIds: string[]): Promise<{ budgetUnitId: string }[]> {
  return db.select({ budgetUnitId: planningEntityUnits.budgetUnitId }).from(planningEntityUnits).where(inArray(planningEntityUnits.governmentEntityId, entityIds));
}

export async function listMscPerimeterYears(db: DatabaseExecutor, entityIds: string[]): Promise<{ id: string; governmentEntityId: string | null }[]> {
  return db.select({ id: financialYears.id, governmentEntityId: financialYears.governmentEntityId }).from(financialYears).where(and(eq(financialYears.year, 2026), inArray(financialYears.governmentEntityId, entityIds)));
}

export async function countMscClosedYears(db: DatabaseExecutor, yearIds: string[], competence: Date, annual: boolean): Promise<number> {
  if (annual) {
    const [row] = await db.select({ total: count() }).from(mscAnnualCloses).where(and(inArray(mscAnnualCloses.financialYearId, yearIds), eq(mscAnnualCloses.status, "ENCERRADO")));
    return row.total;
  }
  const [row] = await db.select({ total: count() }).from(fiscalMonthlyCloses).where(and(inArray(fiscalMonthlyCloses.financialYearId, yearIds), eq(fiscalMonthlyCloses.competence, competence), eq(fiscalMonthlyCloses.status, "FECHADO")));
  return row.total;
}

/** Stable keyset pagination over the same repeatable-read snapshot as perimeter and audit. */
export async function listMscLedgerEntries(db: DatabaseExecutor, input: { yearIds: string[]; entityIds: string[]; unitIds: string[]; through: Date; afterId?: string }): Promise<MscLedgerEntry[]> {
  return db.select({ id: mscAccountingEntries.id, type: mscAccountingEntries.type, valueDecimal: mscAccountingEntries.valueDecimal, classificationSnapshot: mscAccountingEntries.classificationSnapshot,
    transaction: { date: mscAccountingTransactions.date, eventType: mscAccountingTransactions.eventType, governmentEntityId: mscAccountingTransactions.governmentEntityId, budgetUnitId: mscAccountingTransactions.budgetUnitId },
  }).from(mscAccountingEntries).innerJoin(mscAccountingTransactions, eq(mscAccountingTransactions.id, mscAccountingEntries.transactionId)).where(and(
    inArray(mscAccountingTransactions.financialYearId, input.yearIds), inArray(mscAccountingTransactions.governmentEntityId, input.entityIds), inArray(mscAccountingTransactions.budgetUnitId, input.unitIds),
    eq(mscAccountingTransactions.status, "POSTADO"), gte(mscAccountingTransactions.date, new Date("2026-01-01T00:00:00.000Z")), lt(mscAccountingTransactions.date, input.through),
    input.afterId ? gt(mscAccountingEntries.id, input.afterId) : undefined,
  )).orderBy(asc(mscAccountingEntries.id)).limit(1000);
}

export async function findMscExportAccountReference(db: DatabaseExecutor, input: { accountCode: string; referenceVersionId: string; referenceHash: string }): Promise<{ attributes: JsonValue } | null> {
  const [row] = await db.select({ attributes: planningCatalogEntries.attributes }).from(planningCatalogEntries).innerJoin(planningCatalogVersions, eq(planningCatalogVersions.id, planningCatalogEntries.versionId)).where(and(
    eq(planningCatalogEntries.kind, "MSC_ACCOUNT"), eq(planningCatalogEntries.code, input.accountCode), eq(planningCatalogEntries.versionId, input.referenceVersionId),
    eq(planningCatalogVersions.year, 2026), eq(planningCatalogVersions.sourceHash, input.referenceHash),
  )).limit(1);
  return row ?? null;
}

export async function countMscInformationReferences(db: DatabaseExecutor, versionId: string, type: string, value: string): Promise<number> {
  const [row] = await db.select({ total: count() }).from(planningCatalogEntries).where(and(eq(planningCatalogEntries.versionId, versionId), type === "FS"
    ? or(and(eq(planningCatalogEntries.kind, "MSC_FUNCTION"), eq(planningCatalogEntries.code, value.slice(0, 2))), and(eq(planningCatalogEntries.kind, "MSC_SUBFUNCTION"), eq(planningCatalogEntries.code, value.slice(2))))
    : and(eq(planningCatalogEntries.kind, `MSC_${type}`), eq(planningCatalogEntries.code, value))));
  return row.total;
}

export async function insertMscArchiveAudit(tx: DatabaseTransaction, authorUsuarioId: string, scopeId: string, payload: MscArchiveAudit): Promise<void> {
  await tx.insert(financialAuditLogs).values({ action: "MSC_FILE_GENERATED", entityType: "PlanningCatalogEntry", entityId: scopeId, authorUsuarioId, payload });
}
