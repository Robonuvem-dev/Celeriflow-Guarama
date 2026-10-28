import { and, asc, count, desc, eq, exists, gte, inArray, lte, notExists, or, sql } from "drizzle-orm";
import type { ReadExecutor, PlanningPageSearch } from "@/lib/contracts/planning-pages";
import type { PlanningContext } from "@/lib/planejamento/access";
import { planningCatalogEntries as entries, planningCatalogVersions as versions, planningExpenseNatures as expenses, planningResourceSources as sources, planningRevenueAllocations as allocations, planningRevenueNatures as revenues } from "@/db/schema/planning-legal";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { governmentEntities } from "@/db/schema/master-data";
import { planningEntityScope } from "@/db/repositories/planning/scope";
import { contains, offset, pageNumber } from "./shared";

export async function pageCanonicalCatalog(database: ReadExecutor, kind: string, input: PlanningPageSearch) {
  // Explicit model branches preserve the revenue-only allocations relation.
  if (kind === "source") {
    const where = or(contains(sources.name, input.q?.slice(0, 200)), contains(sources.code, input.q?.slice(0, 200)));
    const total = (await database.select({ value: count() }).from(sources).where(where))[0].value, page = pageNumber(input.page, total);
    return { total, page, records: await database.select().from(sources).where(where).orderBy(asc(sources.code), asc(sources.id)).offset(offset(page)).limit(20) };
  }
  if (kind === "revenue") {
    const where = or(contains(revenues.name, input.q?.slice(0, 200)), contains(revenues.code, input.q?.slice(0, 200)));
    const total = (await database.select({ value: count() }).from(revenues).where(where))[0].value, page = pageNumber(input.page, total);
    const rows = await database.select().from(revenues).where(where).orderBy(asc(revenues.code), asc(revenues.id)).offset(offset(page)).limit(20);
    const links = await database.select({ allocation: allocations, resourceSource: { name: sources.name } }).from(allocations).innerJoin(sources, eq(sources.id, allocations.resourceSourceId)).where(inArray(allocations.revenueNatureId, rows.map(row => row.id)));
    return { total, page, records: rows.map(row => ({ ...row, planningAllocations: links.filter(link => link.allocation.revenueNatureId === row.id).map(link => ({ ...link.allocation, resourceSource: link.resourceSource })) })) };
  }
  const where = or(contains(expenses.name, input.q?.slice(0, 200)), contains(expenses.code, input.q?.slice(0, 200)));
  const total = (await database.select({ value: count() }).from(expenses).where(where))[0].value, page = pageNumber(input.page, total);
  return { total, page, records: await database.select().from(expenses).where(where).orderBy(asc(expenses.code), asc(expenses.id)).offset(offset(page)).limit(20) };
}
export async function pageClassifiers(database: ReadExecutor, limit?: number) {
  const sourceQuery = database.select({ id: sources.id, name: sources.name }).from(sources).orderBy(asc(sources.code));
  const revenueQuery = database.select({ id: revenues.id, name: revenues.name }).from(revenues).orderBy(asc(revenues.code));
  const expenseQuery = database.select({ id: expenses.id, name: expenses.name }).from(expenses).orderBy(asc(expenses.code));
  const [sourceRows, revenueRows, expenseRows] = await Promise.all([limit ? sourceQuery.limit(limit) : sourceQuery, limit ? revenueQuery.limit(limit) : revenueQuery, limit ? expenseQuery.limit(limit) : expenseQuery]);
  return { sources: sourceRows, revenues: revenueRows, expenses: expenseRows };
}
export function pagePublishedCatalogs(database: ReadExecutor, years?: { startYear: number; endYear: number }, ordered = true) {
  const query = database.select({ id: versions.id, year: versions.year, label: versions.label }).from(versions).where(and(eq(versions.status, "PUBLISHED"), years ? gte(versions.year, years.startYear) : undefined, years ? lte(versions.year, years.endYear) : undefined, exists(database.select({ id: entries.id }).from(entries).where(and(eq(entries.versionId, versions.id), inArray(entries.kind, ["SOURCE", "REVENUE", "EXPENSE"]))))));
  return ordered ? query.orderBy(desc(versions.year), asc(versions.id)).limit(20) : query.limit(20);
}
export async function pageReferences(database: ReadExecutor, context: PlanningContext, input: PlanningPageSearch & { versionId?: string }) {
  const requested = Math.max(1, Number(input.page) || 1);
  const noMsc = notExists(database.select({ id: entries.id }).from(entries).where(and(eq(entries.versionId, versions.id), sql`starts_with(${entries.kind}, 'MSC_')`)));
  const where = and(noMsc, or(contains(versions.label, input.q?.slice(0, 200)), contains(versions.normativeReference, input.q?.slice(0, 200))));
  const total = (await database.select({ value: count() }).from(versions).where(where))[0].value, page = Math.min(requested, Math.max(1, Math.ceil(total / 20)));
  const [rows, selectedRows, relationships] = await Promise.all([
    database.select().from(versions).where(where).orderBy(desc(versions.year), asc(versions.id)).offset(offset(page)).limit(20),
    input.versionId ? database.select().from(versions).where(and(eq(versions.id, input.versionId), noMsc)).limit(1) : [],
    database.select({ id: taxRegistryEntries.id, title: taxRegistryEntries.title, effectiveFrom: taxRegistryEntries.effectiveFrom, effectiveUntil: taxRegistryEntries.effectiveUntil, version: taxRegistryEntries.version }).from(taxRegistryEntries).where(and(eq(taxRegistryEntries.category, "MUNICIPAL_ACTIVITY_RELATION"), eq(taxRegistryEntries.entityType, "GOVERNMENT_ENTITY"), exists(database.select({ id: governmentEntities.id }).from(governmentEntities).where(and(eq(governmentEntities.id, taxRegistryEntries.entityId), planningEntityScope(context, governmentEntities.id)))))).orderBy(desc(taxRegistryEntries.createdAt), asc(taxRegistryEntries.id)).limit(20),
  ]);
  const selected = selectedRows[0] ?? null;
  const entriesTotal = selected ? (await database.select({ value: count() }).from(entries).where(eq(entries.versionId, selected.id)))[0].value : 0;
  const entryRows = selected ? await database.select().from(entries).where(eq(entries.versionId, selected.id)).orderBy(asc(entries.kind), asc(entries.code)).offset(offset(Math.min(requested, Math.max(1, Math.ceil(entriesTotal / 20))))).limit(20) : [];
  return { requested, total, page, versions: rows, selected, entriesTotal, entries: entryRows, relationships };
}
