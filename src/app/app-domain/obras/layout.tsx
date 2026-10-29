"use client";

import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { useOptionalOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";

const navigation: ModuleNavGroup[] = [{
  title: "Gestão urbana",
  items: [
    { title: "Painel", href: "/obras", icon: "layoutDashboard", exact: true },
    { title: "Obras e Projetos", href: "/obras/obras-projetos", icon: "building2" },
    { title: "Fiscalização e Medições", href: "/obras/fiscalizacao-medicoes", icon: "ruler" },
    { title: "Serviços Urbanos", href: "/obras/servicos-urbanos", icon: "pickaxe" },
    { title: "Máquinas e Equipes", href: "/obras/maquinas-equipes", icon: "tractor" },
    { title: "Documentos", href: "/obras/documentos", icon: "fileText" },
    { title: "Relatórios", href: "/obras/relatorios", icon: "barChart3" },
  ],
}, {
  title: "Construção civil",
  items: [
    { title: "Solicitações Urbanísticas", href: "/obras/construcao-civil", icon: "building2", exact: true },
    { title: "Configurações Urbanísticas", href: "/obras/construcao-civil/configuracoes", icon: "settings" },
    { title: "Profissionais e Construtoras", href: "/obras/construcao-civil/profissionais", icon: "users" },
    { title: "Participação Profissional", href: "/obras/construcao-civil/participacao", icon: "users" },
    { title: "Autorizações Externas", href: "/portal/construcao-civil/autorizacoes", icon: "users" },
    { title: "Pedidos Profissionais", href: "/portal/construcao-civil/pedidos-administrativos", icon: "clipboardCheck" },
    { title: "Validade de Construtoras", href: "/obras/construcao-civil/construtoras", icon: "building2" },
    { title: "Taxas e Guias", href: "/obras/construcao-civil/taxas", icon: "fileText" },
    { title: "Documentos Urbanísticos", href: "/obras/construcao-civil/documentos", icon: "fileText" },
    { title: "Vistorias", href: "/obras/construcao-civil/vistorias", icon: "clipboardCheck" },
    { title: "Consultas Setoriais", href: "/obras/construcao-civil/consultas", icon: "users" },
    { title: "Fiscalização Edilícia", href: "/obras/construcao-civil/fiscalizacao", icon: "ruler" },
    { title: "Integrações", href: "/obras/construcao-civil/integracoes", icon: "settings" },
    { title: "Formulários e Zoneamento", href: "/obras/construcao-civil/regras", icon: "settings" },
  ],
}];

export default function ObrasLayout({ children }: { children: React.ReactNode }) {
  const workspace = useOptionalOperationalWorkspace();
  if (workspace) return <>{children}</>;
  return <ModuleShell moduleTitle="Obras e Construção Civil" moduleCaption="Infraestrutura e construção civil" moduleIcon="hardHat" navigation={navigation}>{children}</ModuleShell>;
}
