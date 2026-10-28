import type { AppContext } from "@/lib/platform/tenant-context";
import { SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";
import { listCurrentSocialLinks } from "@/db/repositories/social/access";
import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { socialAttendances, socialPersonFacts, socialUnits } from "@/db/schema/social";

export type SocialAccess = {
  userId?: string;
  administrator: boolean;
  employeeId: string | null;
  links: { unitId: string; individualScope: string; familyScope: string }[];
};

export async function resolveSocialAccess(context: AppContext): Promise<SocialAccess> {
  const administrator = context.user.profileCode === SYSTEM_ADMIN_PROFILE_CODE;
  const employeeId = context.user.employeeId;
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const database = context.database ?? (await import("@/db/client")).db;
  const links = employeeId ? await listCurrentSocialLinks(database, employeeId, today) : [];
  return { administrator, employeeId, links, userId: context.user.id };
}

export function socialHistoryWhere(access: SocialAccess, columns: { unitId: AnyPgColumn; createdBy: AnyPgColumn } = socialPersonFacts): SQL {
  if (access.administrator) return sql`true`;
  if (!access.links.length) return sql`false`;
  return or(...access.links.map(link => and(eq(columns.unitId, link.unitId), link.individualScope === "OWN" ? eq(columns.createdBy, access.userId || "") : undefined)))!;
}

export function socialAttendanceWhere(access: SocialAccess): SQL {
  if (access.administrator) return sql`true`;
  if (!access.employeeId || !access.links.length) return sql`false`;
  const employeeId = access.employeeId;
  const own = or(eq(socialAttendances.professionalId, employeeId), sql`${employeeId} = ANY(${socialAttendances.involvedProfessionalIds})`);
  const individualUnits = access.links.filter((link) => link.individualScope !== "OWN").map((link) => link.unitId);
  const familyUnits = access.links.filter((link) => link.familyScope !== "OWN").map((link) => link.unitId);
  const individualMunicipal = access.links.some((link) => link.individualScope === "MUNICIPAL");
  const familyMunicipal = access.links.some((link) => link.familyScope === "MUNICIPAL");
  const linked = inArray(socialAttendances.unitId, access.links.map(link => link.unitId));
  return sql`${and(
    or(and(own, linked), and(eq(socialAttendances.secrecyLevel, "Normal"), or(
      and(isNotNull(socialAttendances.personId), individualMunicipal ? undefined : inArray(socialAttendances.unitId, individualUnits)),
      and(isNull(socialAttendances.personId), familyMunicipal ? undefined : inArray(socialAttendances.unitId, familyUnits)),
    ))),
    or(sql`EXISTS (SELECT 1 FROM ${socialUnits} WHERE ${socialUnits.id} = ${socialAttendances.unitId} AND ${socialUnits.isConfidential} = false)`, linked),
  )}`;
}

export function assertSocialUnitAccess(access: SocialAccess, unitId: string) {
  if (!access.administrator && !access.links.some((link) => link.unitId === unitId)) {
    throw new Error("Você não possui vínculo vigente com este equipamento social.");
  }
}
