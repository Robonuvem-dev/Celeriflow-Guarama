import type { ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

export const digitalSignatureNavigation: ModuleNavGroup[] = [
  { title: "Acervo e gestão documental", items: [
    { title: "Painel", href: "/assinatura-digital", icon: "layoutDashboard", exact: true },
    { title: "Documentos e pastas", href: "/assinatura-digital/acervo", icon: "folder" },
    { title: "Pesquisa avançada", href: "/assinatura-digital/pesquisa", icon: "search" },
    { title: "Pastas inteligentes", href: "/assinatura-digital/pastas-inteligentes", icon: "folderOpen" },
    { title: "Importações e lotes", href: "/assinatura-digital/importacoes", icon: "send" },
    { title: "OCR e indexação", href: "/assinatura-digital/processamento", icon: "fileText" },
    { title: "Minhas tarefas", href: "/assinatura-digital/tarefas", icon: "clipboardCheck" },
    { title: "Fluxos documentais", href: "/assinatura-digital/fluxos", icon: "workflow" },
    { title: "Modelos", href: "/assinatura-digital/modelos", icon: "fileText" },
  ] },
  { title: "Cadastros", items: [
    { title: "Assinadores", href: "/assinatura-digital/usuarios", icon: "users" },
    { title: "Tipos documentais", href: "/assinatura-digital/documentos", icon: "fileText" },
    { title: "Classes e políticas", href: "/assinatura-digital/classes", icon: "fileText" },
    { title: "Thesaurus", href: "/assinatura-digital/thesaurus", icon: "search" },
  ] },
  { title: "Assinaturas", items: [
    { title: "Assine Agora", href: "/assinatura-digital/assine-agora", icon: "fileSignature" },
    { title: "Validação", href: "/assinatura-digital/validacao", icon: "shieldCheck" },
    { title: "Registros e documentos", href: "/assinatura-digital/registros", icon: "history" },
  ] },
  { title: "Configuração", items: [
    { title: "Integrações", href: "/assinatura-digital/integracoes", icon: "settings2" },
  ] },
  { title: "Solicitações dos módulos", items: [
    { title: "Pendentes de assinatura", href: "/assinatura-digital/pendentes", icon: "clipboardCheck" },
    { title: "Meu histórico de solicitações", href: "/assinatura-digital/historico", icon: "history" },
  ] },
];
