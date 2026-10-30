import type { OperationalModuleConfig } from "../routes";
import { digitalSignatureNavigation } from "@/app/app-domain/assinatura-digital/navigation";

export const operationalModules: OperationalModuleConfig[] = [{
  key: "assinatura-digital", moduleTitle: "Assinatura Digital", moduleCaption: "Central de assinatura de documentos", moduleIcon: "fileSignature",
  navigation: digitalSignatureNavigation,
  routes: [
    { pathname: "/assinatura-digital/usuarios", title: "Assinatura Digital · Cadastro de Usuários" },
    { pathname: "/assinatura-digital/documentos", title: "Assinatura Digital · Documentos" },
    { pathname: "/assinatura-digital/registros", title: "Assinatura Digital · Registros e documentos" },
    { pathname: "/assinatura-digital/integracoes", title: "Assinatura Digital · Integrações" },
    { pathname: "/assinatura-digital/pendentes", title: "Assinatura Digital · Pendentes dos módulos" },
    { pathname: "/assinatura-digital/historico", title: "Assinatura Digital · Meu histórico" },
  ],
}];
