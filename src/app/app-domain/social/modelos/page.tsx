import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { redirect } from "next/navigation";

export default async function SocialModelsPage() {
  await getTenantContextForModuleOperation("SOCIAL", "issueReports");
  redirect("/social/gestao/documentos");
}
