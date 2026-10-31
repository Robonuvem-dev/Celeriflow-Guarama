import type { OperationalModuleConfig } from "../routes";

export const operationalModules: OperationalModuleConfig[] = [
  {
    key: "configuracoes",
    moduleTitle: "Configurações",
    moduleCaption: "Integrações e sistema",
    moduleIcon: "settings",
    navigation: [{ title: "Configurações", items: [
      { title: "Painel", href: "/configuracoes", icon: "settings", exact: true },
      { title: "Conexões e Integrações", href: "/configuracoes/integracoes", icon: "cable" },
      { title: "Instância", href: "/configuracoes/instancia", icon: "server" },
      { title: "Módulos", href: "/configuracoes/modulos", icon: "layers" },
      { title: "Perfis de Acesso", href: "/configuracoes/perfis", icon: "shieldCheck" },
      { title: "Usuários", href: "/configuracoes/usuarios", icon: "users" },
      { title: "Workflows e Processos", href: "/configuracoes/processos", icon: "workflow" },
      { title: "Certificados A1", href: "/configuracoes/certificados", icon: "shieldCheck" },
      { title: "Auditoria", href: "/configuracoes/auditoria", icon: "history" },
    ] }],
    routes: [
      { pathname: "/configuracoes/auditoria", title: "Auditoria de Uso" },
      { pathname: "/configuracoes/perfis", title: "Gestão de Perfis e Permissões" },
      { pathname: "/configuracoes/usuarios", title: "Gestão de Usuários" },
      { pathname: "/configuracoes/processos/etapas", title: "Fluxo Legado por Tipo e Assunto" },
    ],
  },
  {
    key: "atendimento",
    moduleTitle: "Atendimento Central",
    moduleCaption: "Canais e chamados",
    moduleIcon: "headphones",
    navigation: [{ title: "Atendimento", items: [
      { title: "Painel Geral", href: "/atendimento", icon: "layoutDashboard", exact: true },
      { title: "Novo Chamado", href: "/atendimento/novo", icon: "plus" },
      { title: "Central de Demandas", href: "/atendimento/central", icon: "listTodo" },
      { title: "Fila do Setor", href: "/atendimento/fila", icon: "headphones" },
      { title: "Ouvidoria", href: "/atendimento/ouvidoria", icon: "messageSquareWarning" },
      { title: "Canais e Assuntos", href: "/atendimento/configuracoes", icon: "settings2" },
      { title: "Relatórios", href: "/atendimento/relatorios", icon: "barChart3" },
    ] }],
    routes: [
      { pathname: "/atendimento/central", title: "Central de Demandas" },
      { pathname: "/atendimento/ouvidoria", title: "Ouvidoria" },
    ],
  },
];
