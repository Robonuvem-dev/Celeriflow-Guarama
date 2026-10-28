import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import SocialModelsClient from "./SocialModelsClient";
import { db } from "@/db/client";
import { findSocialInstitution } from "@/db/repositories/social/queries";

export default async function SocialModelsPage() {
  const context = await getTenantContextForModuleOperation("SOCIAL", "issueReports");
  const institution = await findSocialInstitution(context.database ?? db);
  return <SocialModelsClient institution={{ name: institution?.name || institution?.legalName || "Prefeitura Municipal de Ibema", city: institution?.city || "Ibema", state: institution?.state || "PR", phone: institution?.phone || "", email: institution?.email || "" }} />;
}
