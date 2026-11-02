import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getGedContext } from "@/lib/documents/ged-access";
import { LegalDocumentsView } from "./LegalDocumentsView";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await getTenantContextForModule("CADASTROS");
  await getGedContext("read");
  const raw = await searchParams;
  const values = Object.fromEntries(Object.entries(raw).filter((v): v is [string, string] => typeof v[1] === "string"));
  return <LegalDocumentsView query={values} canBind={canPerformModuleOperation(actor.user, "CADASTROS", "update")} />;
}
