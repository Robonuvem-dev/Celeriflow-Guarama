import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { gedSmartFolders } from "@/db/schema/ged-management";
import { gedSelectors, listGedSection } from "@/db/repositories/documents/ged";
import { canUseGed, getGedContext } from "@/lib/documents/ged-access";
import { gedCapabilities, gedQuerySchema } from "@/lib/documents/ged-policy";
import { getBlobDocumentPrefix } from "@/lib/platform/blob";
import type { GedBootstrap, GedSection } from "@/lib/contracts/ged";
import { GedWorkspace } from "./GedWorkspace";

export type GedPageSearch = Promise<Record<string, string | string[] | undefined>>;
export async function GedSectionPage({ section, searchParams }: { section: GedSection; searchParams: GedPageSearch }) {
  const context = await getGedContext();
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  let query = gedQuerySchema.parse({ text: value("text"), mode: value("mode") || "words", distance: value("distance") || 5, thesaurus: value("thesaurus") === "true", status: value("status"), folderId: value("folderId") });
  if (value("smartId")) {
    const [folder] = await (context.database ?? db).select().from(gedSmartFolders).where(eq(gedSmartFolders.id, value("smartId")));
    if (!folder || (!folder.shared && folder.ownerId !== context.user.id)) throw new Error("Pasta inteligente não encontrada.");
    query = gedQuerySchema.parse(folder.query);
  }
  const page = Math.max(1, Number(value("page")) || 1);
  const [selectors, initial] = await Promise.all([gedSelectors({ ...context, database: context.database ?? db }), listGedSection(context, section, query, page)]);
  const bootstrap: GedBootstrap = { ...selectors, userId: context.user.id, departmentId: context.user.departmentId, documentPrefix: getBlobDocumentPrefix(), capabilities: Object.fromEntries(gedCapabilities.map(key => [key, canUseGed(context.user, key)])) as GedBootstrap["capabilities"] };
  return <GedWorkspace key={`${section}:${JSON.stringify(params)}`} section={section} bootstrap={bootstrap} initial={initial} initialSmartId={value("smartId")} />;
}
