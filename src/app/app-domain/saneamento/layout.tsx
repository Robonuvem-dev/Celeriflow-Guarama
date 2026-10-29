"use client";

import { Suspense } from "react";
import { useOptionalOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { sanitationNavigation } from "./navigation";

export default function SaneamentoLayout({ children }: { children: React.ReactNode }) {
  const workspace = useOptionalOperationalWorkspace();
  if (workspace) return <>{children}</>;
  return <Suspense><ModuleShell moduleTitle="Saneamento" moduleCaption="Gestão de Água e Esgoto" moduleIcon="droplets" navigation={sanitationNavigation}>{children}</ModuleShell></Suspense>;
}
