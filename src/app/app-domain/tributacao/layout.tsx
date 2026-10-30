"use client";

import Link from "next/link";
import { PasswordConfirmation } from "./seguranca/PasswordConfirmation";
import { Suspense } from "react";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { operationalModules } from "@/components/app-ui/operational/modules/tributacao";

export default function TributacaoLayout({ children }: { children: React.ReactNode }) {
  const config = operationalModules[0];
  return <Suspense><ModuleShell moduleTitle={config.moduleTitle} moduleCaption={config.moduleCaption} moduleIcon={config.moduleIcon} navigation={config.navigation}><div className="flex flex-wrap items-center justify-between gap-2 border-b p-2 print:hidden"><PasswordConfirmation/><Link className="text-xs text-blue-700 underline" href="/tributacao/seguranca">Configurar confirmação de senha</Link></div>{children}</ModuleShell></Suspense>;
}
