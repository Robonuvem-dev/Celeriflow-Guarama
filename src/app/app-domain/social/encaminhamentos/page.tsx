import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import ReferralClient from "./ReferralClient";
import { db } from "@/db/client";
import { listSocialReferrals, listSocialOrganizations, listSocialCatalogs, socialAttendanceOptions, socialReferralOptions } from "@/db/repositories/social/queries";

export default async function SocialReferralsPage() {
  const context = await getTenantContextForModule("SOCIAL");
  const access = await resolveSocialAccess(context);
  const database = context.database ?? db;
  const [referrals, organizations, units, people, families, catalogs] = await Promise.all([
    listSocialReferrals(database, access), listSocialOrganizations(database),
    socialAttendanceOptions(database, access).then(rows => rows.units),
    socialReferralOptions(database, access).then(rows => rows.people),
    socialReferralOptions(database, access).then(rows => rows.families),
    listSocialCatalogs(database, ["REFERRAL_REASON", "PRIORITY"]).then(rows => rows.map(({ id, name, kind }) => ({ id, name, kind }))),
  ]);
  const personNames = new Map(people.map((person) => [person.id, person.fullName]));
  const familyNames = new Map(families.map((family) => [family.id, family.representative.fullName]));
  return <ReferralClient rows={referrals.map((item) => ({ id: item.id, subject: item.personId ? personNames.get(item.personId) || "Pessoa" : familyNames.get(item.familyId || "") || "Família", unit: item.unit.name, destination: item.destinationOrganization.name, date: item.referredAt.toISOString().slice(0, 10), status: item.status, objective: item.objective, observations: item.observations || "", referenceProfessional: item.referenceProfessional || "", counterReferenceAt: item.counterReferenceAt?.toISOString().slice(0, 10) || "", counterReferenceProfessional: item.counterReferenceProfessional || "", counterReferenceDescription: item.counterReferenceDescription || "", canReturn: item.status === "OPEN" && item.destinationOrganization.usesCounterReference }))} organizations={organizations.map(({ id, name, taxId, organizationType, address, phone, email, usesCounterReference, isActive }) => ({ id, name, taxId: taxId || "", organizationType, address: address || "", phone: phone || "", email: email || "", usesCounterReference, isActive }))} units={units} people={people.map((item) => ({ id: item.id, name: item.fullName }))} families={families.map((item) => ({ id: item.id, name: item.representative.fullName }))} catalogs={catalogs} />;
}
