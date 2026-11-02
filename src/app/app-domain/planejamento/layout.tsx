import { Suspense } from "react";
import { ModuleShell } from "@/components/app-ui/erp/ModuleShell";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { planningNavigation } from "@/lib/planejamento/navigation";

const navigation = [...planningNavigation("EXECUTIVE"), { title: "Gestão documental", items: [{ title: "Documentos no GED", href: "/assinatura-digital/origens?module=PLANEJAMENTO", icon: "fileText" as const }] }];

export default async function PlanejamentoLayout({ children }: { children: React.ReactNode }) {
  await getTenantContextForModule("PLANEJAMENTO");
  return <Suspense><ModuleShell moduleTitle="Planejamento e Orçamento" moduleCaption="Instrumentos e gestão orçamentária" moduleIcon="bookOpenCheck" navigation={navigation}>{children}</ModuleShell></Suspense>;
}
