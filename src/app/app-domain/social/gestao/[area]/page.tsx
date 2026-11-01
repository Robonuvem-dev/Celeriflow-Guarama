import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { readSocialWorkflow } from "@/db/repositories/social/workflow-queries";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { socialWorkflowAreas, type SocialWorkflowArea } from "@/lib/social/workflow-contract";
import { SocialWorkflowClient } from "./SocialWorkflowClient";

export default async function SocialWorkflowPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  if (!Object.hasOwn(socialWorkflowAreas, area)) notFound();
  const context = await getTenantContextForModule("SOCIAL");
  const access = await resolveSocialAccess(context);
  const data = await readSocialWorkflow(context.database ?? db, access, area as SocialWorkflowArea);
  return <SocialWorkflowClient key={area} area={area as SocialWorkflowArea} data={data} />;
}
