import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

const navigation: ModuleNavGroup[] = [{
  title: "Atendimento SUAS",
  items: [
    { title: "Painel Social", href: "/social", icon: "layoutDashboard", exact: true },
    { title: "Atendimentos", href: "/social/atendimentos", icon: "heartHandshake" },
    { title: "Encaminhamentos e Rede", href: "/social/encaminhamentos", icon: "fileText" },
    { title: "Famílias e Indivíduos", href: "/social/familias", icon: "users" },
    { title: "Prontuários Individuais", href: "/social/pessoas", icon: "users" },
    { title: "Prontuário Eletrônico", href: "/social/prontuario", icon: "fileText" },
    { title: "Visitas", href: "/social/visitas", icon: "home" },
    { title: "Unidades", href: "/social/unidades", icon: "building2" },
    { title: "Profissionais e Vínculos", href: "/social/profissionais", icon: "users" },
    { title: "Configurações SUAS", href: "/social/configuracoes", icon: "settings" },
    { title: "Modelos de Documentos", href: "/social/modelos", icon: "fileText" },
    { title: "Programas e Benefícios", href: "/social/beneficios", icon: "gift" },
    { title: "Requisições e Dispensação", href: "/social/requisicoes", icon: "gift" },
  ],
}];

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return <ModuleShell moduleTitle="Assistência Social" moduleCaption="Gestão SUAS" moduleIcon="heartHandshake" navigation={navigation}>{children}</ModuleShell>;
}
