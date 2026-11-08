import {
  canShowDashboardCard,
  canViewModule,
  getOptionalTenantContext,
  isModuleBlockedForUser,
} from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { listModuleActivations } from "@/db/repositories/platform/identity";
import { PageFrame } from "@/components/app-ui/PageFrame";
import styles from "./dashboard.module.css";
import { compareDashboardCards } from "@/lib/platform/dashboard-order";
import { canUseGed } from "@/lib/documents/ged-access";
import { allDashboardModules } from "./dashboard-modules";
import { DashboardClient, type DashboardCardData } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function PainelPage() {
  const context = await getOptionalTenantContext();
  const moduleActivationByCode = new Map<string, boolean>();

  try {
    const modulos = context ? await listModuleActivations(context.database ?? db) : [];
    modulos.forEach((module) =>
      moduleActivationByCode.set(module.codigo.toUpperCase(), module.ativo)
    );
  } catch (err) {
    console.warn("Notice: Failed to fetch configuracaoModulo status", err);
  }

  const visibleMenuItems: DashboardCardData[] = allDashboardModules
    .filter((item) => {
      if (item.alwaysAllowed) return true;
      if (item.code === "ASSINATURA_DIGITAL") {
        return (
          (moduleActivationByCode.get(item.code) ??
            moduleActivationByCode.get("DOCUMENTOS")) !== false
        );
      }
      return moduleActivationByCode.get(item.accessCode ?? item.code) !== false;
    })
    .filter((item) => {
      if (item.alwaysAllowed) return true;
      return context && canShowDashboardCard(context.user, item.accessCode ?? item.code);
    })
    .map((item) => {
      const accessCode = item.accessCode ?? item.code;
      const hasDocumentAccess =
        item.code === "ASSINATURA_DIGITAL" && context && canUseGed(context.user);
      const isBlocked =
        !item.alwaysAllowed &&
        !hasDocumentAccess &&
        (!context ||
          isModuleBlockedForUser(context.user, accessCode) ||
          !canViewModule(context.user, accessCode));

      return {
        ...item,
        isBlocked,
      };
    })
    .sort(compareDashboardCards);

  return (
    <PageFrame className={`${styles.frame} flex min-h-0 flex-1 flex-col gap-2 p-1 md:p-2 overflow-hidden`}>
      <DashboardClient
        modules={visibleMenuItems}
        userName={context?.user?.name}
      />
    </PageFrame>
  );
}
