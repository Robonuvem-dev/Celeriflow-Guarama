import type { OperationalModuleConfig } from "../routes";
import { digitalSignatureNavigation } from "@/app/app-domain/assinatura-digital/navigation";

export const operationalModules: OperationalModuleConfig[] = [{
  key: "assinatura-digital", moduleTitle: "GED e Assinatura Digital", moduleCaption: "Acervo, gestão documental e assinaturas", moduleIcon: "fileSignature",
  navigation: digitalSignatureNavigation,
  routes: [
    { pathname: "/assinatura-digital/acervo", title: "Documentos e pastas" },
    { pathname: "/assinatura-digital/acervo/integrados", title: "Acervo integrado dos módulos" },
    { pathname: "/assinatura-digital/modelos/anteriores", title: "Cadastros de modelos anteriores" },
    { pathname: "/assinatura-digital/pesquisa", title: "Pesquisa avançada" },
    { pathname: "/assinatura-digital/pastas-inteligentes", title: "Pastas inteligentes" },
    { pathname: "/assinatura-digital/importacoes", title: "Importações e lotes" },
    { pathname: "/assinatura-digital/processamento", title: "OCR e indexação" },
    { pathname: "/assinatura-digital/tarefas", title: "Minhas tarefas" },
    { pathname: "/assinatura-digital/fluxos", title: "Fluxos documentais" },
    { pathname: "/assinatura-digital/modelos", title: "Modelos de documentos" },
    { pathname: "/assinatura-digital/classes", title: "Classes e políticas documentais" },
    { pathname: "/assinatura-digital/thesaurus", title: "Thesaurus" },
    { pathname: "/assinatura-digital/usuarios", title: "Assinadores" },
    { pathname: "/assinatura-digital/documentos", title: "Tipos documentais" },
    { pathname: "/assinatura-digital/registros", title: "Assinatura Digital · Registros e documentos" },
    { pathname: "/assinatura-digital/integracoes", title: "Assinatura Digital · Integrações" },
    { pathname: "/assinatura-digital/pendentes", title: "Assinatura Digital · Pendentes dos módulos" },
    { pathname: "/assinatura-digital/historico", title: "Assinatura Digital · Meu histórico" },
  ],
}];
