import { Prisma, type PrismaClient } from "@prisma/client";
import type { ConstructionAccess } from "./construction-policy";

export type LifecycleListQuery = Record<string, string | undefined>;
export const lifecyclePageSize = 20;
export function lifecyclePage(value: string | undefined, total: number) {
  return Math.min(Math.max(1, Math.ceil(total / lifecyclePageSize)), Math.max(1, Number.parseInt(value || "1", 10) || 1));
}
export function lifecycleListHref(query: LifecycleListQuery, pageKey: string, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  params.set(pageKey, String(Math.max(1, page)));
  return `?${params.toString()}`;
}
export function lifecycleFilter(value: string | undefined, options: string[]) { return options.includes(value || "") ? value : undefined; }
export function lifecycleSearch(value: string | undefined) { return (value || "").trim().slice(0, 160); }

/** Scalar linked process IDs require a SQL join; scope/filter/count before fetching a 20-row page. */
export async function listConstructionPropertyUpdates(db: PrismaClient, access: ConstructionAccess, query: LifecycleListQuery, keys = { page: "page", search: "q", status: "status" }) {
  const search = lifecycleSearch(query[keys.search]);
  const status = lifecycleFilter(query[keys.status], ["PENDING", "APPLIED"]);
  const scope = access.administrator ? Prisma.sql`TRUE` : Prisma.sql`p."currentDepartmentId" = ${access.departmentId || "__NONE__"}`;
  const statusClause = status ? Prisma.sql`u."status" = ${status}` : Prisma.sql`TRUE`;
  const escaped = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const searchClause = search ? Prisma.sql`(p."protocolNumber" ILIKE ${escaped} OR c."number" ILIKE ${escaped})` : Prisma.sql`TRUE`;
  const from = Prisma.sql`FROM "ConstructionPropertyUpdate" u JOIN "Process" p ON p."id"=u."processId" JOIN "ConstructionCompletion" c ON c."id"=u."completionId" WHERE ${scope} AND ${statusClause} AND ${searchClause}`;
  const counts = await db.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT COUNT(*) AS total ${from}`);
  const total = Number(counts[0].total);
  const page = lifecyclePage(query[keys.page], total);
  const ids = await db.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT u."id" ${from} ORDER BY u."createdAt" DESC, u."id" ASC LIMIT ${lifecyclePageSize} OFFSET ${(page - 1) * lifecyclePageSize}`);
  const updates = await db.constructionPropertyUpdate.findMany({ where: { id: { in: ids.map((item) => item.id) } }, include: { completion: { select: { number: true, kind: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: lifecyclePageSize });
  const processes = await db.process.findMany({ where: { id: { in: updates.map((update) => update.processId) } }, select: { id: true, protocolNumber: true }, take: lifecyclePageSize });
  return { updates, processes, total, page };
}
