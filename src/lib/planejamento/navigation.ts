import type { ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { planningBasePath, type PlanningJurisdiction } from "./policy";

export function planningNavigation(jurisdiction: PlanningJurisdiction): ModuleNavGroup[] {
  const base = planningBasePath(jurisdiction);
  return [
    { title: "Planejamento e Orçamento", items: [{ title: "Visão geral", href: base, icon: "layoutDashboard", exact: true }] },
    { title: "Instrumentos", items: [
      { title: "Plano Plurianual — PPA", href: `${base}/ppa`, icon: "bookOpenCheck" },
      { title: "Diretrizes Orçamentárias — LDO", href: `${base}/ldo`, icon: "landmark" },
      { title: "Orçamento Anual — LOA", href: `${base}/loa`, icon: "fileText" },
    ] },
    { title: "Cadastros", items: [
      ...(jurisdiction === "EXECUTIVE" ? [{ title: "Ações regionalizadas", href: `${base}/regionalizacao`, icon: "fileText" as const }] : []),
      { title: "Fontes de recursos", href: `${base}/cadastros/source`, icon: "landmark" },
      { title: "Naturezas de receita", href: `${base}/cadastros/revenue`, icon: "fileText" },
      { title: "Naturezas de despesa", href: `${base}/cadastros/expense`, icon: "fileText" },
      { title: "Catálogos por exercício", href: `${base}/cadastros/versions`, icon: "fileText" },
      { title: "Entidades e unidades", href: `${base}/entidades`, icon: "settings" },
    ] },
    { title: "Participação", items: [{ title: "Audiências e solicitações", href: `${base}/audiencias`, icon: "mic" }] },
    { title: "Operações", items: [{ title: "Importações", href: `${base}/importacoes`, icon: "fileText" }] },
  ];
}
