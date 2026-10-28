import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { PersistenceError } from "../../errors";
import { planningBudgetUnitLabels, planningCatalogEntries, planningCatalogVersions, planningEntityUnits } from "../../schema/planning-catalog";
import { financialYears } from "../../schema/finance-years";
import { governmentEntities } from "../../schema/master-data";
import type { CatalogEntryWithVersion, CatalogVersionWithCount, PlanningCatalogEntry } from "@/lib/contracts/planning-catalog";

export type MscCanonicalKind = "ACCOUNT" | "SOURCE" | "REVENUE" | "EXPENSE";
const canonicalTables = { ACCOUNT: "AccountingPlan", SOURCE: "ResourceSource", REVENUE: "RevenueNature", EXPENSE: "ExpenseNature" } as const;

export async function readMscFinancialYear(db: DatabaseExecutor, id: string) {
  const [year] = await db.select({ year: financialYears.year, governmentEntityId: financialYears.governmentEntityId }).from(financialYears).where(eq(financialYears.id, id));
  if (!year) throw new PersistenceError("not-found", "Exercício financeiro não encontrado.");
  return year;
}

export async function readMscUnitBinding(db: DatabaseExecutor, budgetUnitId: string) {
  const [binding] = await db.select({ governmentEntityId: planningEntityUnits.governmentEntityId, governmentEntity: { type: governmentEntities.type } }).from(planningEntityUnits).innerJoin(governmentEntities, eq(governmentEntities.id, planningEntityUnits.governmentEntityId)).where(eq(planningEntityUnits.budgetUnitId, budgetUnitId));
  if (!binding) throw new PersistenceError("not-found", "Vínculo municipal da UG não encontrado.");
  return binding;
}

export async function findMscCanonical(db: DatabaseExecutor, kind: MscCanonicalKind, id: string): Promise<{ id: string; code: string } | null> {
  const result = await db.execute<{ id: string; code: string }>(sql`SELECT id, code FROM ${sql.identifier(canonicalTables[kind])} WHERE id=${id}`);
  return result.rows[0] ?? null;
}

export async function hasMscAccountChildren(db: DatabaseExecutor, code: string): Promise<boolean> {
  const result = await db.execute<{ found: boolean }>(sql`SELECT EXISTS(SELECT 1 FROM "AccountingPlan" WHERE starts_with(code, ${`${code}.`})) AS found`);
  return result.rows[0].found;
}

export async function findMscCatalogVersion(db: DatabaseExecutor, id: string): Promise<CatalogVersionWithCount | null> {
  const [row] = await db.select({ version: planningCatalogVersions, entries: sql<number>`(SELECT count(*)::int FROM "PlanningCatalogEntry" e WHERE e."versionId"=${planningCatalogVersions.id})` }).from(planningCatalogVersions).where(eq(planningCatalogVersions.id, id));
  return row ? { ...row.version, _count: { entries: row.entries } } : null;
}

export async function readMscCatalogEntry(db: DatabaseExecutor, id: string): Promise<CatalogEntryWithVersion> {
  const [row] = await db.select({ entry: planningCatalogEntries, version: planningCatalogVersions }).from(planningCatalogEntries).innerJoin(planningCatalogVersions, eq(planningCatalogVersions.id, planningCatalogEntries.versionId)).where(eq(planningCatalogEntries.id, id));
  if (!row) throw new PersistenceError("not-found", "Referência MSC não encontrada.");
  return { ...row.entry, version: row.version };
}

export async function listMscPublishedEntries(db: DatabaseExecutor, input: { kind?: string; mappingKinds?: boolean; canonicalId?: string; year: number; governmentEntityId?: string; budgetUnitId?: string }): Promise<PlanningCatalogEntry[]> {
  return db.select({ entry: planningCatalogEntries }).from(planningCatalogEntries).innerJoin(planningCatalogVersions, eq(planningCatalogVersions.id, planningCatalogEntries.versionId)).where(and(
    eq(planningCatalogVersions.year, input.year), eq(planningCatalogVersions.status, "PUBLISHED"),
    input.kind ? eq(planningCatalogEntries.kind, input.kind) : undefined,
    input.mappingKinds ? sql`starts_with(${planningCatalogEntries.kind}, 'MSC_MAPPING_')` : undefined,
    input.canonicalId ? eq(planningCatalogEntries.canonicalId, input.canonicalId) : undefined,
    input.governmentEntityId ? sql`${planningCatalogEntries.attributes}->'governmentEntityId'=${JSON.stringify(input.governmentEntityId)}::jsonb` : undefined,
    input.budgetUnitId ? sql`${planningCatalogEntries.attributes}->'budgetUnitId'=${JSON.stringify(input.budgetUnitId)}::jsonb` : undefined,
  )).orderBy(asc(planningCatalogEntries.id)).then(rows => rows.map(row => row.entry));
}

