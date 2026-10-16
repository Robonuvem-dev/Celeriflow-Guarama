import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import SocialModelsClient from "./SocialModelsClient";

export default async function SocialModelsPage() {
  const { prisma } = await getTenantContextForModuleOperation("SOCIAL", "issueReports");
  const institution = await prisma.institution.findFirst({ select: { name: true, legalName: true, city: true, state: true, phone: true, email: true } });
  return <SocialModelsClient institution={{ name: institution?.name || institution?.legalName || "Prefeitura Municipal de Ibema", city: institution?.city || "Ibema", state: institution?.state || "PR", phone: institution?.phone || "", email: institution?.email || "" }} />;
}
