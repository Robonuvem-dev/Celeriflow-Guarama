"use client";

import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { useOptionalOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import styles from "./indicadores/administration-bi.module.css";
import { administrationNavigation } from "./navigation";

export default function AdministracaoLayout({ children }: { children: React.ReactNode }) {
  const workspace = useOptionalOperationalWorkspace();
  if (workspace) return children;
  return <div className={styles.workspace}><ModuleShell moduleTitle="Administração Geral" moduleCaption="Gestão institucional" moduleIcon="building2" navigation={administrationNavigation}><div className="flex min-h-0 flex-1 flex-col overflow-y-auto [&_.page-header]:shrink-0">{children}</div></ModuleShell></div>;
}
