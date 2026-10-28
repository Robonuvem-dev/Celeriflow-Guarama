import { and, asc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { databaseTimestamp } from "@/db/temporal";
import { hrEmploymentRegimes } from "@/db/schema/personnel-configuration";
import { administrativeUnits, departments, employees, roles } from "@/db/schema/administration";
import { costCenters, governmentEntities } from "@/db/schema/master-data";
import { sstCertificateReasons } from "@/db/schema/sst-certificates";
import { sstExposureGroups, sstProgramGroups, sstPrograms } from "@/db/schema/sst-programs";
import { materials } from "@/db/schema/assets-stock";
import type { SstPageOption, SstPageUnit, SstProgramGroupPageDto, SstProgramPageDto } from "@/lib/contracts/sst-pages";

export async function readSstFunctionalOptions(database: DatabaseExecutor, unit: SstPageUnit | undefined, q: string | undefined, admin: boolean): Promise<{
  regimes: (SstPageOption & { code: string })[]; departments: SstPageOption[]; locals: SstPageOption[];
  centers: SstPageOption[]; roles: SstPageOption[]; employees: (SstPageOption & { registration: string | null })[];
  entities: SstPageOption[]; reasons: SstPageOption[]; mapping: { governmentEntityId: string }[];
}> {
  const [regimes, departmentOptions, locals, centers, roleOptions, workers, entities, reasons] = await Promise.all([
    database.select({ id: hrEmploymentRegimes.id, name: hrEmploymentRegimes.name, code: hrEmploymentRegimes.code }).from(hrEmploymentRegimes).where(eq(hrEmploymentRegimes.isActive, true)).orderBy(asc(hrEmploymentRegimes.name), asc(hrEmploymentRegimes.id)),
    unit ? database.select({ id: departments.id, name: departments.name }).from(departments).where(and(eq(departments.secretariatId, unit.secretariatId), eq(departments.isActive, true))).orderBy(asc(departments.name), asc(departments.id)) : [],
    unit ? database.select({ id: administrativeUnits.id, name: administrativeUnits.name }).from(administrativeUnits).where(and(eq(administrativeUnits.secretariatId, unit.secretariatId), eq(administrativeUnits.isActive, true))).orderBy(asc(administrativeUnits.name), asc(administrativeUnits.id)) : [],
    unit ? database.select({ id: costCenters.id, name: costCenters.name }).from(costCenters).where(and(eq(costCenters.secretariatId, unit.secretariatId), eq(costCenters.isActive, true))).orderBy(asc(costCenters.name), asc(costCenters.id)) : [],
    database.select({ id: roles.id, name: roles.name }).from(roles).where(eq(roles.isActive, true)).orderBy(asc(roles.name), asc(roles.id)),
    unit && q && q.trim().length >= 3 ? database.select({ id: employees.id, name: employees.name, registration: employees.registration }).from(employees).where(and(eq(employees.secretariatId, unit.secretariatId), ilike(employees.name, `%${q.trim()}%`))).orderBy(asc(employees.name), asc(employees.id)).limit(20) : [],
    admin ? database.select({ id: governmentEntities.id, name: governmentEntities.name }).from(governmentEntities).where(eq(governmentEntities.status, "ATIVA")) : [],
    unit ? database.select({ id: sstCertificateReasons.id, name: sstCertificateReasons.name }).from(sstCertificateReasons).where(eq(sstCertificateReasons.budgetUnitId, unit.id)) : [],
  ]);
  const mapping = unit ? (await database.execute<{ governmentEntityId: string }>(sql`SELECT "governmentEntityId" FROM "HrBudgetUnitEntityMapping" WHERE "budgetUnitId"=${unit.id}`)).rows : [];
  return { regimes, departments: departmentOptions, locals, centers, roles: roleOptions, employees: workers, entities, reasons, mapping };
}
export async function readSstServiceOrderOptions(database: DatabaseExecutor, unitId: string | undefined, params: { responsibilityPage?: string; materialQ?: string }): Promise<{
  responsibilityCount: { total: number }; responsibilityPage: number; groups: SstPageOption[];
  programGroups: (SstProgramGroupPageDto & { program: SstProgramPageDto; group: { name: string } })[];
  materials: SstPageOption[];
  responsibilities: { id: string; kind: string; snapshot: { personName: string }; startsAt: Date; endsAt: Date; revoked: boolean }[];
}> {
  const [responsibilityCount] = unitId ? (await database.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "SstTechnicalResponsibility" WHERE "budgetUnitId"=${unitId}`)).rows : [{ total: 0 }];
  const responsibilityPage = Math.min(Math.max(1, Math.trunc(Number(params.responsibilityPage)) || 1), Math.max(1, Math.ceil(responsibilityCount.total / 20)));
  const [groups, programGroups, materialOptions, responsibilities] = await Promise.all([
    unitId ? database.select({ id: sstExposureGroups.id, name: sstExposureGroups.name }).from(sstExposureGroups).where(eq(sstExposureGroups.budgetUnitId, unitId)) : [],
    unitId ? database.select({ version: sstProgramGroups, program: sstPrograms, group: { name: sstExposureGroups.name } }).from(sstProgramGroups).innerJoin(sstPrograms, eq(sstPrograms.id, sstProgramGroups.programId)).innerJoin(sstExposureGroups, eq(sstExposureGroups.id, sstProgramGroups.groupId)).where(and(eq(sstPrograms.budgetUnitId, unitId), inArray(sstPrograms.kind, ["PGR", "LTCAT"]))).orderBy(asc(sstProgramGroups.id)).then(rows => rows.map(row => ({ ...row.version, program: row.program, group: row.group }))) : [],
    params.materialQ && params.materialQ.trim().length >= 3 ? database.select({ id: materials.id, name: materials.name }).from(materials).where(and(eq(materials.isActive, true), ilike(materials.name, `%${params.materialQ.trim()}%`))).orderBy(asc(materials.name), asc(materials.id)).limit(20) : [],
    unitId ? database.execute<{ id: string; kind: string; snapshot: { personName: string }; startsAt: string | Date; endsAt: string | Date; revoked: boolean }>(sql`SELECT r.id,r.kind,r.snapshot,r."startsAt",r."endsAt",EXISTS(SELECT 1 FROM "SstFoundationalRevocation" v WHERE v."responsibilityId"=r.id) AS revoked FROM "SstTechnicalResponsibility" r WHERE r."budgetUnitId"=${unitId} ORDER BY r."startsAt" DESC,r.id LIMIT 20 OFFSET ${(responsibilityPage - 1) * 20}`).then(result => result.rows.map(row => ({ ...row, startsAt: databaseTimestamp(row.startsAt), endsAt: databaseTimestamp(row.endsAt) }))) : [],
  ]);
  return { responsibilityCount, responsibilityPage, groups, programGroups, materials: materialOptions, responsibilities };
}
