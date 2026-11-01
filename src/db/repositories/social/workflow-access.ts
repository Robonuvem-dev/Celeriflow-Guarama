import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type { DatabaseTransaction } from "../../transaction";
import { employees } from "../../schema/administration";
import { people } from "../../schema/people";
import { socialFamilies, socialProfessionalLinks } from "../../schema/social";
import { socialCaseFiles } from "../../schema/social-operation-models";
import { assertSocialUnitAccess, type SocialAccess } from "@/lib/social/access-policy";

export async function requireSocialProfessional(tx: DatabaseTransaction, access: SocialAccess, employeeId: string, unitId: string, on: string, mustMatchActor = true) {
  assertSocialUnitAccess(access, unitId);
  if (mustMatchActor && !access.administrator && employeeId !== access.employeeId) throw new Error("Selecione o profissional autenticado.");
  const day = new Date(`${on}T00:00:00Z`);
  const rows = await tx.select({ id: socialProfessionalLinks.id }).from(socialProfessionalLinks).innerJoin(employees, eq(employees.id, socialProfessionalLinks.employeeId)).where(and(eq(socialProfessionalLinks.employeeId, employeeId), eq(socialProfessionalLinks.unitId, unitId), eq(socialProfessionalLinks.isActive, true), eq(employees.isActive, true), lte(socialProfessionalLinks.startsAt, day), or(isNull(socialProfessionalLinks.endsAt), gte(socialProfessionalLinks.endsAt, day))));
  if (!rows.length) throw new Error("Profissional sem vínculo vigente na unidade/data informada.");
}
export async function socialSubject(tx: DatabaseTransaction, familyId: string, personId: string) {
  if (Boolean(familyId) === Boolean(personId)) throw new Error("Informe uma família ou um indivíduo, exclusivamente.");
  if (familyId && !(await tx.select({ id: socialFamilies.id }).from(socialFamilies).where(and(eq(socialFamilies.id, familyId), eq(socialFamilies.status, "Ativo")))).length) throw new Error("Família inexistente ou inativa.");
  if (personId && !(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, personId), eq(people.status, "Ativo")))).length) throw new Error("Pessoa inexistente ou inativa.");
}
export function socialCaseFileWhere(access: SocialAccess) {
  if (access.administrator) return sql`true`;
  if (!access.links.length || !access.employeeId) return sql`false`;
  return or(...access.links.map(link => and(eq(socialCaseFiles.unitId, link.unitId), or(eq(socialCaseFiles.professionalId, access.employeeId!), and(eq(socialCaseFiles.secrecyLevel, "Normal"), or(and(sql`${socialCaseFiles.personId} IS NOT NULL`, link.individualScope === "OWN" ? sql`false` : sql`true`), and(sql`${socialCaseFiles.familyId} IS NOT NULL`, link.familyScope === "OWN" ? sql`false` : sql`true`)))))))!;
}
