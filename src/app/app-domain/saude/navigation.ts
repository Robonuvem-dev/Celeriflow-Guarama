import type { ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

export const saudeNavigation: ModuleNavGroup[] = [
  { title: "Visão geral", items: [
    { title: "Painel", href: "/saude", icon: "layoutDashboard", exact: true },
    { title: "Gerencial", href: "/saude/gerencial", icon: "barChart3" },
    { title: "Relatórios", href: "/saude/relatorios", icon: "fileText" },
  ] },
  { title: "Áreas estratégicas", items: [
    { title: "Atenção Primária", href: "/saude/territorio", icon: "mapPin" },
    { title: "Famílias e acompanhamentos", href: "/saude/territorio/atencao-primaria", icon: "users" },
    { title: "Assistência Farmacêutica", href: "/saude/farmacia", icon: "pill" },
    { title: "Central de Regulação", href: "/saude/regulacao", icon: "clipboardList" },
  ] },
  { title: "Atendimento", items: [
    { title: "Agenda", href: "/saude/agenda", icon: "calendar" },
    { title: "Agendas e esperas", href: "/saude/agenda/gestao", icon: "clipboardList" },
    { title: "Acolhimento", href: "/saude/acolhimento", icon: "heartPulse" },
    { title: "Pronto Atendimento", href: "/saude/pronto-atendimento", icon: "siren" },
    { title: "Atendimentos", href: "/saude/atendimentos", icon: "clipboardList" },
    { title: "Linhas de cuidado", href: "/saude/linhas-cuidado", icon: "heartPulse" },
    { title: "Pacientes", href: "/saude/pacientes", icon: "users" },
  ] },
  { title: "Assistência", items: [
    { title: "Vacinação", href: "/saude/vacinacao", icon: "syringe" },
    { title: "Laboratório", href: "/saude/laboratorio", icon: "flaskConical" },
    { title: "Centro Especializado", href: "/saude/centro-especializado", icon: "accessibility" },
  ] },
  { title: "Apoio e produção", items: [
    { title: "Prestador", href: "/saude/prestador", icon: "handshake" },
    { title: "TFD", href: "/saude/tfd", icon: "bus" },
    { title: "Faturamento da Saúde", href: "/saude/producao", icon: "factory" },
  ] },
  { title: "Sistemas da Atenção Primária", items: [
    { title: "SISAB / e-SUS", href: "/saude/sisab", icon: "send" },
    { title: "Integração e-SUS", href: "/saude/esus", icon: "activity" },
  ] },
  { title: "Gestão e controle", items: [
    { title: "Vigilância", href: "/saude/vigilancia", icon: "shieldCheck" },
    { title: "Integrações", href: "/saude/integracoes", icon: "plugZap" },
    { title: "Unidades", href: "/saude/unidades", icon: "building2" },
    { title: "Profissionais", href: "/saude/profissionais", icon: "stethoscope" },
    { title: "Equipes ESF", href: "/saude/equipes", icon: "users" },
    { title: "Administração", href: "/saude/administracao", icon: "settings2" },
    { title: "Rede e coberturas", href: "/saude/administracao/rede", icon: "building2" },
  ] },
];
