import type { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";

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
  const links = employeeId ? await context.prisma.socialProfessionalLink.findMany({
    where: { employeeId, isActive: true, employee: { isActive: true }, unit: { isActive: true }, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }] },
    select: { unitId: true, individualScope: true, familyScope: true },
  }) : [];
  return { administrator, employeeId, links, userId: context.user.id };
}

export function socialHistoryWhere(access: SocialAccess): { OR?: { unitId: string; createdBy?: string }[] } {
  if (access.administrator) return {};
  return { OR: access.links.map((link) => ({ unitId: link.unitId, ...(link.individualScope === "OWN" ? { createdBy: access.userId || "" } : {}) })) };
}

export function socialAttendanceWhere(access: SocialAccess): Prisma.SocialAttendanceWhereInput {
  if (access.administrator) return {};
  if (!access.employeeId || !access.links.length) return { id: { in: [] } };
  const employeeId = access.employeeId;
  const own = { OR: [{ professionalId: employeeId }, { involvedProfessionalIds: { has: employeeId } }] };
  const individualUnits = access.links.filter((link) => link.individualScope !== "OWN").map((link) => link.unitId);
  const familyUnits = access.links.filter((link) => link.familyScope !== "OWN").map((link) => link.unitId);
  const individualMunicipal = access.links.some((link) => link.individualScope === "MUNICIPAL");
  const familyMunicipal = access.links.some((link) => link.familyScope === "MUNICIPAL");
  return { AND: [
    { OR: [
      { AND: [own, { unitId: { in: access.links.map((link) => link.unitId) } }] },
      { AND: [{ secrecyLevel: "Normal" }, { OR: [
        { personId: { not: null }, ...(individualMunicipal ? {} : { unitId: { in: individualUnits } }) },
        { personId: null, ...(familyMunicipal ? {} : { unitId: { in: familyUnits } }) },
      ] }] },
    ] },
    { OR: [{ unit: { isConfidential: false } }, { unitId: { in: access.links.map((link) => link.unitId) } }] },
  ] };
}

export function assertSocialUnitAccess(access: SocialAccess, unitId: string) {
  if (!access.administrator && !access.links.some((link) => link.unitId === unitId)) {
    throw new Error("Você não possui vínculo vigente com este equipamento social.");
  }
}
