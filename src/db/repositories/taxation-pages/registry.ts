import { and, asc, desc, eq, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { taxRegistryEntries as entries } from "@/db/schema/taxation-registry";
import { companies, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import type { FiscalEntry } from "@/lib/contracts/taxation-pages";
import type { TaxpayerDetails } from "@/lib/contracts/registry";

export type FiscalEntrySelection = {
  id?: string; entityType?: string; entityIds?: string[]; categories?: string[];
  status?: string; source?: string; allowedBudgetUnitIds?: string[];
  recordedBy?: Date; effectiveAt?: Date;
  data?: { budgetUnitId?: string; governmentEntityId?: string; kind?: string; declarationId?: string };
  order?: "version" | "created" | "version-created" | "territorial" | "history" | "effective-version" | "none";
  limit?: number;
};

/** Fiscal registry read model, with JSON scope evaluated in PostgreSQL. */
export async function listFiscalEntries(database: DatabaseExecutor, selection: FiscalEntrySelection): Promise<FiscalEntry[]> {
  const predicates: SQL[] = [];
  if (selection.id !== undefined) predicates.push(eq(entries.id, selection.id));
  if (selection.entityType !== undefined) predicates.push(eq(entries.entityType, selection.entityType));
  if (selection.entityIds !== undefined) predicates.push(inArray(entries.entityId, selection.entityIds));
  if (selection.categories !== undefined) predicates.push(inArray(entries.category, selection.categories));
  if (selection.status !== undefined) predicates.push(eq(entries.status, selection.status));
  if (selection.source !== undefined) predicates.push(eq(entries.source, selection.source));
  if (selection.recordedBy !== undefined) predicates.push(lte(entries.createdAt, selection.recordedBy));
  if (selection.effectiveAt !== undefined) predicates.push(sql`${entries.effectiveFrom} <= ${selection.effectiveAt} AND (${entries.effectiveUntil} IS NULL OR ${entries.effectiveUntil} > ${selection.effectiveAt})`);
  if (selection.allowedBudgetUnitIds !== undefined) predicates.push(selection.allowedBudgetUnitIds.length ? sql`${entries.data}->'budgetUnitId' IN (${sql.join(selection.allowedBudgetUnitIds.map(id => sql`${JSON.stringify(id)}::jsonb`), sql`, `)})` : sql`false`);
  for (const [key, value] of Object.entries(selection.data ?? {})) {
    if (value !== undefined) predicates.push(sql`${entries.data}->${key} = ${JSON.stringify(value)}::jsonb`);
  }
  const order = selection.order === "none" ? [] : selection.order === "created" ? [desc(entries.createdAt)]
    : selection.order === "version-created" ? [desc(entries.version), desc(entries.createdAt)]
    : selection.order === "territorial" ? [asc(entries.category), asc(entries.entityId), desc(entries.version)]
    : selection.order === "history" ? [asc(entries.effectiveFrom), asc(entries.createdAt), asc(entries.version)]
    : selection.order === "effective-version" ? [desc(entries.effectiveFrom), desc(entries.version)]
    : [desc(entries.version)];
  const query = database.select().from(entries).where(and(...predicates)).$dynamic();
  if (selection.limit !== undefined) query.limit(selection.limit);
  return query.orderBy(...order);
}

export async function listPageTaxpayers(database: DatabaseExecutor, selection: {
  active?: boolean; ids?: string[]; companyOnly?: boolean;
  order?: "created-asc" | "created-desc" | "updated-desc" | "id"; limit?: number;
} = {}): Promise<TaxpayerDetails[]> {
  const predicates: SQL[] = [];
  if (selection.active) predicates.push(eq(taxpayers.status, "Ativo"));
  if (selection.ids) predicates.push(inArray(taxpayers.id, selection.ids));
  if (selection.companyOnly) predicates.push(sql`${taxpayers.companyId} IS NOT NULL`);
  const query = database.select({ taxpayer: taxpayers, person: people, company: companies }).from(taxpayers)
    .leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId))
    .where(and(...predicates)).$dynamic();
  if (selection.order === "created-asc") query.orderBy(asc(taxpayers.createdAt));
  if (selection.order === "created-desc") query.orderBy(desc(taxpayers.createdAt));
  if (selection.order === "updated-desc") query.orderBy(desc(taxpayers.updatedAt));
  if (selection.order === "id") query.orderBy(asc(taxpayers.id));
  if (selection.limit !== undefined) query.limit(selection.limit);
  return (await query).map(row => ({ ...row.taxpayer, person: row.person, company: row.company }));
}
