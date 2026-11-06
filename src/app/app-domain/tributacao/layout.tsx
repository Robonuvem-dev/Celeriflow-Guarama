"use client";

import Link from "next/link";
import { PasswordConfirmation } from "./seguranca/PasswordConfirmation";
import { Suspense } from "react";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { operationalModules } from "@/components/app-ui/operational/modules/tributacao";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";

export default function TributacaoLayout({ children }: { children: React.ReactNode }) {
  const config = operationalModules[0];
  return <Suspense><ModuleShell moduleTitle={config.moduleTitle} moduleCaption={config.moduleCaption} moduleIcon={config.moduleIcon} navigation={config.navigation}><OperationalHeaderActions><OperationalFilters label="Confirmação de senha"><PasswordConfirmation/><Link className="mt-2 inline-block text-xs text-blue-700 underline" href="/tributacao/seguranca">Configurar confirmação de senha</Link></OperationalFilters></OperationalHeaderActions>{children}</ModuleShell></Suspense>;
}
