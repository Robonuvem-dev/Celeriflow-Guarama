import type { OperationalModuleConfig } from "../routes";

export const operationalModules: OperationalModuleConfig[] = [
  {
    key: "financeiro", moduleTitle: "Financeiro", moduleCaption: "Gestão e Contabilidade", moduleIcon: "landmark",
    navigation: [
      { title: "Visão Geral", items: [{ title: "Painel Financeiro", href: "/financeiro", icon: "layoutDashboard", exact: true }] },
      { title: "Execução da Despesa", items: [
        { title: "Empenhos", href: "/financeiro/empenhos", icon: "fileText" },
        { title: "Liquidações", href: "/financeiro/liquidacoes", icon: "receipt" },
        { title: "Pagamentos", href: "/financeiro/pagamentos", icon: "walletCards" },
        { title: "Restos a Pagar", href: "/financeiro/restos-a-pagar", icon: "clipboardList" },
        { title: "Gestão e Controle de Custos", href: "/financeiro/custos", icon: "scale" },
      ] },
      { title: "Receitas", items: [
        { title: "Lançamentos de Receita", href: "/financeiro/receitas", icon: "walletCards" },
        { title: "Regras Constitucionais", href: "/financeiro/receitas-constitucionais", icon: "landmark" },
      ] },
      { title: "Tesouraria e Bancos", items: [
        { title: "Contas e Transferências", href: "/financeiro/contas-bancarias", icon: "landmark" },
        { title: "Extratos Bancários", href: "/financeiro/download-extratos", icon: "download" },
        { title: "Monitoramento de Automações", href: "/financeiro/automacoes", icon: "activity" },
        { title: "Resgates e Aplicações", href: "/financeiro/resgates-aplicacoes", icon: "arrowRightLeft" },
        { title: "Rendimentos", href: "/financeiro/rendimentos", icon: "trendingUp" },
        { title: "Conciliação Bancária", href: "/financeiro/conciliacao-bancaria", icon: "gitCompare" },
      ] },
      { title: "Contabilidade e Saídas", items: [
        { title: "Contabilidade e Fechamento", href: "/financeiro/contabilidade", icon: "scale" },
        { title: "Relatórios Financeiros", href: "/financeiro/relatorios", icon: "fileText" },
        { title: "Índices Constitucionais", href: "/financeiro/relatorios/indices-constitucionais", icon: "scale" },
      ] },
    ],
    routes: [
      { pathname: "/financeiro/empenhos", title: "Empenhos" },
      { pathname: "/financeiro/liquidacoes", title: "Liquidações" },
      { pathname: "/financeiro/pagamentos", title: "Pagamentos" },
      { pathname: "/financeiro/contas-bancarias", title: "Contas Bancárias" },
      { pathname: "/financeiro/receitas", title: "Receitas" },
      { pathname: "/financeiro/receitas-constitucionais", title: "Receitas Constitucionais e Legais" },
      { pathname: "/financeiro/automacoes", title: "Central de Automações Financeiras" },
      { pathname: "/financeiro/download-extratos", title: "Extratos Bancários" },
      { pathname: "/financeiro/rendimentos", title: "Rendimentos de Aplicação Financeira" },
      { pathname: "/financeiro/contabilidade", title: "Contabilidade e Fechamento" },
      { pathname: "/financeiro/contabilidade/disponibilidade", title: "Disponibilidade de recursos por fonte" },
    ],
  },
  {
    key: "controle-interno", moduleTitle: "Controle Interno", moduleCaption: "Consultas integradas", moduleIcon: "shieldCheck",
    navigation: [{ title: "Controle Interno", items: [
      { title: "Planos e diagnósticos", href: "/controle-interno", icon: "shieldCheck", exact: true },
      { title: "Relatórios circunstanciados", href: "/controle-interno/relatorios", icon: "fileText" },
      { title: "Ouvidoria", href: "/controle-interno/consultas/ouvidoria", icon: "messageSquareWarning" },
      { title: "Estatísticas funcionais", href: "/controle-interno/consultas/rh", icon: "users" },
      { title: "Processos judiciais", href: "/controle-interno/consultas/judicial", icon: "gavel" },
    ] }],
    routes: [
      { pathname: "/controle-interno/consultas/ouvidoria", title: "Controle Interno — Ouvidoria" },
      { pathname: "/controle-interno/consultas/judicial", title: "Controle Interno — Processos Judiciais" },
      { pathname: "/controle-interno/consultas/rh", title: "Controle Interno — Estatísticas Funcionais" },
    ],
  },
];

