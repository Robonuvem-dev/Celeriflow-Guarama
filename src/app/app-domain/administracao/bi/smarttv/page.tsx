import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { getDisplayEditor } from "@/lib/bi/display-service";
import SmartTvEditor from "./SmartTvEditor";

export const dynamic = "force-dynamic";
export default async function SmartTvAdministrationPage() {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  return <SmartTvEditor initial={await getDisplayEditor(context)} canEdit={canPerformModuleOperation(context.user, "ADMINISTRACAO", "update")} canPublish={canPerformModuleOperation(context.user, "ADMINISTRACAO", "issueReports")} />;
}
