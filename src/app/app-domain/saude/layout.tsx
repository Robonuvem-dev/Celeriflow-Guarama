import { Suspense } from "react";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { saudeNavigation } from "./navigation";

export default function SaudeLayout({ children }: { children: React.ReactNode }) {
  return <Suspense><ModuleShell moduleTitle="Saúde Pública" moduleCaption="Gestão municipal" moduleIcon="heart" navigation={saudeNavigation}>{children}</ModuleShell></Suspense>;
}
