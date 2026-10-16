import { Suspense } from "react";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { planningNavigation } from "@/lib/planejamento/navigation";

const navigation = planningNavigation("EXECUTIVE");

export default async function PlanejamentoLayout({ children }: { children: React.ReactNode }) {
  await getTenantContextForModule("PLANEJAMENTO");
  return <Suspense><ModuleShell moduleTitle="Planejamento e Orçamento" moduleCaption="Instrumentos e gestão orçamentária" moduleIcon="bookOpenCheck" navigation={navigation}>{children}</ModuleShell></Suspense>;
}
