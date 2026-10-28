import type { AppContext } from "@/lib/platform/tenant-context";
import { AccessError, canPerformModuleOperation, canViewModule } from "@/lib/platform/tenant-context";
import { assertSstClinicalAccess } from "./access";
import { absenceMinutes } from "./certificate-policy";
import { z } from "zod";
import { SstValidationError } from "./errors";
import { sql } from "drizzle-orm";
import { sstRows, sstTimestamp } from "@/db/repositories/sst/sql";
import { sstDatabase } from "./database";

export const reportInput = z.object({
  budgetUnitId: z.string().min(1), from: z.coerce.date(), until: z.coerce.date(),
  employeeId: z.string().default(""), roleId: z.string().default(""), departmentId: z.string().default(""),
  employmentRegimeId: z.string().default(""), localId: z.string().default(""), costCenterId: z.string().default(""),
  reasonId: z.string().default(""), issuerPersonId: z.string().default(""), cid: z.string().trim().toUpperCase().default(""),
  status: z.enum(["", "RECEIVED", "APPROVED", "REJECTED", "REVOKED"]).default(""),
  page: z.coerce.number().int().positive().optional(),
}).refine((value) => value.until > value.from && value.until.getTime() - value.from.getTime() <= 366 * 86400000, "Selecione um período de até um ano.");

export function reportCivilRange(from: string, until: string) {
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => {
    const parsed = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
  }, "Data civil inválida.");
  const start = new Date(`${day.parse(from)}T00:00:00-03:00`);
  const end = new Date(new Date(`${day.parse(until)}T00:00:00-03:00`).getTime() + 86400000);
  return { from: start, until: end };
}

type ReportRow = {
  id: string; employeeId: string; startsAt: Date; endsAt: Date; cidCodes: string[];
  status: string; protocolNumber: string; employeeName: string; registration: string | null;
  birthDate: Date | null; issuerName: string; reasonName: string;
  functionalPeriodId: string | null; employmentRegimeId: string | null; localId: string | null; costCenterId: string | null;
  regimeName: string | null; localName: string | null; costCenterName: string | null;
};
type PlannedRow = { employeeId: string; startsAt: Date; endsAt: Date; employeeName: string };
type ReportWire = Omit<ReportRow, "startsAt" | "endsAt" | "birthDate" | "cidCodes"> & { startsAt: string; endsAt: string; birthDate: string | null; cidCodes: string[] | null };
function reportDto(row: ReportWire): ReportRow { return { ...row, startsAt: sstTimestamp(row.startsAt), endsAt: sstTimestamp(row.endsAt), birthDate: row.birthDate === null ? null : sstTimestamp(row.birthDate), cidCodes: row.cidCodes ?? [] }; }

