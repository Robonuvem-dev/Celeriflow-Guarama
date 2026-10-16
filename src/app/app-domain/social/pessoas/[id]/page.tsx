import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess, socialAttendanceWhere, socialHistoryWhere } from "@/lib/social/access-policy";
import SocialPersonClient from "./SocialPersonClient";

export default async function SocialPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("SOCIAL");
  const access = await resolveSocialAccess(context);
  if (!access.administrator && !access.links.length) notFound();
  const person = await context.prisma.person.findUnique({ where: { id }, select: { id: true, fullName: true, socialName: true, cpf: true, birthDate: true, gender: true, raceColor: true, motherName: true, fatherName: true, educationLevel: true, phonePrimary: true, status: true, socialProfile: true } });
  if (!person) notFound();
  const scope = socialHistoryWhere(access);
  const [facts, entries, catalogs, units, attendances] = await Promise.all([
    context.prisma.socialPersonFact.findMany({ where: { personId: id, ...scope }, include: { catalog: { select: { name: true } }, unit: { select: { name: true } } }, orderBy: [{ identifiedAt: "desc" }, { id: "asc" }] }),
    context.prisma.socialFinancialEntry.findMany({ where: { personId: id, ...scope }, include: { catalog: { select: { name: true } }, unit: { select: { name: true } } }, orderBy: [{ competence: "desc" }, { id: "asc" }] }),
    context.prisma.socialCatalogEntry.findMany({ where: { isActive: true, kind: { in: ["VULNERABILITY", "POTENTIALITY", "INCOME", "EXPENSE"] } }, select: { id: true, kind: true, name: true }, orderBy: { name: "asc" } }),
    context.prisma.socialUnit.findMany({ where: { isActive: true, ...(access.administrator ? {} : { id: { in: access.links.map((link) => link.unitId) } }) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    context.prisma.socialAttendance.findMany({ where: { AND: [{ personId: id }, socialAttendanceWhere(access)] }, select: { id: true, date: true, type: true, description: true, secrecyLevel: true, unit: { select: { name: true } } }, orderBy: { date: "desc" } }),
  ]);
  return <SocialPersonClient person={{ ...person, birthDate: person.birthDate?.toISOString().slice(0, 10) || "", socialProfile: person.socialProfile ? { nis: person.socialProfile.nis || "", genderIdentity: person.socialProfile.genderIdentity || "", sexualOrientation: person.socialProfile.sexualOrientation || "", workSituation: person.socialProfile.workSituation || "", occupation: person.socialProfile.occupation || "", workplace: person.socialProfile.workplace || "", admittedAt: person.socialProfile.admittedAt?.toISOString().slice(0, 10) || "" } : null }} facts={facts.map((fact) => ({ id: fact.id, kind: fact.kind, name: fact.catalog.name, unit: fact.unit.name, identifiedAt: fact.identifiedAt.toISOString().slice(0, 10), endedAt: fact.endedAt?.toISOString().slice(0, 10) || "", observations: fact.observations || "", endingReason: fact.endingReason || "" }))} entries={entries.map((entry) => ({ id: entry.id, kind: entry.kind, name: entry.catalog.name, unit: entry.unit.name, competence: entry.competence.toISOString().slice(0, 7), value: entry.value.toString(), observations: entry.observations || "", employmentDescription: entry.employmentDescription || "", cancelled: Boolean(entry.cancelledAt), cancellationReason: entry.cancellationReason || "" }))} attendances={attendances.map((attendance) => ({ ...attendance, date: attendance.date.toISOString(), unit: attendance.unit.name }))} catalogs={catalogs} units={units} />;
}
