import { and, count, desc, eq, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DatabaseExecutor } from "../../transaction";
import type { HealthManagementPeriod } from "@/lib/contracts/health-management-operations";
import { healthEsusForms as forms, healthFamilies as families, healthHouseholds as households, healthMicroareas as microareas, healthTerritoryAreas as areas, healthFamilyMembers as members } from "../../schema/health-territory";
import { diagnosticEsusBatches as batches } from "../../schema/health-diagnostics";
import { patients } from "../../schema/health-registration";
import { people } from "../../schema/people";
import { healthTeams, healthUnits } from "../../schema/health-workforce";
import { managementPeriod, managementUnitScope } from "./common";

export async function readManagementEsusForms(db: DatabaseExecutor, options: { unitIds?: string[]; period?: HealthManagementPeriod; professionalId?: string; teamId?: string }) {
  const citizen = alias(people, "management_esus_citizen");
  const rows = await db.select({ form: getTableColumns(forms), patient: { id: patients.id }, person: { fullName: people.fullName }, citizen: { fullName: citizen.fullName }, unit: { name: healthUnits.name }, team: { name: healthTeams.name }, household: { householdCode: households.householdCode }, family: { familyCode: families.familyCode } }).from(forms).leftJoin(patients, eq(patients.id, forms.patientId)).leftJoin(people, eq(people.id, patients.personId)).leftJoin(citizen, eq(citizen.id, forms.personId)).leftJoin(healthUnits, eq(healthUnits.id, forms.unitId)).leftJoin(healthTeams, eq(healthTeams.id, forms.teamId)).leftJoin(households, eq(households.id, forms.householdId)).leftJoin(families, eq(families.id, forms.familyId))
    .where(and(managementPeriod(forms.createdAt, options.period), managementUnitScope(forms.unitId, options.unitIds), options.professionalId ? eq(forms.professionalId, options.professionalId) : undefined, options.teamId ? eq(forms.teamId, options.teamId) : undefined)).orderBy(desc(forms.createdAt)).limit(2000);
  return rows.map(r => ({ ...r.form, patient: r.patient && r.person ? { person: r.person } : null, person: r.citizen, unit: r.unit, team: r.team, household: r.household, family: r.family }));
}
export function readManagementEsusBatches(db: DatabaseExecutor) {
  return db.select({ competence: batches.competence, status: batches.status, total: batches.total, accepted: batches.accepted, rejected: batches.rejected, createdAt: batches.createdAt }).from(batches).orderBy(desc(batches.createdAt)).limit(100);
}
export async function readManagementFamilies(db: DatabaseExecutor) {
  const rows = await db.select({ family: getTableColumns(families), household: { id: households.id, householdCode: households.householdCode }, microarea: { code: microareas.code }, area: { code: areas.code } }).from(families).leftJoin(households, eq(households.id, families.householdId)).leftJoin(microareas, eq(microareas.id, households.microareaId)).leftJoin(areas, eq(areas.id, microareas.areaId)).orderBy(desc(families.createdAt)).limit(2000);
  const links = rows.length ? await db.select({ id: members.id, familyId: members.familyId }).from(members).where(managementUnitScope(members.familyId, rows.map(r => r.family.id))) : [];
  return rows.map(r => ({ ...r.family, household: r.household ? { ...r.household, microarea: r.microarea && r.area ? { ...r.microarea, area: r.area } : null } : null, members: links.filter(m => m.familyId === r.family.id) }));
}
export function readManagementFamilySizes(db: DatabaseExecutor) {
  return db.select({ familyId: members.familyId, _count: count() }).from(members).groupBy(members.familyId);
}
