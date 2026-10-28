"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { sanitationNavigation } from "./navigation";

export default function SaneamentoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/saneamento/unidades") return <>{children}</>;
  return <Suspense><ModuleShell moduleTitle="Saneamento" moduleCaption="Gestão de Água e Esgoto" moduleIcon="droplets" navigation={sanitationNavigation}>{children}</ModuleShell></Suspense>;
}
