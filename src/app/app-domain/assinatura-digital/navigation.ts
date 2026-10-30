import type { ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

export const digitalSignatureNavigation: ModuleNavGroup[] = [
  { title: "Cadastros", items: [
    { title: "Cadastro de Usuários", href: "/assinatura-digital/usuarios", icon: "users" },
    { title: "Documentos", href: "/assinatura-digital/documentos", icon: "fileText" },
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
