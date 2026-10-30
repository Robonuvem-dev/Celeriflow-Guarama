import { Suspense } from "react";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { digitalSignatureNavigation } from "./navigation";

export default function DigitalSignatureLayout({ children }: { children: React.ReactNode }) {
  return <Suspense><ModuleShell moduleTitle="Assinatura Digital" moduleCaption="Central de assinatura de documentos" moduleIcon="fileSignature" navigation={digitalSignatureNavigation}>{children}</ModuleShell></Suspense>;
}
