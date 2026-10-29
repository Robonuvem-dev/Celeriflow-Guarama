import type { OperationalModuleConfig } from "../routes";
import type { ModuleIconName } from "@/components/app-ui/erp/ModuleShell";
import { fleetNavigationGroups } from "@/app/app-domain/frotas/navigation";

const fleetIcons: Record<string, ModuleIconName> = {
  frota: "truck", utilizacao: "route", rotas: "map", planos: "calendarClock", ordens: "clipboardList", manutencoes: "wrench",
  consumos: "fuel", gastos: "receiptText", seguros: "shieldCheck", obrigacoes: "fileCheck2", documentos: "fileText", ocorrencias: "clipboardList", relatorios: "barChart3",
};

// Embedded fullscreen workspaces provide their own context. Their form/detail hosts must
// not be registered as route-level lists (doing so would constrain the whole parent form).
export const operationalTablePanels = [
  { pathname: "/patrimonio/bens/[id]", title: "Histórico de manutenções", preferenceId: "patrimonio-bem-manutencoes" },
  { pathname: "/patrimonio/inventarios/[id]", title: "Contagem e divergências", preferenceId: "patrimonio-inventario-contagem" },
  { pathname: "/patrimonio/requisicoes/[id]", title: "Itens da requisição", preferenceId: "patrimonio-requisicao-itens" },
  { pathname: "/patrimonio/requisicoes/[id]", title: "Histórico de entregas e baixa do estoque", preferenceId: "patrimonio-requisicao-entregas" },
  { pathname: "/patrimonio/valorizacao", title: "Eventos de valorização do estoque", preferenceId: "patrimonio-valorizacao-eventos" },
  { pathname: "/obras/construcao-civil/[id]", title: "Histórico de substituições", preferenceId: "obras-substituicoes" },
  { pathname: "/obras/construcao-civil/regras", title: "Campos adicionais", preferenceId: "obras-regras-campos-edicao" },
  { pathname: "/obras/construcao-civil/regras", title: "Critérios para deferimento", preferenceId: "obras-regras-criterios-edicao" },
  { pathname: "/obras/construcao-civil/regras", title: "Documentos da etapa", preferenceId: "obras-regras-documentos-edicao" },
  { pathname: "/patrimonio/requisicoes/nova", title: "Itens da nova requisição", preferenceId: "patrimonio-requisicao-nova-itens-edicao" },
  { pathname: "/patrimonio/requisicoes/nova", title: "Pesquisa de materiais", preferenceId: "patrimonio-requisicao-referencias-materials" },
  { pathname: "/patrimonio/requisicoes/nova", title: "Pesquisa de servidores", preferenceId: "patrimonio-requisicao-referencias-employees" },
] as const;

