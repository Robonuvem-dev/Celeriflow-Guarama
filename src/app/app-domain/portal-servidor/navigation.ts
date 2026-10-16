import type { ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

export const portalServidorNavigation: ModuleNavGroup[] = [
  {
    title: "Minha área",
    items: [
      {
        title: "Painel pessoal",
        href: "/portal-servidor",
        icon: "layoutDashboard",
        exact: true,
      },
      {
        title: "Minha ficha",
        href: "/portal-servidor/ficha-funcional",
        icon: "userRound",
      },
    ],
  },
  {
    title: "Consultas",
    items: [
      { title: "Emissões funcionais", href: "/portal-servidor/emissoes", icon: "fileText" },
      { title: "Documentos e declarações", href: "/portal-servidor/documentos-funcionais", icon: "fileSignature" },
      { title: "Meus relatórios", href: "/portal-servidor/relatorios", icon: "fileText" },
      {
        title: "Documentos e assinaturas",
        href: "/portal-servidor/documentos",
        icon: "fileSignature",
      },
      {
        title: "Meu ponto",
        href: "/portal-servidor/ponto",
        icon: "clock3",
      },
      {
        title: "Férias e afastamentos",
        href: "/portal-servidor/ferias",
        icon: "calendarDays",
      },
      {
        title: "Meus benefícios",
        href: "/portal-servidor/beneficios",
        icon: "walletCards",
      },
      {
        title: "Demonstrativo de folha",
        href: "/portal-servidor/folha",
        icon: "receiptText",
      },
      { title: "Contracheques completos", href: "/portal-servidor/demonstrativos", icon: "receiptText" },
      { title: "Banco de horas", href: "/portal-servidor/banco-horas", icon: "clock3" },
      { title: "Licença-prêmio", href: "/portal-servidor/licenca-premio", icon: "calendarDays" },
      { title: "Margem consignável", href: "/portal-servidor/margem", icon: "walletCards" },
      { title: "Minhas consignações", href: "/portal-servidor/consignacoes", icon: "receiptText" },
    ],
  },
  {
    title: "Solicitar serviços",
    items: [
      { title: "Catálogo funcional", href: "/portal-servidor/servicos", icon: "clipboardList" },
      { title: "Registrar meu ponto", href: "/portal-servidor/ponto/registro", icon: "clock3" },
      { title: "Meus protocolos", href: "/portal-servidor/protocolos", icon: "fileText" },
      { title: "Pedidos ao RH", href: "/portal-servidor/solicitacoes-rh", icon: "clipboardList" },
      { title: "Recadastramento", href: "/portal-servidor/recadastramento", icon: "userRound" },
      { title: "Crédito consignado", href: "/portal-servidor/credito", icon: "walletCards" },
    ],
  },
  {
    title: "Capacitação e avaliações",
    items: [
      { title: "Cursos e certificados", href: "/portal-servidor/capacitacao", icon: "fileText" },
      { title: "Avaliações funcionais", href: "/portal-servidor/avaliacoes", icon: "clipboardList" },
      { title: "Aniversariantes", href: "/portal-servidor/aniversariantes", icon: "users" },
    ],
  },
  {
    title: "Saúde e segurança ocupacional",
    items: [
      { title: "Minha agenda SST", href: "/portal-servidor/sst/agenda", icon: "calendarDays" },
      { title: "Comunicar acidente (CAT)", href: "/portal-servidor/sst/cat", icon: "fileHeart" },
      { title: "Eleições da CIPA", href: "/portal-servidor/sst/cipa", icon: "users" },
      { title: "Meus planos de saúde", href: "/portal-servidor/sst/planos", icon: "fileHeart" },
      { title: "Meu histórico SST / PPP", href: "/portal-servidor/sst/relatorios", icon: "fileText" },
    ],
  },
];
