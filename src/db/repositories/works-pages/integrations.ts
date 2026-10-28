import { and, asc, count, desc, eq, exists, inArray, isNotNull, isNull, notExists, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { WorksExportSearch, WorksPageAccess } from "@/lib/contracts/works-pages";
import { pageFederalExports as batches, pageFederalItems as items, pageFederalReceipts as receipts } from "@/db/schema/works-pages";
import { constructionCases as cases } from "@/db/schema/construction-core";
import { processes } from "@/db/schema/processes";
import { pageCaseScope } from "./cases";
import { contains, newest, worksPage } from "./shared";

export async function loadPageExports(database: DatabaseExecutor, access: WorksPageAccess, input: WorksExportSearch & { page?: string }) {
  // every is vacuously true for an empty batch. IS NOT TRUE also rejects a
  // case whose nullable current department does not satisfy the access scope.
  const scope = access.administrator ? undefined : and(eq(batches.scope, access.departmentId || ""), notExists(database.select({ id: items.id }).from(items).innerJoin(cases, eq(cases.id, items.caseId)).innerJoin(processes, eq(processes.id, cases.processId)).where(and(eq(items.exportId, batches.id), sql`(${pageCaseScope(access)}) IS NOT TRUE`))));
  const hasReceipt = database.select({ id: receipts.id }).from(receipts).where(eq(receipts.exportId, batches.id));
  const where = and(scope, input.period ? eq(batches.period, input.period) : undefined, input.kind === "initial" ? isNull(batches.rectifiesId) : input.kind === "rectification" ? isNotNull(batches.rectifiesId) : undefined,
    input.receipt === "with" ? exists(hasReceipt) : input.receipt === "without" ? notExists(hasReceipt) : undefined,
    input.q ? or(contains(batches.id, input.q), contains(batches.hashSha256, input.q), contains(batches.reason, input.q), exists(database.select({ id: items.id }).from(items).innerJoin(cases, eq(cases.id, items.caseId)).innerJoin(processes, eq(processes.id, cases.processId)).where(and(eq(items.exportId, batches.id), contains(processes.protocolNumber, input.q))))) : undefined);
  const total = (await database.select({ value: count() }).from(batches).where(where))[0].value;
  const page = worksPage(input.page, total);
  const [rows, rectificationOptions] = await Promise.all([
    database.select().from(batches).where(where).orderBy(...newest(batches.createdAt, batches.id)).offset((page - 1) * 20).limit(20),
    database.select({ id: batches.id, scope: batches.scope, period: batches.period, version: batches.version }).from(batches).where(access.administrator ? eq(batches.scope, "GLOBAL") : scope).orderBy(asc(batches.scope), desc(batches.period), desc(batches.version)).then(rows => {
      const seen = new Set<string>();
      return rows.filter(row => { const key = JSON.stringify([row.scope, row.period]); if (seen.has(key)) return false; seen.add(key); return true; });
    }),
  ]);
  const receiptRows = await database.select().from(receipts).where(inArray(receipts.exportId, rows.map(row => row.id))).orderBy(desc(receipts.createdAt));
  return { total, page, batches: rows.map(row => ({ ...row, receipts: receiptRows.filter(receipt => receipt.exportId === row.id) })), rectificationOptions };
}
