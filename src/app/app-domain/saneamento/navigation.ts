import type { ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

export const sanitationNavigation: ModuleNavGroup[] = [
  { title: "Painel", items: [{ title: "Painel", href: "/saneamento", icon: "layoutDashboard", exact: true }] },
  { title: "Operação", items: [
    { title: "Unidades Consumidoras", href: "/saneamento/unidades", icon: "users" },
    { title: "Leituras e Consumo", href: "/saneamento/leituras", icon: "fileText" },
    { title: "Faturas", href: "/saneamento/faturas", icon: "receipt" },
    { title: "Serviços e Manutenção", href: "/saneamento/servicos", icon: "wrench" },
    { title: "Esgoto e Qualidade", href: "/saneamento/qualidade", icon: "droplet" },
  ] },
  { title: "Atendimento e Gestão", items: [
    { title: "Portal do Consumidor", href: "/saneamento/portal", icon: "globe" },
    { title: "Relatórios", href: "/saneamento/relatorios", icon: "barChart3" },
  ] },
];
