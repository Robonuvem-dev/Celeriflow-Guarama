import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

const navigation: ModuleNavGroup[] = [
  {
    title: "Administração",
    items: [
      { title: "Painel", href: "/administracao", icon: "layoutDashboard", exact: true },
      { title: "Dados da Prefeitura", href: "/administracao/instituicao", icon: "landmark" },
      { title: "Secretarias", href: "/administracao/secretarias", icon: "building2" },
      { title: "Departamentos", href: "/administracao/departamentos", icon: "network" },
      { title: "Unidades", href: "/administracao/unidades", icon: "mapPin" },
      { title: "Cargos e Funções", href: "/administracao/cargos", icon: "briefcase" },
      { title: "Calendário", href: "/administracao/calendario", icon: "calendarDays" },
    ],
  },
  {
    title: "Inteligência gerencial",
    items: [
      { title: "Business Intelligence", href: "/administracao/indicadores", icon: "barChart3" },
    ],
  },
];

export default function AdministracaoLayout({ children }: { children: React.ReactNode }) {
  return <ModuleShell moduleTitle="Administração Geral" moduleCaption="Gestão institucional" moduleIcon="building2" navigation={navigation}><div className="flex min-h-0 flex-1 flex-col overflow-y-auto [&_.page-header]:shrink-0">{children}</div></ModuleShell>;
}
