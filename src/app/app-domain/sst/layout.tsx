import { Suspense } from "react";
import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

const navigation: ModuleNavGroup[] = [
  { title: "Segurança e Medicina do Trabalho", items: [{ title: "Painel de SST", href: "/sst", icon: "layoutDashboard", exact: true }] },
  { title: "Atestados e perícias", items: [{ title: "Atestados", href: "/sst/atestados", icon: "fileHeart" }, { title: "Configurações", href: "/sst/configuracoes", icon: "settings" }] },
  { title: "Atendimento ocupacional", items: [{ title: "Juntas médicas", href: "/sst/juntas", icon: "users" }, { title: "Agenda", href: "/sst/agenda", icon: "calendar" }, { title: "Exames e ASO", href: "/sst/aso", icon: "fileHeart" }] },
  { title: "Gestão", items: [{ title: "Jornada planejada", href: "/sst/jornadas", icon: "clock3" }, { title: "Relatórios", href: "/sst/relatorios", icon: "barChart3" }] },
  { title: "Formulários clínicos", items: [{ title: "Questionários de anamnese", href: "/sst/questionarios", icon: "fileText" }] },
  { title: "Prontuários e profissionais", items: [{ title: "Profissionais", href: "/sst/profissionais", icon: "users" }, { title: "Prontuários por atuação", href: "/sst/prontuarios", icon: "fileHeart" }, { title: "Vacinação ocupacional", href: "/sst/vacinacao", icon: "fileHeart" }] },
  { title: "Exposição ocupacional", items: [{ title: "GHE", href: "/sst/ghe", icon: "hardHat" }, { title: "Programas e laudos", href: "/sst/programas", icon: "fileText" }] },
  { title: "Vínculos e prevenção", items: [{ title: "Histórico funcional", href: "/sst/vinculos", icon: "users" }, { title: "Ordens de serviço", href: "/sst/ordens-servico", icon: "fileText" }, { title: "EPI e EPC", href: "/sst/equipamentos", icon: "hardHat" }, { title: "CIPA e prevenção", href: "/sst/prevencao", icon: "users" }] },
  { title: "Acidentes e restrições", items: [{ title: "CAT e incidentes", href: "/sst/acidentes", icon: "fileText" }, { title: "Restrições", href: "/sst/restricoes", icon: "fileHeart" }] },
  { title: "Integração e benefícios", items: [{ title: "Planos de saúde", href: "/sst/planos", icon: "fileHeart" }, { title: "Fonte técnica do PPP", href: "/sst/ppp", icon: "fileSignature" }, { title: "PPP e prontuário funcional", href: "/sst/consolidado", icon: "fileText" }, { title: "eSocial", href: "/sst/integracoes", icon: "settings" }] },
];

export default async function SstLayout({ children }: { children: React.ReactNode }) {
  await getTenantContextForModule("SST");
  return <Suspense><ModuleShell moduleTitle="Segurança e Medicina do Trabalho" moduleCaption="Saúde ocupacional dos servidores" moduleIcon="hardHat" navigation={navigation}><div className="min-h-0 flex-1 overflow-y-auto">{children}</div></ModuleShell></Suspense>;
}
