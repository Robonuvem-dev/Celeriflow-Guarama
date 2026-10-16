import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import ReferralClient from "./ReferralClient";

export default async function SocialReferralsPage() {
  const context = await getTenantContextForModule("SOCIAL");
  const access = await resolveSocialAccess(context);
  const unitIds = access.links.map((link) => link.unitId);
  const [referrals, organizations, units, people, families, catalogs] = await Promise.all([
    context.prisma.socialReferral.findMany({ where: access.administrator ? {} : { unitId: { in: unitIds } }, include: { unit: { select: { name: true } }, destinationOrganization: { select: { name: true, usesCounterReference: true } } }, orderBy: { referredAt: "desc" } }),
    context.prisma.socialNetworkOrganization.findMany({ orderBy: { name: "asc" } }),
    context.prisma.socialUnit.findMany({ where: { isActive: true, ...(access.administrator ? {} : { id: { in: unitIds } }) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    context.prisma.person.findMany({ where: { status: "Ativo", ...(!access.administrator && !unitIds.length ? { id: { in: [] } } : {}) }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
    context.prisma.socialFamily.findMany({ where: { status: "Ativo", ...(!access.administrator && !unitIds.length ? { id: { in: [] } } : {}) }, select: { id: true, representative: { select: { fullName: true } } }, orderBy: { representative: { fullName: "asc" } } }),
    context.prisma.socialCatalogEntry.findMany({ where: { isActive: true, kind: { in: ["REFERRAL_REASON", "PRIORITY"] } }, select: { id: true, name: true, kind: true }, orderBy: { name: "asc" } }),
  ]);
  const personNames = new Map(people.map((person) => [person.id, person.fullName]));
  const familyNames = new Map(families.map((family) => [family.id, family.representative.fullName]));
  return <ReferralClient rows={referrals.map((item) => ({ id: item.id, subject: item.personId ? personNames.get(item.personId) || "Pessoa" : familyNames.get(item.familyId || "") || "Família", unit: item.unit.name, destination: item.destinationOrganization.name, date: item.referredAt.toISOString().slice(0, 10), status: item.status, objective: item.objective, observations: item.observations || "", referenceProfessional: item.referenceProfessional || "", counterReferenceAt: item.counterReferenceAt?.toISOString().slice(0, 10) || "", counterReferenceProfessional: item.counterReferenceProfessional || "", counterReferenceDescription: item.counterReferenceDescription || "", canReturn: item.status === "OPEN" && item.destinationOrganization.usesCounterReference }))} organizations={organizations.map(({ id, name, taxId, organizationType, address, phone, email, usesCounterReference, isActive }) => ({ id, name, taxId: taxId || "", organizationType, address: address || "", phone: phone || "", email: email || "", usesCounterReference, isActive }))} units={units} people={people.map((item) => ({ id: item.id, name: item.fullName }))} families={families.map((item) => ({ id: item.id, name: item.representative.fullName }))} catalogs={catalogs} />;
}
