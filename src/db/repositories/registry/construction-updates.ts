import { asc, desc, inArray, sql } from "drizzle-orm";
import { lifecycleFilter, lifecyclePage, lifecyclePageSize, lifecycleSearch, type LifecycleListQuery } from "@/lib/obras/construction-list-filters";
import type { ConstructionAccess, ConstructionPropertyUpdateList } from "@/lib/contracts/construction";
import type { DatabaseExecutor } from "../../transaction";
import { constructionPropertyUpdates } from "../../schema/construction-lifecycle";

export async function listConstructionPropertyUpdates(db: DatabaseExecutor, access: ConstructionAccess, query: LifecycleListQuery, keys = { page: "page", search: "q", status: "status" }): Promise<ConstructionPropertyUpdateList> {
  const search = lifecycleSearch(query[keys.search]);
  const status = lifecycleFilter(query[keys.status], ["PENDING", "APPLIED"]);
  const scope = access.administrator ? sql`TRUE` : sql`p."currentDepartmentId" = ${access.departmentId || "__NONE__"}`;
  const statusClause = status ? sql`u."status" = ${status}` : sql`TRUE`;
  const escaped = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const searchClause = search ? sql`(p."protocolNumber" ILIKE ${escaped} OR c."number" ILIKE ${escaped})` : sql`TRUE`;
  const from = sql`FROM "ConstructionPropertyUpdate" u JOIN "Process" p ON p."id"=u."processId" JOIN "ConstructionCompletion" c ON c."id"=u."completionId" WHERE ${scope} AND ${statusClause} AND ${searchClause}`;
  const counts = await db.execute<{ total: string }>(sql`SELECT COUNT(*) AS total ${from}`);
  const total = Number(counts.rows[0].total);
  const page = lifecyclePage(query[keys.page], total);
  const ids = await db.execute<{ id: string }>(sql`SELECT u."id" ${from} ORDER BY u."createdAt" DESC, u."id" ASC LIMIT ${lifecyclePageSize} OFFSET ${(page - 1) * lifecyclePageSize}`);
  if (!ids.rows.length) return { updates: [], processes: [], total, page };
  const records = await db.select().from(constructionPropertyUpdates).where(inArray(constructionPropertyUpdates.id, ids.rows.map(row => row.id))).orderBy(desc(constructionPropertyUpdates.createdAt), asc(constructionPropertyUpdates.id)).limit(lifecyclePageSize);
  if (!records.length) return { updates: [], processes: [], total, page };
  const completions = await db.execute<{ id: string; number: string; kind: string }>(sql`SELECT id, number, kind FROM "ConstructionCompletion" WHERE id IN (${sql.join(records.map(row => sql`${row.completionId}`), sql`, `)})`);
  const updates = records.map(record => {
    const completion = completions.rows.find(row => row.id === record.completionId);
    if (!completion) throw new Error("Conclusão da atualização imobiliária não encontrada.");
    return { ...record, completion: { number: completion.number, kind: completion.kind } };
  });
  const processes = await db.execute<{ id: string; protocolNumber: string }>(sql`SELECT id, "protocolNumber" FROM "Process" WHERE id IN (${sql.join(updates.map(row => sql`${row.processId}`), sql`, `)}) LIMIT ${lifecyclePageSize}`);
  return { updates, processes: processes.rows, total, page };
}

export async function listActiveConstructionRoles(db: DatabaseExecutor, employeeId: string, departmentId: string, today: Date): Promise<string[]> {
  const result = await db.execute<{ role: string }>(sql`SELECT r.role FROM "ConstructionStaffRole" r
    JOIN "Employee" e ON e.id=r."employeeId" JOIN "Department" d ON d.id=r."departmentId"
    WHERE r."employeeId"=${employeeId} AND r."departmentId"=${departmentId} AND r."isActive"=true
    AND e."isActive"=true AND e."departmentId"=${departmentId} AND d."isActive"=true
    AND r."startsAt"<=${today.toISOString().slice(0, 10)}::date AND (r."endsAt" IS NULL OR r."endsAt">=${today.toISOString().slice(0, 10)}::date)`);
  return result.rows.map(row => row.role);
}
