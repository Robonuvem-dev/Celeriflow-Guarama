"use client";

import { ModuleShell, type ModuleIconName, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { useOptionalOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { fleetNavigationGroups } from "./navigation";

const areaIcons: Record<string, ModuleIconName> = {
  frota: "truck",
  utilizacao: "route",
  rotas: "map",
  planos: "calendarClock",
  ordens: "clipboardList",
  manutencoes: "wrench",
  consumos: "fuel",
  gastos: "receiptText",
  seguros: "shieldCheck",
  obrigacoes: "fileCheck2",
  documentos: "fileText",
  ocorrencias: "clipboardList",
  relatorios: "barChart3",
};

const navigation: ModuleNavGroup[] = fleetNavigationGroups.map((group) => ({
  title: group.title,
  items: group.items.map((item) => ({
    title: item.title,
    href: `/frotas?area=${item.area}`,
    icon: areaIcons[item.area],
    query: {
      key: "area",
      values: item.area === "frota" ? ["", "frota"] : [item.area],
    },
  })),
}));
navigation.push({ title: "Cadastros", items: [{ title: "Cadastros auxiliares", href: "/frotas/cadastros", icon: "clipboardList" }] });
navigation.push({ title: "Controle", items: [
  { title: "Gestão da frota", href: "/frotas/gestao", icon: "truck" },
  { title: "Importações e correções", href: "/frotas/movimentos", icon: "clipboardList" },
  { title: "Solicitações da comunidade", href: "/frotas/cadastros?kind=solicitacoes", icon: "clipboardList" },
] });

export default function FrotasLayout({ children }: { children: React.ReactNode }) {
  const workspace = useOptionalOperationalWorkspace();
  if (workspace) return <>{children}</>;
  return (
    <div className="contents fleet-module-shell"><ModuleShell
      moduleTitle="Frotas"
      moduleCaption="Gestão operacional"
      moduleIcon="truck"
      navigation={navigation}
    >
      {children}
    </ModuleShell><style jsx global>{`.fleet-module-shell > [data-module-shell] { width: 100%; max-width: 100%; }`}</style></div>
  );
}
