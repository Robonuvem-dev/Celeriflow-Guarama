import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

const navigation: ModuleNavGroup[] = [{
  title: "Gestão do portal",
  items: [
     { title: "Visão geral", href: "/transparencia", icon: "layoutDashboard", exact: true },
     { title: "Configurações e documentos públicos", href: "/transparencia/publicacoes", icon: "fileText" },
     { title: "Fontes nativas e escopo", href: "/transparencia/fontes", icon: "fileText" },
     { title: "PNTP e evidências", href: "/transparencia/pntp", icon: "fileText" },
     { title: "Pedidos e-SIC e manifestações", href: "/transparencia/solicitacoes", icon: "fileText" },
     { title: "Inventário e acessos", href: "/transparencia/acessos", icon: "fileText" },
    { title: "Banners", href: "/transparencia/banners", icon: "imageIcon" },
    { title: "Contratos", href: "/transparencia/contratos", icon: "fileSignature" },
    { title: "Diário Oficial", href: "/transparencia/diario-oficial", icon: "fileText" },
    { title: "Licitações", href: "/transparencia/licitacoes", icon: "gavel" },
    { title: "Notícias", href: "/transparencia/noticias", icon: "newspaper" },
    { title: "Páginas", href: "/transparencia/paginas", icon: "fileOutput" },
  ],
}];

export default function TransparenciaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleShell
      moduleTitle="Portal e Transparência"
      moduleCaption="Gestão administrativa"
      moduleIcon="fileText"
      navigation={navigation}
    >
      {children}
    </ModuleShell>
  );
}
