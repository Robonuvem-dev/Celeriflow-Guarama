import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { readSocialWorkflow } from "@/db/repositories/social/workflow-queries";
import { db } from "@/db/client";
import { SocialUploadClient } from "./SocialUploadClient";
export default async function SocialUploadPage() {
  const context = await getTenantContextForModule("SOCIAL"), access = await resolveSocialAccess(context);
  const data = await readSocialWorkflow(context.database ?? db, access, "anexos");
  return <SocialUploadClient options={data.options} />;
}
