import { sql } from "drizzle-orm";
import { sstRows, sstTimestamp } from "@/db/repositories/sst/sql";
import { sstDatabase } from "./database";
import type { AppContext } from "@/lib/platform/tenant-context";
import { functionalAuthorizedScope } from "./functional-service";

export type CertificateFunctionalFilters = { budgetUnitId?: string; q?: string; status?: string; employmentRegimeId?: string; localId?: string; costCenterId?: string; page?: string };
export async function listCertificatesWithFunctionalFilters(context: AppContext, filters: CertificateFunctionalFilters) {
  const scope = functionalAuthorizedScope(context, filters.budgetUnitId);
  const predicates = [scope];
  if (filters.q) predicates.push(sql`e.name ILIKE ${`%${filters.q}%`}`);
  if (filters.status) predicates.push(sql`p.status=${filters.status}`);
  // Immutable certificate source, so later history rectification does not silently rewrite the document.
  if (filters.employmentRegimeId) predicates.push(sql`f.snapshot->>'employmentRegimeId'=${filters.employmentRegimeId}`);
  if (filters.localId) predicates.push(sql`f.snapshot->>'localId'=${filters.localId}`);
  if (filters.costCenterId) predicates.push(sql`f.snapshot->>'costCenterId'=${filters.costCenterId}`);
  const where = sql.join(predicates, sql` AND `), database = sstDatabase(context);
  const [count] = await sstRows<{ total: number }>(database, sql`SELECT count(*)::int AS total FROM "SstMedicalCertificate" p JOIN "Employee" e ON e.id=p."employeeId" LEFT JOIN "SstCertificateFunctionalSource" f ON f."certificateId"=p.id WHERE ${where}`);
  const page = Math.min(Math.max(1, Math.trunc(Number(filters.page)) || 1), Math.max(1, Math.ceil(count.total / 20)));
  const rows = await sstRows<{ id: string; protocolNumber: string; status: string; startsAt: string; endsAt: string; leaveId: string | null; employeeName: string; registration: string | null; unitName: string }>(database, sql`SELECT p.id,p."protocolNumber",p.status,p."startsAt",p."endsAt",p."leaveId",e.name AS "employeeName",e.registration,u.name AS "unitName" FROM "SstMedicalCertificate" p JOIN "Employee" e ON e.id=p."employeeId" JOIN "BudgetUnit" u ON u.id=p."budgetUnitId" LEFT JOIN "SstCertificateFunctionalSource" f ON f."certificateId"=p.id WHERE ${where} ORDER BY p."presentedAt" DESC,p.id ASC LIMIT 20 OFFSET ${(page - 1) * 20}`);
  const options = await sstRows<{ employmentRegimeId: string; regimeName: string; localId: string; localName: string; costCenterId: string; costCenterName: string }>(database, sql`SELECT DISTINCT f.snapshot->>'employmentRegimeId' AS "employmentRegimeId",f.snapshot->'snapshot'->'regime'->>'name' AS "regimeName",f.snapshot->>'localId' AS "localId",f.snapshot->'snapshot'->>'local' AS "localName",f.snapshot->>'costCenterId' AS "costCenterId",f.snapshot->'snapshot'->'costCenter'->>'name' AS "costCenterName" FROM "SstMedicalCertificate" p JOIN "SstCertificateFunctionalSource" f ON f."certificateId"=p.id WHERE ${scope}`);
  const distinct = (kind: "regime" | "local" | "center") => [...new Map(options.map((o) => kind === "regime" ? [o.employmentRegimeId, o.regimeName] : kind === "local" ? [o.localId, o.localName] : [o.costCenterId, o.costCenterName])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return { records: rows.map((r) => ({ ...r, startsAt: sstTimestamp(r.startsAt), endsAt: sstTimestamp(r.endsAt), employee: { name: r.employeeName, registration: r.registration }, budgetUnit: { name: r.unitName } })), total: count.total, page, regimes: distinct("regime"), locals: distinct("local"), centers: distinct("center") };
}
