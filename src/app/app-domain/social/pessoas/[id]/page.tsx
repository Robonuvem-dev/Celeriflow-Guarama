import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import SocialPersonClient from "./SocialPersonClient";
import { db } from "@/db/client";
import { findSocialPerson, listSocialFacts, listSocialFinancialEntries, listSocialCatalogs, socialPersonAttendances, socialAccessibleUnitOptions } from "@/db/repositories/social/queries";

export default async function SocialPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getTenantContextForModule("SOCIAL");
  const access = await resolveSocialAccess(context);
  if (!access.administrator && !access.links.length) notFound();
  const database = context.database ?? db;
  const person = await findSocialPerson(database, id);
  if (!person) notFound();
  const [facts, entries, catalogs, units, attendances] = await Promise.all([
    listSocialFacts(database, access, id), listSocialFinancialEntries(database, access, id),
    listSocialCatalogs(database, ["VULNERABILITY", "POTENTIALITY", "INCOME", "EXPENSE"]).then(rows => rows.map(({ id, kind, name }) => ({ id, kind, name }))),
    socialAccessibleUnitOptions(database, access),
    socialPersonAttendances(database, access, id),
  ]);
  return <SocialPersonClient person={{ ...person, birthDate: person.birthDate?.toISOString().slice(0, 10) || "", socialProfile: person.socialProfile ? { nis: person.socialProfile.nis || "", genderIdentity: person.socialProfile.genderIdentity || "", sexualOrientation: person.socialProfile.sexualOrientation || "", workSituation: person.socialProfile.workSituation || "", occupation: person.socialProfile.occupation || "", workplace: person.socialProfile.workplace || "", admittedAt: person.socialProfile.admittedAt?.toISOString().slice(0, 10) || "" } : null }} facts={facts.map((fact) => ({ id: fact.id, kind: fact.kind, name: fact.catalog.name, unit: fact.unit.name, identifiedAt: fact.identifiedAt.toISOString().slice(0, 10), endedAt: fact.endedAt?.toISOString().slice(0, 10) || "", observations: fact.observations || "", endingReason: fact.endingReason || "" }))} entries={entries.map((entry) => ({ id: entry.id, kind: entry.kind, name: entry.catalog.name, unit: entry.unit.name, competence: entry.competence.toISOString().slice(0, 7), value: entry.value.toString(), observations: entry.observations || "", employmentDescription: entry.employmentDescription || "", cancelled: Boolean(entry.cancelledAt), cancellationReason: entry.cancellationReason || "" }))} attendances={attendances.map((attendance) => ({ ...attendance, date: attendance.date.toISOString(), unit: attendance.unit.name }))} catalogs={catalogs} units={units} />;
}
