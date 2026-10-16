import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

const navigation: ModuleNavGroup[] = [
  {
    title: "Gestão do Portal",
    items: [
      { title: "Visão geral", href: "/portal-cidadao", icon: "layoutDashboard", exact: true },
      { title: "Notícias & Eventos", href: "/transparencia/noticias", icon: "newspaper" },
      { title: "Páginas & Textos", href: "/transparencia/paginas", icon: "fileOutput" },
      { title: "Banners & Destaques", href: "/transparencia/banners", icon: "imageIcon" },
      { title: "Documentos Públicos", href: "/transparencia/publicacoes", icon: "fileText" },
    ],
  },
  {
    title: "Serviços & Atendimento",
    items: [
      { title: "Catálogo de Serviços", href: "/protocolos/servicos", icon: "clipboardList" },
      { title: "Pedidos e-SIC & Ouvidoria", href: "/transparencia/solicitacoes", icon: "headphones" },
      { title: "Diário Oficial", href: "/transparencia/diario-oficial", icon: "fileText" },
    ],
  },
  {
    title: "Institucional",
    items: [
      { title: "Secretarias & Telefones", href: "/administracao/secretarias", icon: "building2" },
      { title: "Ver Portal Público ↗", href: "/portal", icon: "globe" },
    ],
  },
];

export default function PortalCidadaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleShell
      moduleTitle="Portal do Cidadão"
      moduleCaption="Gestão de conteúdo e serviços públicos"
      moduleIcon="globe"
      navigation={navigation}
      backHref="/dashboard"
    >
      {children}
    </ModuleShell>
  );
}