export async function listMscAuthorizedUnits(db: DatabaseExecutor, allowedBudgetUnitIds?: string[]) {
  return db.select({ governmentEntityId: planningEntityUnits.governmentEntityId, budgetUnitId: planningEntityUnits.budgetUnitId, governmentEntity: { name: governmentEntities.name }, budgetUnit: { code: planningBudgetUnitLabels.code, name: planningBudgetUnitLabels.name } }).from(planningEntityUnits)
    .innerJoin(governmentEntities, eq(governmentEntities.id, planningEntityUnits.governmentEntityId)).innerJoin(planningBudgetUnitLabels, eq(planningBudgetUnitLabels.id, planningEntityUnits.budgetUnitId))
    .where(allowedBudgetUnitIds === undefined ? undefined : inArray(planningEntityUnits.budgetUnitId, allowedBudgetUnitIds)).orderBy(asc(planningEntityUnits.governmentEntityId), asc(planningEntityUnits.budgetUnitId));
}

export async function listMscEntityYears(db: DatabaseExecutor, governmentEntityId: string) {
  return db.select({ id: financialYears.id, year: financialYears.year, status: financialYears.status }).from(financialYears).where(eq(financialYears.governmentEntityId, governmentEntityId)).orderBy(desc(financialYears.year));
}

export async function lookupMscConfigurationChoices(db: DatabaseExecutor, input: { field: string; kind: MscCanonicalKind; year: number; governmentEntityId: string; budgetUnitId: string; canonicalId: string; q: string; page: number }) {
  if (input.field === "PREDECESSOR" && !input.canonicalId) return { options: [], total: 0, page: 1 };
  const pagination = (total: number) => {
    const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
    return { total, page, offset: (page - 1) * 20 };
  };
  if (input.field.startsWith("MSC_") || input.field === "PREDECESSOR") {
    const predecessor = input.field === "PREDECESSOR";
    const where: SQL | undefined = and(
      eq(planningCatalogVersions.year, input.year),
      predecessor ? and(eq(planningCatalogVersions.status, "PUBLISHED"), eq(planningCatalogEntries.kind, `MSC_MAPPING_${input.kind}`), eq(planningCatalogEntries.canonicalId, input.canonicalId), sql`${planningCatalogEntries.attributes}->'governmentEntityId'=${JSON.stringify(input.governmentEntityId)}::jsonb`, sql`${planningCatalogEntries.attributes}->'budgetUnitId'=${JSON.stringify(input.budgetUnitId)}::jsonb`)
        : and(eq(planningCatalogVersions.id, "msc-reference:stn:2026:20260708"), eq(planningCatalogEntries.kind, input.field)),
      input.q ? or(ilike(planningCatalogEntries.code, `%${input.q}%`), ilike(planningCatalogEntries.name, `%${input.q}%`)) : undefined,
    );
    const [summary] = await db.select({ total: count() }).from(planningCatalogEntries).innerJoin(planningCatalogVersions, eq(planningCatalogVersions.id, planningCatalogEntries.versionId)).where(where);
    const { total, page, offset } = pagination(summary.total);
    const entries = await db.select({ id: planningCatalogEntries.id, code: planningCatalogEntries.code, name: planningCatalogEntries.name, effectiveFrom: sql<string | null>`${planningCatalogEntries.attributes}->>'effectiveFrom'` }).from(planningCatalogEntries).innerJoin(planningCatalogVersions, eq(planningCatalogVersions.id, planningCatalogEntries.versionId)).where(where).orderBy(asc(planningCatalogEntries.code), asc(planningCatalogEntries.id)).limit(20).offset(offset);
    return { options: entries.map(entry => ({ id: entry.id, name: `${entry.code} · ${entry.name}${predecessor ? ` · ${entry.effectiveFrom ?? ""}` : ""}` })), total, page };
  }
  // The identifier is selected exclusively from the finite canonical-kind map.
  const table = sql.identifier(canonicalTables[input.field as MscCanonicalKind] ?? canonicalTables.EXPENSE);
  const where = input.q ? sql`code ILIKE ${`%${input.q}%`} OR name ILIKE ${`%${input.q}%`}` : sql`true`;
  const summary = await db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM ${table} WHERE ${where}`);
  const { total, page, offset } = pagination(summary.rows[0].total);
  const entries = await db.execute<{ id: string; code: string; name: string }>(sql`SELECT id, code, name FROM ${table} WHERE ${where} ORDER BY code, id LIMIT 20 OFFSET ${offset}`);
  return { options: entries.rows.map(entry => ({ id: entry.id, name: `${entry.code} · ${entry.name}` })), total, page };
}
