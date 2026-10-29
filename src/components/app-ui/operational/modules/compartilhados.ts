import type { OperationalModuleConfig } from "../routes";
import type { ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { planningNavigation } from "@/lib/planejamento/navigation";
import { structureConfig, structureKinds } from "@/lib/cemeteries/structure-config";

const sections = [
  ["versoes", "Versões"], ["consistencias", "Consistências"],
  ["compatibilizacao", "Compatibilização"], ["emendas", "Emendas legislativas"],
  ["programacao", "Programação e cotas"], ["creditos", "Créditos orçamentários"],
  ["documentos", "Documentos e assinaturas"],
] as const;

function planningRoutes(base: string): OperationalModuleConfig["routes"] {
  return [
    ...(["ppa", "ldo", "loa"] as const).flatMap(kind => [
      { pathname: `${base}/${kind}`, title: `Planejamento · ${kind.toUpperCase()}` },
      { pathname: `${base}/${kind}/[id]`, title: `${kind.toUpperCase()} · Previsões e versões` },
      ...sections.map(([section, title]) => ({ pathname: `${base}/${kind}/[id]/gestao/${section}`, title })),
    ]),
    { pathname: `${base}/cadastros/source`, title: "Fontes de recursos" },
    { pathname: `${base}/cadastros/revenue`, title: "Naturezas de receita" },
    { pathname: `${base}/cadastros/expense`, title: "Naturezas de despesa" },
    { pathname: `${base}/cadastros/versions`, title: "Catálogos normativos por exercício" },
    { pathname: `${base}/audiencias`, title: "Audiências e participação comunitária" },
    { pathname: `${base}/importacoes`, title: "Importação de peças orçamentárias" },
  ];
}

const chamberNavigation: ModuleNavGroup[] = [{ title: "Legislativo", items: [
  { title: "Painel", href: "/camara", icon: "layoutDashboard", exact: true },
  { title: "Planejamento e Orçamento", href: "/camara/planejamento", icon: "bookOpenCheck" },
  { title: "Legislaturas", href: "/camara/legislaturas", icon: "landmark" },
  { title: "Vereadores", href: "/camara/vereadores", icon: "users" },
  { title: "Comissões", href: "/camara/comissoes", icon: "users" },
  { title: "Sessões", href: "/camara/sessoes", icon: "calendar" },
  { title: "Proposições", href: "/camara/proposicoes", icon: "fileText" },
  { title: "Leis e Atos", href: "/camara/leis", icon: "scale" },
  { title: "Audiências", href: "/camara/audiencias", icon: "mic" },
  { title: "Portal Legislativo", href: "/camara/portal", icon: "globe" },
] }, ...planningNavigation("LEGISLATIVE")];

const cemeteryNavigation: ModuleNavGroup[] = [
  { title: "Estrutura", items: structureKinds.filter(kind => !["LOTE", "SEPULTURA"].includes(kind)).map(kind => ({ title: structureConfig[kind].title, href: `/cemiterios/estrutura?tipo=${kind}`, icon: "building2", query: { key: "tipo", values: [kind] } })) },
  { title: "Ocupação", items: ["LOTE", "SEPULTURA"].map(kind => ({ title: kind === "LOTE" ? "Lotes" : "Sepulturas / Lóculos", href: `/cemiterios/ocupacao?tipo=${kind}`, icon: "mapPin", query: { key: "tipo", values: [kind] } })) },
  { title: "Atendimento", items: [{ title: "Processos funerários", href: "/cemiterios/processos", icon: "calendarClock" }, { title: "Transferências", href: "/cemiterios/transferencias", icon: "arrowRightLeft" }] },
  { title: "Tributário e análises", items: [{ title: "Taxas e guias", href: "/cemiterios/taxas", icon: "receiptText" }, { title: "Consulta unificada", href: "/cemiterios/consulta", icon: "search" }, { title: "Relatório de sepultados", href: "/cemiterios/relatorio", icon: "barChart3" }] },
];

export const operationalModules: OperationalModuleConfig[] = [
  { key: "compartilhados-planejamento", moduleTitle: "Planejamento e Orçamento", moduleCaption: "Instrumentos e gestão orçamentária", moduleIcon: "bookOpenCheck", navigation: planningNavigation("EXECUTIVE"), routes: planningRoutes("/planejamento") },
  { key: "compartilhados-planejamento-camara", moduleTitle: "Câmara Municipal", moduleCaption: "Gestão legislativa · Planejamento e Orçamento", moduleIcon: "landmark", navigation: chamberNavigation, routes: planningRoutes("/camara/planejamento") },
  { key: "compartilhados-cemiterios-estrutura", moduleTitle: "Cemitérios", moduleCaption: "Gestão funerária municipal", moduleIcon: "building2", navigation: cemeteryNavigation, routes: [
    { pathname: "/cemiterios/estrutura", title: "Estrutura dos cemitérios" },
    { pathname: "/cemiterios/estrutura/[id]", title: "Estrutura · Ficha e histórico" },
    { pathname: "/cemiterios/ocupacao", title: "Lotes, sepulturas e lóculos" },
    { pathname: "/cemiterios/ocupacao/[id]", title: "Ocupação · Ficha e histórico" },
  ] },
];
