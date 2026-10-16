import { HardHat } from "lucide-react";
import { ModuleFoundationPanel } from "@/components/app-ui/erp/ModuleFoundationPanel";
import { canViewModule, getTenantContextForModule } from "@/lib/platform/tenant-context";

export const dynamic = "force-dynamic";

export default async function SstDashboardPage() {
  const { user, prisma } = await getTenantContextForModule("SST");
  const rh = await prisma.configuracaoModulo.findUnique({ where: { codigo: "RH" }, select: { ativo: true } });
  const available = rh?.ativo !== false && canViewModule(user, "RH");
  return <ModuleFoundationPanel
    title="Segurança e Medicina do Trabalho"
    icon={<HardHat className="size-4 text-teal-700" />}
    description="Rotinas ocupacionais integradas ao Cadastro Único, histórico RH, GED, estoque e Folha, com autorização por unidade gestora e atuação profissional."
    links={[
      { title: "Atestados e perícias", description: "Entrega de atestados, anexos GED, decisão pericial e afastamento vinculado ao RH.", href: "/sst/atestados", available: true, source: "SST" },
      { title: "Exames ocupacionais e ASO", description: "Emissão vinculada ao PCMSO, exames realizados/apresentados e consulta por vencimento com autorização clínica.", href: "/sst/aso", available: true, source: "SST" },
      { title: "Prontuários por atuação", description: "Medicina, Enfermagem, Psicologia e Assistência Social com questionários e pareceres preservados.", href: "/sst/prontuarios", available: true, source: "SST" },
      { title: "EPI e EPC", description: "Catálogo canônico, entregas, revisões, baixas e integração transacional com Almoxarifado.", href: "/sst/equipamentos", available: true, source: "SST e Almoxarifado" },
      { title: "CAT e restrições", description: "Acidentes, investigação, pareceres, formulário INSS e acompanhamento de restrições.", href: "/sst/acidentes", available: true, source: "SST" },
      { title: "CIPA e prevenção", description: "Comissões, reuniões, eleições, SIPAT, brigadas, extintores, ergonomia e PCA.", href: "/sst/prevencao", available: true, source: "SST" },
      { title: "Planos de saúde", description: "Titulares, dependentes, competência, valores e reconciliação com a folha canônica.", href: "/sst/planos", available: true, source: "SST e Folha" },
      { title: "PPP e prontuário funcional", description: "Consolidação das fontes autorizadas e histórico verificado de exposição.", href: "/sst/consolidado", available: true, source: "SST e RH" },
      { title: "Integração eSocial", description: "Preparação de origens, pendências e proveniência; transmissão depende de configuração e certificado reais.", href: "/sst/integracoes", available: true, source: "SST" },
      { title: "Servidores e vínculos", description: "Cadastro funcional canônico, lotação e vínculo de trabalho.", href: "/rh/servidores", available, source: "RH e Folha" },
      { title: "Licenças e afastamentos", description: "Registros funcionais e origens ocupacionais conciliadas por competência.", href: "/rh/licencas", available, source: "RH e Folha" },
    ]}
    areas={[
      { title: "Exames ocupacionais e ASO", description: "Exames admissionais, periódicos, retorno ao trabalho e avaliação de aptidão." },
      { title: "Ambientes e riscos", description: "Ambientes de trabalho, exposição e gerenciamento de riscos ocupacionais." },
      { title: "Programas e laudos", description: "Programas de saúde ocupacional, laudos e documentos vinculados ao servidor." },
      { title: "Equipamentos de proteção", description: "Controle de entrega de EPI e integração com o estoque." },
      { title: "Acidentes e acompanhamento", description: "Ocorrências ocupacionais e acompanhamento integrado aos vínculos funcionais." },
      { title: "eSocial e relatórios", description: "Eventos ocupacionais, relatórios e acesso restrito aos registros de saúde do trabalhador." },
    ]}
  />;
}
