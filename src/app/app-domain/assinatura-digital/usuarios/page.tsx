import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listCentralSigners } from "@/lib/signatures/central-service";
import { serializeSigner } from "./cadastro-model";
import { UsuariosClient } from "./UsuariosClient";

export const dynamic = "force-dynamic";

export default async function CentralUsersPage() {
  const context = await getTenantContextForModule("ASSINATURA_DIGITAL");
  const initialNow = new Date().getTime();
  return <UsuariosClient initialRows={(await listCentralSigners(context)).map(serializeSigner)}
    initialNow={initialNow}
    canCreate={canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", "create")}
    canUpdate={canPerformModuleOperation(context.user, "ASSINATURA_DIGITAL", "update")} />;
}
