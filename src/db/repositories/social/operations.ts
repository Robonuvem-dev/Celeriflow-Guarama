import { and, eq, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { families, familyMembers } from "../../schema/master-data";
import { people } from "../../schema/people";
import { employees } from "../../schema/administration";
import { realEstates } from "../../schema/registry";
import { socialAttendances, socialFamilies, socialFamilyMembers, socialUnits } from "../../schema/social";
import type { SocialAttendanceRecord, SocialFamilyDetails, SocialFamilyRecord, SocialUnitDetails, SocialUnitRecord } from "@/lib/contracts/social";
import type { PersonRecord } from "@/lib/contracts/registry";
import type { EmployeeRecord } from "@/lib/contracts/administration";
import { socialAttendanceWhere, type SocialAccess } from "@/lib/social/access-policy";

export type SocialFamilyInput = { representativeId: string; nis?: string; familyCode?: string; income?: number; perCapitaIncome?: number; vulnerabilities?: string };

export async function findSocialUnitDetails(database: DatabaseExecutor, id: string): Promise<SocialUnitDetails> {
  const [row] = await database.select({ unit: socialUnits, manager: employees, realEstate: realEstates }).from(socialUnits).leftJoin(employees, eq(employees.id, socialUnits.managerId)).leftJoin(realEstates, eq(realEstates.id, socialUnits.realEstateId)).where(eq(socialUnits.id, id));
  if (!row) throw new Error("Equipamento inexistente.");
  return { ...row.unit, manager: row.manager, realEstate: row.realEstate };
}

export async function findSocialFamilyDetails(database: DatabaseExecutor, id: string): Promise<SocialFamilyDetails> {
  const [row] = await database.select({ family: socialFamilies, representative: people }).from(socialFamilies).innerJoin(people, eq(people.id, socialFamilies.representativeId)).where(eq(socialFamilies.id, id));
  if (!row) throw new Error("Família não encontrada.");
  const members = await database.select().from(socialFamilyMembers).where(eq(socialFamilyMembers.familyId, id));
  return { ...row.family, representative: row.representative, members };
}

export async function saveSocialFamilyInTransaction(tx: DatabaseTransaction, data: SocialFamilyInput, id?: string): Promise<SocialFamilyDetails> {
  const familyCode = data.familyCode?.trim() || null;
  const [person] = await tx.select({ id: people.id }).from(people).where(and(eq(people.id, data.representativeId), ne(people.status, "Inativo")));
  if (!person) throw new Error("Responsável não encontrado ou inativo.");
  let masterFamilyId: string | null = null;
  if (id) {
    const [current] = await tx.select({ masterFamilyId: socialFamilies.masterFamilyId }).from(socialFamilies).where(eq(socialFamilies.id, id));
    if (!current) throw new Error("Família não encontrada.");
    masterFamilyId = current.masterFamilyId;
  }
  if (!masterFamilyId && familyCode) {
    const [candidate] = await tx.select({ family: families, profileId: socialFamilies.id }).from(families).leftJoin(socialFamilies, eq(socialFamilies.masterFamilyId, families.id)).where(eq(families.code, familyCode));
    if (candidate?.profileId && candidate.profileId !== id) throw new Error("O código familiar já está vinculado a outro cadastro social.");
    if (candidate?.family.responsiblePersonId && candidate.family.responsiblePersonId !== data.representativeId) throw new Error("O código familiar pertence a outro responsável.");
    masterFamilyId = candidate?.family.id ?? null;
  }
  const [masterFamily] = masterFamilyId
    ? await tx.update(families).set({ ...(id ? { code: familyCode } : {}), responsiblePersonId: data.representativeId, status: "ATIVA" }).where(eq(families.id, masterFamilyId)).returning({ id: families.id })
    : await tx.insert(families).values({ code: familyCode, responsiblePersonId: data.representativeId }).returning({ id: families.id });
  if (!masterFamily) throw new Error("Família canônica não encontrada.");
  if (id) await tx.update(familyMembers).set({ isRepresentative: false }).where(and(eq(familyMembers.familyId, masterFamily.id), eq(familyMembers.isRepresentative, true), ne(familyMembers.personId, data.representativeId)));
  await tx.insert(familyMembers).values({ familyId: masterFamily.id, personId: data.representativeId, kinship: "RESPONSAVEL", isRepresentative: true }).onConflictDoUpdate({ target: [familyMembers.familyId, familyMembers.personId], set: { isRepresentative: true, status: "ATIVO", leftAt: null } });
  const values = { representativeId: data.representativeId, masterFamilyId: masterFamily.id, nis: data.nis, familyCode, income: data.income ? Number(data.income) : null, perCapitaIncome: data.perCapitaIncome ? Number(data.perCapitaIncome) : null, vulnerabilities: data.vulnerabilities };
  const [saved] = id ? await tx.update(socialFamilies).set(values).where(eq(socialFamilies.id, id)).returning({ id: socialFamilies.id }) : await tx.insert(socialFamilies).values(values).returning({ id: socialFamilies.id });
  if (!saved) throw new Error("Família não encontrada.");
  return findSocialFamilyDetails(tx, saved.id);
}

export async function setSocialFamilyStatusInTransaction(tx: DatabaseTransaction, id: string, status: string): Promise<SocialFamilyDetails & { masterFamily: { id: string; healthProfile: { isActive: boolean } | null } | null }> {
  const [updated] = await tx.update(socialFamilies).set({ status }).where(eq(socialFamilies.id, id)).returning();
  if (!updated) throw new Error("Família não encontrada.");
  let masterFamily: { id: string; healthProfile: { isActive: boolean } | null } | null = null;
  if (updated.masterFamilyId) {
    const result = await tx.execute<{ id: string; isActive: boolean | null }>(sql`SELECT f.id, h."isActive" FROM "Family" f LEFT JOIN "HealthFamily" h ON h."masterFamilyId"=f.id WHERE f.id=${updated.masterFamilyId}`);
    const row = result.rows[0];
    if (row) {
      masterFamily = { id: row.id, healthProfile: row.isActive === null ? null : { isActive: row.isActive } };
      await tx.update(families).set({ status: status === "Ativo" || row.isActive === true ? "ATIVA" : "INATIVA" }).where(eq(families.id, row.id));
    }
  }
  return { ...await findSocialFamilyDetails(tx, id), masterFamily };
}

export async function findAccessibleSocialAttendance(database: DatabaseExecutor, access: SocialAccess, id: string): Promise<SocialAttendanceRecord | null> {
  const [row] = await database.select().from(socialAttendances).where(and(eq(socialAttendances.id, id), socialAttendanceWhere(access)));
  return row ?? null;
}

export async function findSocialAttendanceMutationResult(database: DatabaseExecutor, id: string): Promise<SocialAttendanceRecord & { family: SocialFamilyRecord; person: PersonRecord | null; professional: EmployeeRecord; unit: SocialUnitRecord }> {
  const [row] = await database.select({ attendance: socialAttendances, family: socialFamilies, person: people, professional: employees, unit: socialUnits }).from(socialAttendances).innerJoin(socialFamilies, eq(socialFamilies.id, socialAttendances.familyId)).leftJoin(people, eq(people.id, socialAttendances.personId)).innerJoin(employees, eq(employees.id, socialAttendances.professionalId)).innerJoin(socialUnits, eq(socialUnits.id, socialAttendances.unitId)).where(eq(socialAttendances.id, id));
  if (!row) throw new Error("Atendimento não encontrado.");
  return { ...row.attendance, family: row.family, person: row.person, professional: row.professional, unit: row.unit };
}
