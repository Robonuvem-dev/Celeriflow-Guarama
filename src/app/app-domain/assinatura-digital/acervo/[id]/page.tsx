import { notFound } from "next/navigation";
import { getGedContext, canUseGed } from "@/lib/documents/ged-access";
import { readGedDetail } from "@/lib/documents/ged-service";
import { gedSelectors } from "@/db/repositories/documents/ged";
import { gedCapabilities } from "@/lib/documents/ged-policy";
import { getBlobDocumentPrefix } from "@/lib/platform/blob";
import type { GedBootstrap } from "@/lib/contracts/ged";
import { GedDocumentDetail } from "@/components/signatures/ged/GedDocumentDetail";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const context = await getGedContext();
  const { id } = await params;
  const detail = await readGedDetail(context, id).catch(() => null);
  if (!detail) notFound();
  const selectors = await gedSelectors(context);
  const bootstrap: GedBootstrap = { ...selectors, userId: context.user.id, departmentId: context.user.departmentId, documentPrefix: getBlobDocumentPrefix(), capabilities: Object.fromEntries(gedCapabilities.map(key => [key, canUseGed(context.user, key)])) as GedBootstrap["capabilities"] };
  return <GedDocumentDetail initial={detail} bootstrap={bootstrap} />;
}
