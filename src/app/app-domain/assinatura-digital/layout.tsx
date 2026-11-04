import { Suspense } from "react";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { digitalSignatureNavigation } from "./navigation";
import { readGedAppearance } from "@/lib/documents/ged-appearance";
import styles from "@/components/signatures/ged/GedAppearance.module.css";
import type { CSSProperties } from "react";

export default function DigitalSignatureLayout({ children }: { children: React.ReactNode }) {
  return <Suspense><ModuleShell moduleTitle="GED e Assinatura Digital" moduleCaption="Acervo, gestão documental e assinaturas" moduleIcon="fileSignature" navigation={digitalSignatureNavigation}><Appearance>{children}</Appearance></ModuleShell></Suspense>;
}
async function Appearance({ children }: { children: React.ReactNode }) {
  const appearance = await readGedAppearance();
  return <div className={styles.frame} style={{ "--ged-accent": appearance.accent } as CSSProperties} data-ged-institution={appearance.institution} aria-label={appearance.institution}>{children}</div>;
}