export async function certificateReport(context: AppContext, raw: unknown) {
  const input = reportInput.parse(raw);
  if (!canViewModule(context.user, "SST") || !canPerformModuleOperation(context.user, "SST", "issueReports")) throw new AccessError("Emissão de relatórios SST não autorizada.", 403);
  // UG and clinical ACL are checked before any count, dataset or denominator query.
  await assertSstClinicalAccess(context, input.budgetUnitId);
  const predicates = [sql`c."budgetUnitId"=${input.budgetUnitId}`, sql`c."startsAt"<${input.until} AND c."endsAt">${input.from}`,
    sql`(f."certificateId" IS NULL OR (p."employeeId"=c."employeeId" AND p."budgetUnitId"=c."budgetUnitId" AND m.id IS NOT NULL AND p."startsAt"<=c."startsAt" AND p."endsAt">=c."endsAt"))`];
  if (input.employeeId) predicates.push(sql`c."employeeId"=${input.employeeId}`);
  if (input.roleId) predicates.push(sql`COALESCE(p."roleId",c."roleIdSnapshot")=${input.roleId}`);
  if (input.departmentId) predicates.push(sql`COALESCE(p."departmentId",c."departmentIdSnapshot")=${input.departmentId}`);
  if (input.employmentRegimeId) predicates.push(sql`p."employmentRegimeId"=${input.employmentRegimeId}`);
  if (input.localId) predicates.push(sql`p."localId"=${input.localId}`);
  if (input.costCenterId) predicates.push(sql`p."costCenterId"=${input.costCenterId}`);
  if (input.reasonId) predicates.push(sql`c."reasonId"=${input.reasonId}`);
  if (input.issuerPersonId) predicates.push(sql`c."issuerPersonId"=${input.issuerPersonId}`);
  if (input.status) predicates.push(sql`c.status=${input.status}`);
  if (input.cid) predicates.push(sql`EXISTS(SELECT 1 FROM unnest(c."cidCodes") cid WHERE replace(cid,'.','')=${input.cid.replaceAll(".", "")})`);
  const where = sql.join(predicates, sql` AND `), database = sstDatabase(context);
  const origin = sql`FROM "SstMedicalCertificate" c LEFT JOIN "SstCertificateFunctionalSource" f ON f."certificateId"=c.id LEFT JOIN "HrEmployeeFunctionalPeriod" p ON p.id=f."functionalPeriodId" LEFT JOIN "HrBudgetUnitEntityMapping" m ON m."budgetUnitId"=p."budgetUnitId" AND m."governmentEntityId"=p."governmentEntityId"`;
  const [count] = await sstRows<{ total: number }>(database, sql`SELECT count(*)::int AS total ${origin} WHERE ${where}`);
  if (count.total > 10000) throw new SstValidationError("O período possui mais de 10.000 atestados. Restrinja os filtros para emitir o relatório.");
  const projection = sql`SELECT c.id,c."employeeId",c."startsAt",c."endsAt",c."cidCodes",c.status,c."protocolNumber",e.name AS "employeeName",e.registration,b."birthDate",i."fullName" AS "issuerName",COALESCE(c."reasonSnapshot"->>'name',r.name) AS "reasonName",p.id AS "functionalPeriodId",p."employmentRegimeId",p."localId",p."costCenterId",p.snapshot->'regime'->>'name' AS "regimeName",p.snapshot->>'local' AS "localName",p.snapshot->'costCenter'->>'name' AS "costCenterName" ${origin} JOIN "Employee" e ON e.id=c."employeeId" LEFT JOIN "Person" b ON b.id=e."personId" JOIN "Person" i ON i.id=c."issuerPersonId" JOIN "SstCertificateReason" r ON r.id=c."reasonId" WHERE ${where}`;
  // Bounded analytical dataset is needed for CID/age and union-of-intervals statistics.
  const analytical = (await sstRows<ReportWire>(database, sql`${projection} ORDER BY c."startsAt",c.id LIMIT 10000`)).map(reportDto);
  const page = Math.min(input.page || 1, Math.max(1, Math.ceil(count.total / 20)));
  const rows = input.page ? (await sstRows<ReportWire>(database, sql`${projection} ORDER BY c."startsAt",c.id LIMIT 20 OFFSET ${(page - 1) * 20}`)).map(reportDto) : analytical;

  const plannedPredicates = [sql`s."budgetUnitId"=${input.budgetUnitId} AND s."startsAt"<${input.until} AND s."endsAt">${input.from}`];
  if (input.employeeId) plannedPredicates.push(sql`s."employeeId"=${input.employeeId}`);
  if (input.roleId) plannedPredicates.push(sql`p."roleId"=${input.roleId}`);
  if (input.departmentId) plannedPredicates.push(sql`p."departmentId"=${input.departmentId}`);
  if (input.employmentRegimeId) plannedPredicates.push(sql`p."employmentRegimeId"=${input.employmentRegimeId}`);
  if (input.localId) plannedPredicates.push(sql`p."localId"=${input.localId}`);
  if (input.costCenterId) plannedPredicates.push(sql`p."costCenterId"=${input.costCenterId}`);
  const plannedOrigin = sql`FROM "SstPlannedShift" s JOIN "HrEmployeeFunctionalPeriod" p ON p."employeeId"=s."employeeId" AND p."budgetUnitId"=s."budgetUnitId" AND p."startsAt"<LEAST(s."endsAt",${input.until}) AND p."endsAt">GREATEST(s."startsAt",${input.from}) AND NOT p.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) JOIN "HrBudgetUnitEntityMapping" m ON m."budgetUnitId"=p."budgetUnitId" AND m."governmentEntityId"=p."governmentEntityId"`;
  const plannedWhere = sql.join(plannedPredicates, sql` AND `);
  const [plannedCount] = await sstRows<{ total: number }>(database, sql`SELECT count(*)::int AS total ${plannedOrigin} WHERE ${plannedWhere}`);
  if (plannedCount.total > 50000) throw new SstValidationError("Restrinja o período: há mais de 50.000 turnos/períodos planejados.");
  const planned: PlannedRow[] = (await sstRows<Omit<PlannedRow, "startsAt" | "endsAt"> & { startsAt: string; endsAt: string }>(database, sql`SELECT s."employeeId",GREATEST(s."startsAt",p."startsAt",${input.from}) AS "startsAt",LEAST(s."endsAt",p."endsAt",${input.until}) AS "endsAt",e.name AS "employeeName" ${plannedOrigin} JOIN "Employee" e ON e.id=s."employeeId" WHERE ${plannedWhere} ORDER BY s."startsAt",s.id,p.id LIMIT 50000`)).map(row => ({ ...row, startsAt: sstTimestamp(row.startsAt), endsAt: sstTimestamp(row.endsAt) }));
  const [unverifiedPlanned] = await sstRows<{ total: number }>(database, sql`SELECT count(*)::int AS total FROM "SstPlannedShift" s WHERE s."budgetUnitId"=${input.budgetUnitId} AND s."startsAt"<${input.until} AND s."endsAt">${input.from} ${input.employeeId ? sql`AND s."employeeId"=${input.employeeId}` : sql``} AND NOT COALESCE((SELECT range_agg(tsrange(p."startsAt",p."endsAt",'[)')) @> tsrange(GREATEST(s."startsAt",${input.from}),LEAST(s."endsAt",${input.until}),'[)') FROM "HrEmployeeFunctionalPeriod" p JOIN "HrBudgetUnitEntityMapping" m ON m."budgetUnitId"=p."budgetUnitId" AND m."governmentEntityId"=p."governmentEntityId" WHERE p."employeeId"=s."employeeId" AND p."budgetUnitId"=s."budgetUnitId" AND NOT p.voided AND NOT EXISTS(SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)),false)`);
  const employees = [...new Set([...analytical.map((item) => item.employeeId), ...planned.map((item) => item.employeeId)])];
  const clipped = (value: { startsAt: Date; endsAt: Date }) => ({ start: new Date(Math.max(value.startsAt.getTime(), input.from.getTime())), end: new Date(Math.min(value.endsAt.getTime(), input.until.getTime())) });
  const statistics = employees.map((employeeId) => {
    const certificates = analytical.filter((item) => item.employeeId === employeeId);
    const accepted = certificates.filter((item) => item.status === "APPROVED" && !!item.functionalPeriodId);
    const minutes = absenceMinutes(planned.filter((item) => item.employeeId === employeeId).map(clipped), accepted.map(clipped));
    const acceptedCalendarDays = absenceMinutes([{ start: input.from, end: input.until }], accepted.map(clipped)).absentMinutes / 1440;
    return { employeeId, name: certificates[0]?.employeeName || planned.find((item) => item.employeeId === employeeId)!.employeeName, ...minutes, acceptedCalendarDays, certificateCount: certificates.length };
  });
  const cidCounts: Record<string, number> = {};
  for (const record of analytical) for (const cid of new Set(record.cidCodes)) cidCounts[cid] = (cidCounts[cid] || 0) + 1;
  const people = new Map(analytical.map((record) => [record.employeeId, record.birthDate]));
  const ages = [...people.values()].flatMap((birthDate) => birthDate && birthDate < input.until ? [(input.until.getTime() - birthDate.getTime()) / (365.2425 * 86400000)] : []);
  return { records: rows.map((r) => ({ ...r, employee: { name: r.employeeName, registration: r.registration, person: { birthDate: r.birthDate } }, issuer: { fullName: r.issuerName }, reason: { name: r.reasonName } })), statistics, cidCounts, total: count.total, page,
    meanAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
    missingHistoricalSourceCount: analytical.filter((r) => !r.functionalPeriodId).length,
    unverifiedPlannedShiftCount: unverifiedPlanned.total,
    methodology: "AUTHORIZED_HISTORICAL_UG_PLANNED_INTERVAL_UNION" as const };
}
