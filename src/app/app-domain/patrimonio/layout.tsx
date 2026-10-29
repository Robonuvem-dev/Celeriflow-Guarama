"use client";

import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { useOptionalOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";

const navigation: ModuleNavGroup[] = [
  {
    title: "Visão geral",
    items: [
      { title: "Painel operacional", href: "/patrimonio", icon: "layoutDashboard", exact: true },
    ],
  },
  {
    title: "Almoxarifado",
    items: [
      { title: "Almoxarifados", href: "/patrimonio/almoxarifados", icon: "warehouse" },
      { title: "Estoque de Materiais", href: "/patrimonio/materiais", icon: "boxes" },
      { title: "Valorização do estoque", href: "/patrimonio/valorizacao", icon: "landmark" },
      { title: "Requisições internas", href: "/patrimonio/requisicoes", icon: "clipboardList" },
      { title: "Inventários", href: "/patrimonio/inventarios", icon: "clipboardList" },
      { title: "Centros de custo", href: "/patrimonio/centros-custo", icon: "landmark" },
    ],
  },
  {
    title: "Patrimônio",
    items: [
      { title: "Bens patrimoniais", href: "/patrimonio/bens", icon: "archive" },
      { title: "Ciclo de vida", href: "/patrimonio/ciclo-vida", icon: "chartNoAxesCombined" },
    ],
  },
];

export default function PatrimonioLayout({ children }: { children: React.ReactNode }) {
  const workspace = useOptionalOperationalWorkspace();
  if (workspace) return <>{children}</>;
  return (
    <ModuleShell
      moduleTitle="Almoxarifado e Patrimônio"
      moduleIcon="package"
      navigation={navigation}
      sidebarVariant="light"
      desktopCollapsible
    >
      {children}
    </ModuleShell>
  );
}
