import type { OperationalModuleConfig } from "../routes";
import { sanitationNavigation } from "@/app/app-domain/saneamento/navigation";

export const operationalModules: OperationalModuleConfig[] = [
  {
    key: "saneamento",
    moduleTitle: "Saneamento",
    moduleCaption: "Gestão de Água e Esgoto",
    moduleIcon: "droplets",
    navigation: sanitationNavigation,
    routes: [
      { pathname: "/saneamento/unidades", title: "Unidades Consumidoras" },
      { pathname: "/saneamento/leituras", title: "Leituras e Consumo" },
      { pathname: "/saneamento/faturas", title: "Contas de Água e Esgoto" },
      { pathname: "/saneamento/servicos", title: "Serviços e Manutenção" },
      { pathname: "/saneamento/qualidade", title: "Esgoto e Qualidade" },
      { pathname: "/saneamento/portal", title: "Portal do Consumidor" },
      { pathname: "/saneamento/relatorios", title: "Relatórios Gerenciais" },
    ],
  },
  {
    key: "meio-ambiente",
    moduleTitle: "Meio Ambiente",
    moduleCaption: "Gestão Sustentável",
    moduleIcon: "leaf",
    navigation: [
      { title: "Painel", items: [{ title: "Painel e Resumo", href: "/meio-ambiente", icon: "layoutDashboard", exact: true }] },
      { title: "Licenciamento e Controle", items: [
        { title: "Empreendimentos", href: "/meio-ambiente/empreendimentos", icon: "building2" },
        { title: "Licenciamento", href: "/meio-ambiente/licenciamento", icon: "shieldCheck" },
        { title: "Solicitações e Podas", href: "/meio-ambiente/solicitacoes", icon: "fileText" },
        { title: "Denúncias Ambientais", href: "/meio-ambiente/denuncias", icon: "alertTriangle" },
        { title: "Fiscalização e Autos", href: "/meio-ambiente/fiscalizacao", icon: "search" },
      ] },
      { title: "Gestão Ambiental", items: [
        { title: "Áreas Verdes", href: "/meio-ambiente/areas-verdes", icon: "sprout" },
        { title: "Controle de Resíduos", href: "/meio-ambiente/residuos", icon: "trash2" },
        { title: "Educação Ambiental", href: "/meio-ambiente/educacao", icon: "graduationCap" },
        { title: "Documentos Oficiais", href: "/meio-ambiente/documentos", icon: "folderOpen" },
      ] },
    ],
    routes: [
      { pathname: "/meio-ambiente/areas-verdes", title: "Áreas Verdes e Preservação" },
      { pathname: "/meio-ambiente/denuncias", title: "Denúncias Ambientais" },
      { pathname: "/meio-ambiente/documentos", title: "Central de Documentos" },
      { pathname: "/meio-ambiente/educacao", title: "Educação Ambiental" },
      { pathname: "/meio-ambiente/empreendimentos", title: "Empreendimentos" },
      { pathname: "/meio-ambiente/fiscalizacao", title: "Fiscalização e Vistorias" },
      { pathname: "/meio-ambiente/licenciamento", title: "Licenciamento Ambiental", excludeQuery: { view: ["motor"] } },
      { pathname: "/meio-ambiente/residuos", title: "Controle de Resíduos" },
      { pathname: "/meio-ambiente/solicitacoes", title: "Solicitações e Podas" },
    ],
  },
];
