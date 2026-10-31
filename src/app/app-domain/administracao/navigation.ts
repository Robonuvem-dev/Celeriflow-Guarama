import type { ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

export const administrationNavigation: ModuleNavGroup[] = [
  { title: "Administração", items: [
    { title: "Painel", href: "/administracao", icon: "layoutDashboard", exact: true },
    { title: "Dados da Prefeitura", href: "/administracao/instituicao", icon: "landmark" },
    { title: "Secretarias", href: "/administracao/secretarias", icon: "building2" },
    { title: "Departamentos", href: "/administracao/departamentos", icon: "network" },
    { title: "Unidades", href: "/administracao/unidades", icon: "mapPin" },
    { title: "Cargos e Funções", href: "/administracao/cargos", icon: "briefcase" },
    { title: "Calendário", href: "/administracao/calendario", icon: "calendarDays" },
  ] },
  { title: "Inteligência gerencial", items: [
    { title: "Business Intelligence", href: "/administracao/indicadores", icon: "barChart3" },
    { title: "Smart TV", href: "/administracao/bi/smarttv", icon: "layoutDashboard" },
    { title: "Auditoria", href: "/administracao/auditoria", icon: "clipboardCheck" },
  ] },
];
