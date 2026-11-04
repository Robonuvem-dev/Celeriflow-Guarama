"use client";

import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { useOptionalOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { operationalModules } from "@/components/app-ui/operational/modules/social-educacao-publico";

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  const workspace = useOptionalOperationalWorkspace();
  if (workspace) return <>{children}</>;
  return <div className="contents social-module-shell">
    <ModuleShell moduleTitle="Assistência Social" moduleCaption="Gestão SUAS" moduleIcon="heartHandshake" navigation={operationalModules[0].navigation}>{children}</ModuleShell>
    <style jsx global>{`.social-module-shell > [data-module-shell] { width: 100%; max-width: 100%; }`}</style>
  </div>;
}
