import type { OperationalModuleConfig } from "../routes";

export const operationalModules: OperationalModuleConfig[] = [
  {
    key: "social",
    moduleTitle: "Assistência Social",
    moduleCaption: "Gestão SUAS",
    moduleIcon: "heartHandshake",
    navigation: [{ title: "Atendimento SUAS", items: [
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
    ] }],
    routes: [
      { pathname: "/social/atendimentos", title: "Atendimentos" },
      { pathname: "/social/configuracoes", title: "Configurações SUAS" },
      { pathname: "/social/encaminhamentos", title: "Encaminhamentos e rede intersetorial" },
      { pathname: "/social/familias", title: "Famílias e Indivíduos" },
      { pathname: "/social/pessoas", title: "Prontuários individuais" },
      { pathname: "/social/pessoas/[id]", title: "Prontuário individual" },
      { pathname: "/social/profissionais", title: "Profissionais e vínculos SUAS" },
      { pathname: "/social/prontuario", title: "Prontuário Eletrônico SUAS" },
      { pathname: "/social/requisicoes", title: "Requisições, estoque e dispensação" },
      { pathname: "/social/unidades", title: "Unidades SUAS" },
      { pathname: "/social/visitas", title: "Visitas" },
    ],
  },
  {
    key: "educacao",
    moduleTitle: "Educação",
    moduleCaption: "Gestão escolar",
    moduleIcon: "graduationCap",
    navigation: [{ title: "Gestão escolar", items: [
      { title: "Painel", href: "/educacao", icon: "layoutDashboard", exact: true },
      { title: "Escolas", href: "/educacao/escolas", icon: "school" },
      { title: "Matrículas e Turmas", href: "/educacao/matriculas", icon: "users" },
      { title: "Professores", href: "/educacao/professores", icon: "bookOpen" },
      { title: "Calendário", href: "/educacao/calendario", icon: "calendar" },
      { title: "Merenda Escolar", href: "/educacao/merenda", icon: "utensils" },
      { title: "Transporte Escolar", href: "/educacao/transporte", icon: "bus" },
    ] }],
    routes: [
      { pathname: "/educacao/calendario", title: "Calendário Escolar" },
      { pathname: "/educacao/escolas", title: "Escolas" },
      { pathname: "/educacao/professores", title: "Professores" },
    ],
  },
];

// Coverage metadata only: these pages keep their own navigation/contextual areas.
// Their tables have an explicit OperationalTablePanel with its own OperationalSurface.
// Do not register them as full-page administrative workspaces in ClientLayout.
export const operationalPanelRoutes: { pathname: string; title: string }[] = [
  { pathname: "/educacao/academico", title: "Gestão acadêmica" },
  { pathname: "/educacao/alunos", title: "Alunos" },
  { pathname: "/educacao/biblioteca", title: "Biblioteca escolar" },
  { pathname: "/educacao/documentos", title: "Documentos acadêmicos" },
  { pathname: "/educacao/educacenso", title: "Educacenso" },
  { pathname: "/educacao/matriculas", title: "Matrículas" },
  { pathname: "/educacao/merenda", title: "Alimentação escolar" },
  { pathname: "/educacao/portal-interativo", title: "Portal interativo" },
  { pathname: "/educacao/portal-responsavel", title: "Portal do responsável" },
  { pathname: "/educacao/pre-matricula", title: "Pré-matrícula" },
  { pathname: "/educacao/professor", title: "Área do professor" },
  { pathname: "/educacao/recursos-escolares", title: "Recursos financeiros escolares" },
  { pathname: "/educacao/suporte", title: "Suporte da Educação" },
  { pathname: "/educacao/transporte", title: "Transporte escolar" },
  { pathname: "/portal/construcao-civil", title: "Construção Civil — área profissional" },
  { pathname: "/portal/convenentes", title: "Descontos conveniados" },
  { pathname: "/portal/licitacoes-e-contratos", title: "Licitações e Contratos" },
  { pathname: "/portal/minha-area/processos", title: "Meus processos" },
  { pathname: "/portal/planejamento", title: "Planejamento e Orçamento" },
  { pathname: "/portal/portaldatransparencia", title: "Consulta da Transparência" },
  { pathname: "/portal/portaldatransparencia/estatisticas", title: "Estatísticas de pedidos" },
  { pathname: "/portal/portaldatransparencia/painel", title: "Referência mensal" },
  { pathname: "/portal/tributario", title: "Extrato do contribuinte" },
  { pathname: "/portal/tributario/itbi/novo", title: "Partes da declaração de ITBI" },
];

/** Additional editing-grid baseline associations; arrays stay in their form owners. */
export const operationalEditingGrades = [
  { baseline: "social/requisicoes/BenefitWorkflowClient.tsx:93:481", owner: "BenefitWorkflowClient", target: "social/requisicoes/BenefitRequestItemsEditor.tsx", renderer: "OperationalTable", preferenceId: "social-beneficio-itens-edicao", legacy: false },
  { baseline: "src/app/portal/tributario/itbi/novo/OnlineItbiClient.tsx:18:217", owner: "partyEditor", target: "src/app/portal/tributario/itbi/novo/OnlineItbiPartyEditor.tsx", renderer: "OperationalTable", preferenceId: "portal-itbi-partes-edicao", legacy: false },
] as const;
