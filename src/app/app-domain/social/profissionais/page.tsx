import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import SocialProfessionalsClient from "./SocialProfessionalsClient";

export default async function SocialProfessionalsPage() {
  const { prisma } = await getTenantContextForSystemAdministration();
  const [links, employees, units] = await Promise.all([
    prisma.socialProfessionalLink.findMany({ include: { employee: { select: { name: true } }, unit: { select: { name: true } } }, orderBy: [{ employee: { name: "asc" } }, { unit: { name: "asc" } }] }),
    prisma.employee.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.socialUnit.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <SocialProfessionalsClient links={links.map((link) => ({ ...link, startsAt: link.startsAt.toISOString().slice(0, 10), endsAt: link.endsAt?.toISOString().slice(0, 10) || "", createdAt: undefined, updatedAt: undefined }))} employees={employees} units={units} />;
}
