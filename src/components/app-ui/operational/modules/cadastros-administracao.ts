import type { OperationalModuleConfig } from "../routes";

export const operationalModules: OperationalModuleConfig[] = [
  {
    key: "administracao", moduleTitle: "Administração Geral", moduleCaption: "Gestão institucional", moduleIcon: "building2",
    navigation: [
      { title: "Administração", items: [
        { title: "Painel", href: "/administracao", icon: "layoutDashboard", exact: true },
        { title: "Dados da Prefeitura", href: "/administracao/instituicao", icon: "landmark" },
        { title: "Secretarias", href: "/administracao/secretarias", icon: "building2" },
        { title: "Departamentos", href: "/administracao/departamentos", icon: "network" },
        { title: "Unidades", href: "/administracao/unidades", icon: "mapPin" },
        { title: "Cargos e Funções", href: "/administracao/cargos", icon: "briefcase" },
        { title: "Calendário", href: "/administracao/calendario", icon: "calendarDays" },
      ] },
      { title: "Inteligência gerencial", items: [{ title: "Business Intelligence", href: "/administracao/indicadores", icon: "barChart3" }] },
    ],
    // /administracao and /administracao/indicadores keep the analytical shell;
    // their migrated comparison uses the self-provided OperationalTablePanel.
    // /administracao/demandas remains a redirect; its legacy client is migrated in a panel.
    routes: [
      { pathname: "/administracao/secretarias", title: "Secretarias" },
      { pathname: "/administracao/departamentos", title: "Departamentos" },
      { pathname: "/administracao/unidades", title: "Unidades Administrativas" },
      { pathname: "/administracao/cargos", title: "Cargos e Funções" },
      { pathname: "/administracao/calendario", title: "Calendário Institucional" },
      { pathname: "/administracao/servidores", title: "Servidores" },
    ],
  },
  {
    key: "cadastros", moduleTitle: "Cadastros Gerais", moduleCaption: "Cadastro único", moduleIcon: "users",
    navigation: [
      { title: "Geral", items: [
        { title: "Painel", href: "/cadastros", icon: "layoutDashboard", exact: true },
        { title: "Pessoas Físicas", href: "/cadastros/pessoas-fisicas", icon: "users" },
        { title: "Pessoas Jurídicas", href: "/cadastros/pessoas-juridicas", icon: "building2" },
        { title: "Famílias", href: "/cadastros/familias", icon: "users" },
        { title: "Entidades", href: "/cadastros/entidades", icon: "building2" },
      ] },
      { title: "Estrutura", items: [
        { title: "Organograma", href: "/cadastros/organograma", icon: "network" },
        { title: "Centros de Custo", href: "/cadastros/centros-custo", icon: "landmark" },
        { title: "Localidades", href: "/cadastros/localidades", icon: "mapPin" },
      ] },
      { title: "Referências", items: [
        { title: "Textos Jurídicos", href: "/cadastros/textos-juridicos", icon: "fileText" },
        { title: "Bancos e Agências", href: "/cadastros/bancos-agencias", icon: "landmark" },
        { title: "Tributos", href: "/cadastros/tributos", icon: "receipt" },
        { title: "Moedas", href: "/cadastros/moedas", icon: "banknote" },
        { title: "Produtos", href: "/cadastros/produtos", icon: "package" },
        { title: "CBO", href: "/cadastros/cbo", icon: "briefcase" },
        { title: "Assinantes Legais", href: "/cadastros/assinantes-legais", icon: "fileSignature" },
      ] },
      { title: "Operacional", items: [
        { title: "Fornecedores", href: "/cadastros/fornecedores", icon: "truck" },
        { title: "Imóveis", href: "/cadastros/imoveis", icon: "home" },
        { title: "Documentos", href: "/cadastros/documentos", icon: "fileBox" },
        { title: "Qualidade dos Dados", href: "/cadastros/qualidade", icon: "shieldCheck" },
      ] },
    ],
    routes: [
      { pathname: "/cadastros/pessoas-fisicas", title: "Pessoas Físicas" },
      { pathname: "/cadastros/pessoas-juridicas", title: "Pessoas Jurídicas" },
      { pathname: "/cadastros/fornecedores", title: "Fornecedores" },
      { pathname: "/cadastros/imoveis", title: "Imóveis" },
      { pathname: "/cadastros/documentos", title: "Documentos e Anexos" },
      { pathname: "/cadastros/organograma", title: "Organograma" },
      { pathname: "/cadastros/qualidade", title: "Qualidade dos Dados" },
      { pathname: "/cadastros/familias", title: "Famílias" },
      { pathname: "/cadastros/entidades", title: "Entidades Governamentais" },
      { pathname: "/cadastros/centros-custo", title: "Centros de Custo" },
      { pathname: "/cadastros/localidades", title: "Localidades" },
      { pathname: "/cadastros/textos-juridicos", title: "Textos Jurídicos" },
      { pathname: "/cadastros/bancos-agencias", title: "Bancos e Agências" },
      { pathname: "/cadastros/tributos", title: "Tributos" },
      { pathname: "/cadastros/moedas", title: "Moedas" },
      { pathname: "/cadastros/produtos", title: "Produtos" },
      { pathname: "/cadastros/cbo", title: "Classificação Brasileira de Ocupações" },
      { pathname: "/cadastros/assinantes-legais", title: "Assinantes Legais" },
    ],
  },
];