export const operationalModules: OperationalModuleConfig[] = [
  {
    key: "patrimonio", moduleTitle: "Almoxarifado e Patrimônio", moduleIcon: "package",
    navigation: [
      { title: "Visão geral", items: [{ title: "Painel operacional", href: "/patrimonio", icon: "layoutDashboard", exact: true }] },
      { title: "Almoxarifado", items: [
        { title: "Almoxarifados", href: "/patrimonio/almoxarifados", icon: "warehouse" },
        { title: "Estoque de Materiais", href: "/patrimonio/materiais", icon: "boxes" },
        { title: "Valorização do estoque", href: "/patrimonio/valorizacao", icon: "landmark" },
        { title: "Requisições internas", href: "/patrimonio/requisicoes", icon: "clipboardList" },
        { title: "Inventários", href: "/patrimonio/inventarios", icon: "clipboardList" },
        { title: "Centros de custo", href: "/patrimonio/centros-custo", icon: "landmark" },
      ] },
      { title: "Patrimônio", items: [
        { title: "Bens patrimoniais", href: "/patrimonio/bens", icon: "archive" },
        { title: "Ciclo de vida", href: "/patrimonio/ciclo-vida", icon: "chartNoAxesCombined" },
      ] },
    ],
    routes: [
      { pathname: "/patrimonio/almoxarifados", title: "Almoxarifados" },
      { pathname: "/patrimonio/centros-custo", title: "Centros de custo" },
      { pathname: "/patrimonio/bens", title: "Bens patrimoniais e equipamentos" },
      { pathname: "/patrimonio/ciclo-vida", title: "Ciclo de vida patrimonial", excludeQuery: { view: ["operacoes"] } },
      { pathname: "/patrimonio/inventarios", title: "Inventários de estoque" },
      { pathname: "/patrimonio/requisicoes", title: "Requisições internas" },
      // Technical sample owned by the principal; both URLs consume MaterialStockList.
      { pathname: "/patrimonio/materiais", title: "Estoque de materiais", excludeQuery: { view: ["movimentar"] } },
      { pathname: "/patrimonio/bens/estoque", title: "Equipamentos em estoque", excludeQuery: { view: ["movimentar"] } },
    ],
  },
  {
    key: "obras", moduleTitle: "Obras e Construção Civil", moduleCaption: "Infraestrutura e construção civil", moduleIcon: "hardHat",
    navigation: [
      { title: "Gestão urbana", items: [
        { title: "Painel", href: "/obras", icon: "layoutDashboard", exact: true },
        { title: "Obras e Projetos", href: "/obras/obras-projetos", icon: "building2" },
        { title: "Fiscalização e Medições", href: "/obras/fiscalizacao-medicoes", icon: "ruler" },
        { title: "Serviços Urbanos", href: "/obras/servicos-urbanos", icon: "pickaxe" },
        { title: "Máquinas e Equipes", href: "/obras/maquinas-equipes", icon: "tractor" },
        { title: "Documentos", href: "/obras/documentos", icon: "fileText" },
        { title: "Relatórios", href: "/obras/relatorios", icon: "barChart3" },
      ] },
      { title: "Construção civil", items: [
        { title: "Solicitações Urbanísticas", href: "/obras/construcao-civil", icon: "building2", exact: true },
        { title: "Configurações Urbanísticas", href: "/obras/construcao-civil/configuracoes", icon: "settings" },
        { title: "Profissionais e Construtoras", href: "/obras/construcao-civil/profissionais", icon: "users" },
        { title: "Participação Profissional", href: "/obras/construcao-civil/participacao", icon: "users" },
        { title: "Autorizações Externas", href: "/portal/construcao-civil/autorizacoes", icon: "users" },
        { title: "Pedidos Profissionais", href: "/portal/construcao-civil/pedidos-administrativos", icon: "clipboardCheck" },
        { title: "Validade de Construtoras", href: "/obras/construcao-civil/construtoras", icon: "building2" },
        { title: "Taxas e Guias", href: "/obras/construcao-civil/taxas", icon: "fileText" },
        { title: "Documentos Urbanísticos", href: "/obras/construcao-civil/documentos", icon: "fileText" },
        { title: "Vistorias", href: "/obras/construcao-civil/vistorias", icon: "clipboardCheck" },
        { title: "Consultas Setoriais", href: "/obras/construcao-civil/consultas", icon: "users" },
        { title: "Fiscalização Edilícia", href: "/obras/construcao-civil/fiscalizacao", icon: "ruler" },
        { title: "Integrações", href: "/obras/construcao-civil/integracoes", icon: "settings" },
        { title: "Formulários e Zoneamento", href: "/obras/construcao-civil/regras", icon: "settings" },
      ] },
    ],
    routes: [
      { pathname: "/obras/obras-projetos", title: "Obras e Projetos" },
      { pathname: "/obras/fiscalizacao-medicoes", title: "Medições de Obras" },
      { pathname: "/obras/servicos-urbanos", title: "Serviços Urbanos" },
      { pathname: "/obras/relatorios", title: "Relatórios de Obras" },
      { pathname: "/obras/construcao-civil", title: "Solicitações Urbanísticas" },
      { pathname: "/obras/construcao-civil/configuracoes", title: "Classificações urbanísticas", excludeQuery: { view: ["parametros"] } },
      { pathname: "/obras/construcao-civil/equipe", title: "Equipe de Construção Civil" },
      { pathname: "/obras/construcao-civil/profissionais", title: "Profissionais e vínculos com construtoras" },
      { pathname: "/obras/construcao-civil/construtoras", title: "Habilitação e validade de construtoras" },
      { pathname: "/obras/construcao-civil/participacao", title: "Participação e acesso profissional", excludeQuery: { view: ["gerenciar"] } },
      { pathname: "/obras/construcao-civil/fiscalizacao", title: "Fiscalização edilícia / posturas", excludeQuery: { view: ["abrir"] } },
      { pathname: "/obras/construcao-civil/regras", title: "Histórico de formulários, zoneamento e distribuição", excludeQuery: { view: ["editar"] } },
    ],
  },
  {
    key: "frotas", moduleTitle: "Frotas", moduleCaption: "Gestão operacional", moduleIcon: "truck",
    navigation: fleetNavigationGroups.map(group => ({ title: group.title, items: group.items.map(item => ({ title: item.title, href: `/frotas?area=${item.area}`, icon: fleetIcons[item.area], query: { key: "area", values: item.area === "frota" ? ["", "frota"] : [item.area] } })) })),
    routes: [{ pathname: "/frotas", title: "Frotas — gestão operacional" }],
  },
];
