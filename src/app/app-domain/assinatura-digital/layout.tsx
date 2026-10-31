import { Suspense } from "react";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { digitalSignatureNavigation } from "./navigation";

export default function DigitalSignatureLayout({ children }: { children: React.ReactNode }) {
  return <Suspense><ModuleShell moduleTitle="GED e Assinatura Digital" moduleCaption="Acervo, gestão documental e assinaturas" moduleIcon="fileSignature" navigation={digitalSignatureNavigation}>{children}</ModuleShell></Suspense>;
}
