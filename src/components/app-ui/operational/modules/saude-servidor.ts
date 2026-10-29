import type { OperationalModuleConfig } from "../routes";
import { saudeNavigation } from "@/app/app-domain/saude/navigation";
import { portalServidorNavigation } from "@/app/app-domain/portal-servidor/navigation";

export const operationalModules: OperationalModuleConfig[] = [
  {
    key: "saude", moduleTitle: "Saúde Pública", moduleCaption: "Gestão municipal", moduleIcon: "heart", navigation: saudeNavigation,
    routes: [
      { pathname: "/saude/acolhimento", title: "Fila de acolhimento" },
      { pathname: "/saude/administracao", title: "Administração da Saúde" },
      { pathname: "/saude/administracao/documentos", title: "Documentos da Saúde" },
      { pathname: "/saude/administracao/importacoes", title: "Importações e cargas SUS" },
      { pathname: "/saude/administracao/laboratorio", title: "Configuração laboratorial" },
      { pathname: "/saude/administracao/procedimentos", title: "Procedimentos ambulatoriais" },
      { pathname: "/saude/administracao/unificacoes", title: "Central de unificações" },
      { pathname: "/saude/agenda", title: "Agendamentos" },
      { pathname: "/saude/atendimentos", title: "Atendimentos e prontuários" },
      { pathname: "/saude/equipes", title: "Equipes ESF" },
      { pathname: "/saude/pacientes", title: "Pacientes" },
      { pathname: "/saude/producao/laudos", title: "Laudos e autorizações AIH/APAC" },
      { pathname: "/saude/producao/previas", title: "Prévias e origens da produção" },
      { pathname: "/saude/profissionais", title: "Profissionais de saúde" },
      { pathname: "/saude/relatorios", title: "Relatórios da Saúde" },
      { pathname: "/saude/tfd/laudos", title: "Laudos, trâmites e benefícios TFD" },
      { pathname: "/saude/unidades", title: "Unidades de saúde" },
      { pathname: "/saude/vigilancia", title: "Vigilância em Saúde" },
      { pathname: "/saude/vacinacao", title: "Vacinação básica" },
      { pathname: "/saude/regulacao", title: "Regulação e cotas" },
      { pathname: "/saude/pronto-atendimento", title: "Pronto Atendimento" },
      { pathname: "/saude/laboratorio", title: "Laboratório municipal" },
      { pathname: "/saude/tfd", title: "TFD e transporte" },
      { pathname: "/saude/producao", title: "Produção e faturamento SUS" },
      { pathname: "/saude/farmacia", title: "Farmácia básica" },
      { pathname: "/saude/territorio", title: "Território e visitas" },
      { pathname: "/saude/sisab", title: "SISAB / e-SUS" },
      { pathname: "/saude/prestador", title: "Prestador" },
      { pathname: "/saude/centro-especializado", title: "Centro Especializado" },
    ],
  },
  {
    key: "portal-servidor", moduleTitle: "Portal do Servidor", moduleCaption: "Autosserviço funcional", moduleIcon: "badgeCheck", navigation: portalServidorNavigation,
    routes: [
      { pathname: "/portal-servidor/aniversariantes", title: "Aniversariantes" },
      { pathname: "/portal-servidor/banco-horas", title: "Meu banco de horas" },
      { pathname: "/portal-servidor/beneficios", title: "Meus benefícios" },
      { pathname: "/portal-servidor/capacitacao", title: "Minha capacitação" },
      { pathname: "/portal-servidor/consignacoes", title: "Minhas consignações" },
      { pathname: "/portal-servidor/demonstrativos", title: "Demonstrativos completos" },
      { pathname: "/portal-servidor/documentos", title: "Documentos e assinaturas" },
      { pathname: "/portal-servidor/emissoes", title: "Emissões funcionais" },
      { pathname: "/portal-servidor/ferias", title: "Férias e afastamentos" },
      { pathname: "/portal-servidor/ficha-funcional", title: "Minha ficha funcional" },
      { pathname: "/portal-servidor/folha", title: "Demonstrativo de folha" },
      { pathname: "/portal-servidor/licenca-premio", title: "Minha licença-prêmio" },
      { pathname: "/portal-servidor/ponto", title: "Meu espelho de ponto" },
      { pathname: "/portal-servidor/protocolos", title: "Meus protocolos funcionais" },
    ],
  },
];

/** Association of the baseline editing grade with its paginated renderer. */
export const operationalEditingGrades = [
  {
    baseline: "saude/atendimentos/[id]/complementos/AdministrationForm.tsx:9:1758",
    owner: "AdministrationForm",
    target: "saude/atendimentos/[id]/complementos/AdministrationForm.tsx",
    renderer: "OperationalTable",
    preferenceId: "saude-administracao-materiais",
    legacy: false,
  },
] as const;
