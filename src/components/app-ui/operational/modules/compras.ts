import type { OperationalModuleConfig } from "../routes";

export const operationalModules: OperationalModuleConfig[] = [{
  key: "compras",
  moduleTitle: "Compras e Contratos",
  moduleCaption: "Gestão Pública",
  moduleIcon: "clipboardList",
  navigation: [{ title: "Compras e Contratos", items: [
    { title: "Painel de Compras", href: "/compras", icon: "layoutDashboard", exact: true },
    { title: "Solicitações", href: "/compras/solicitacoes", icon: "clipboardList" },
    { title: "Planejamento", href: "/compras/planejamento", icon: "calendarDays" },
    { title: "Pesquisas de Preços", href: "/compras/pesquisas-precos", icon: "fileSearch" },
    { title: "Processos de Compra", href: "/compras/processos", icon: "clipboardList" },
    { title: "Licitações", href: "/compras/licitacoes", icon: "gavel" },
    { title: "Contratos", href: "/compras/contratos", icon: "scale" },
    { title: "Recebimentos", href: "/compras/recebimentos", icon: "package" },
    { title: "Catálogo de Itens", href: "/compras/catalogo", icon: "fileText" },
  ] }],
  routes: [
    { pathname: "/compras/catalogo", title: "Catálogo de Itens" },
    { pathname: "/compras/solicitacoes", title: "Solicitações de Compra" },
    { pathname: "/compras/planejamento", title: "Planejamento de Compras" },
    { pathname: "/compras/pesquisas-precos", title: "Pesquisas de Preços" },
    { pathname: "/compras/processos", title: "Processos de Compra" },
    { pathname: "/compras/licitacoes", title: "Licitações e dispensas" },
    { pathname: "/compras/licitacoes/portal", title: "Portal do fornecedor" },
    { pathname: "/compras/contratos", title: "Gestão de Contratos" },
    { pathname: "/compras/convenios", title: "Gestão de Convênios" },
    { pathname: "/compras/exportacoes", title: "Pacotes de Exportação de Compras" },
  ],
}];

// These routes retain their document/form shell. Each table opens its own
// OperationalTablePanel/OperationalSurface instead of claiming the whole route.
export const operationalPanelRoutes = [
  { pathname: "/compras/solicitacoes/[id]", tables: ["Itens", "Alocações orçamentárias", "Processos de origem"] },
  { pathname: "/compras/processos/[id]", tables: ["Itens", "Origem e alocações"] },
  { pathname: "/compras/contratos/[id]", tables: ["Itens contratados", "Resumo financeiro", "Empenhos"] },
  { pathname: "/compras/pesquisas-precos/[id]", tables: ["Itens abrangidos", "Convites e quadro comparativo"] },
  { pathname: "/compras/pesquisas-precos/portal/[key]", tables: ["Itens solicitados"] },
  { pathname: "/compras/pesquisas-precos/portal/[key]/relatorio", tables: ["Itens abrangidos — consulta; impressão integral"] },
  { pathname: "/compras/licitacoes/[id]", tables: ["Membros da designação — edição", "Itens do lote — seleção e quantidade"] },
  { pathname: "/compras/recebimentos", tables: ["Itens do recebimento — edição"] },
  { pathname: "/compras/solicitacoes/novo", tables: ["Rateios por item — edição"] },
  { pathname: "/compras/solicitacoes/[id]/editar", tables: ["Rateios por item — edição"] },
];