/** These routes retain their forms/analytics; OperationalTablePanel supplies a local surface. */
export const operationalPanelRoutes = [
  { pathname: "/financeiro/conciliacao-bancaria", tables: ["correspondências", "edição de alocações N:N"] },
  { pathname: "/financeiro/contabilidade/etapas-anuais", tables: ["inconsistências", "posição financeira", "notas extraorçamentárias transportadas"] },
  { pathname: "/financeiro/contabilidade/saldos-fontes", tables: ["saldos mensais — doze blocos explícitos"] },
  { pathname: "/financeiro/custos", tables: ["totalizadores por tipo", "edição de rateios", "rateios da folha", "rateios de consumo"] },
  { pathname: "/financeiro/orcamento", tables: ["despesas", "dotações", "créditos", "reservas", "edição de itens de crédito"] },
  { pathname: "/financeiro/relatorios/indices-constitucionais", tables: ["memórias de Saúde e Educação", "edição de componentes fiscais"] },
  { pathname: "/financeiro/relatorios/pessoal-fiscal", tables: ["edição de componentes de pessoal e RCL"] },
  { pathname: "/controle-interno", tables: ["diagnósticos por execução", "edição de itens de checklist"] },
  { pathname: "/indicadores", tables: ["custos por tipo"] },
] as const;

/** Baseline editing-grid evidence; the audit owner reconciles these callable chains. */
export const operationalEditingGrades = [
  { baseline: "controle-interno/ChecklistGroupsEditor.tsx:8:1110", owner: "ChecklistGroupsEditor", target: "controle-interno/ChecklistGroupsEditor.tsx", renderer: "FinanceTablePanel", legacy: false },
  { baseline: "financeiro/conciliacao-bancaria/ReconciliationAllocationForm.tsx:36:33", owner: "ReconciliationAllocationForm", target: "financeiro/conciliacao-bancaria/ReconciliationAllocationForm.tsx", renderer: "FinanceTablePanel", legacy: false },
  { baseline: "financeiro/custos/CostsClient.tsx:21:63", owner: "DistributionEditor", target: "financeiro/CostDistributionDraft.tsx", renderer: "FinanceTablePanel", legacy: false },
  { baseline: "financeiro/custos/PayrollCostRulesClient.tsx:32:145", owner: "PayrollCostRulesClient", target: "financeiro/CostDistributionDraft.tsx", renderer: "FinanceTablePanel", legacy: false },
  { baseline: "financeiro/custos/SettlementCostsPanel.tsx:17:343", owner: "SettlementCostsPanel", target: "financeiro/CostDistributionDraft.tsx", renderer: "FinanceTablePanel", legacy: false },
  { baseline: "financeiro/custos/StockCostRulesClient.tsx:25:126", owner: "StockCostRulesClient", target: "financeiro/CostDistributionDraft.tsx", renderer: "FinanceTablePanel", legacy: false },
  { baseline: "financeiro/orcamento/CreditRequestDialog.tsx:169:15", owner: "CreditRequestDialog", target: "financeiro/orcamento/CreditRequestDialog.tsx", renderer: "FinanceTablePanel", legacy: false },
  { baseline: "financeiro/relatorios/indices-constitucionais/FiscalIndicesClient.tsx:12:136", owner: "TermsEditor", target: "financeiro/FiscalTermsDraft.tsx", renderer: "FinanceTablePanel", legacy: false },
  { baseline: "financeiro/relatorios/pessoal-fiscal/PersonnelFiscalClient.tsx:17:108", owner: "CompositionEditor", target: "financeiro/FiscalTermsDraft.tsx", renderer: "FinanceTablePanel", legacy: false },
  { baseline: "financeiro/orcamento/planejamento/PlanejamentoClient.tsx:311:136", owner: "PlanejamentoClient/revenueForecasts", target: "financeiro/AnnualBudgetDraft.tsx", renderer: "FinanceTablePanel", legacy: true },
  { baseline: "financeiro/orcamento/planejamento/PlanejamentoClient.tsx:312:135", owner: "PlanejamentoClient/expenseFixations", target: "financeiro/AnnualBudgetDraft.tsx", renderer: "FinanceTablePanel", legacy: true },
] as const;

/** Adapted for reuse; the existing page redirects remain authoritative. */
export const operationalLegacyTables = [
  { file: "financeiro/orcamento/cadastros/CadastrosClient.tsx", tables: ["cadastros orçamentários"] },
  { file: "financeiro/orcamento/planejamento/PlanejamentoClient.tsx", tables: ["fixações/alocações", "CMD/MBA"] },
] as const;
