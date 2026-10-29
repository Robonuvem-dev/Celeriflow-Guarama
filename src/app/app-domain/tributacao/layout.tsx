"use client";

import { Suspense } from "react";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { operationalModules } from "@/components/app-ui/operational/modules/tributacao";

export default function TributacaoLayout({ children }: { children: React.ReactNode }) {
  const config = operationalModules[0];
  return <Suspense><ModuleShell moduleTitle={config.moduleTitle} moduleCaption={config.moduleCaption} moduleIcon={config.moduleIcon} navigation={config.navigation}>{children}</ModuleShell></Suspense>;
}
