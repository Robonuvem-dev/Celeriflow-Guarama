"use client";

import { Suspense } from "react";
import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";

const navigation: ModuleNavGroup[] = [
  {
    title: "Painel",
    items: [
      { title: "Painel Tributário", href: "/tributacao", icon: "layoutDashboard", exact: true },
    ],
  },
  {
    title: "Cadastros Fiscais",
    items: [
      { title: "Pessoas e Cadastro Fiscal", href: "/tributacao/pessoas", icon: "userRound" },
      { title: "Cadastro Econômico", href: "/tributacao/economico", icon: "building2" },
      { title: "Eventos e Veículos Econômicos", href: "/tributacao/economico/eventos-veiculos", icon: "clipboardCheck" },
      { title: "Incluir Empresa", href: "/tributacao/economico/novo", icon: "building2" },
      { title: "Contadores", href: "/tributacao/economico/contadores", icon: "userRound" },
      { title: "Alteração Geral Econômica", href: "/tributacao/economico/alteracao-geral", icon: "layers" },
      { title: "Atividades CNAE / CBO / Serviços", href: "/tributacao/economico/atividades", icon: "clipboardCheck" },
      { title: "Alvarás Configurados", href: "/tributacao/alvaras/configurados", icon: "fileCheck" },
      { title: "Processos e Impugnações ITBI", href: "/tributacao/itbi/processos", icon: "fileCheck" },
      { title: "Fila e Comunicação ITBI", href: "/tributacao/itbi/comunicacao", icon: "mailOpen" },
      { title: "ITBI On-line e Tabelionatos", href: "/tributacao/itbi/online", icon: "landmark" },
      { title: "Modelos de Declarações ITBI", href: "/tributacao/itbi/modelos", icon: "fileCheck" },
      { title: "Bloqueios e Avisos ITBI", href: "/tributacao/itbi/bloqueios", icon: "settings" },
      { title: "Cancelamento por Vencimento ITBI", href: "/tributacao/itbi/cancelamento-automatico", icon: "settings" },
      { title: "Alteração Geral da PGV", href: "/tributacao/configuracoes-cadastrais/pgv-lote", icon: "calculator" },
      { title: "Consulta Econômica e Mapa", href: "/tributacao/economico/consulta", icon: "mapPin" },
      { title: "Imóveis (IPTU)", href: "/tributacao/imoveis", icon: "mapPin" },
      { title: "Alteração Geral Imobiliária / BCI", href: "/tributacao/imoveis/alteracao-geral", icon: "layers" },
      { title: "Operações Imobiliárias", href: "/tributacao/imoveis/operacoes", icon: "layers" },
      { title: "Inscrição e Controles Imobiliários", href: "/tributacao/imoveis/configuracao", icon: "settings" },
      { title: "Avaliações IPTU / ITBI", href: "/tributacao/avaliacoes", icon: "calculator" },
      { title: "Simulação de Englobamento", href: "/tributacao/avaliacoes/simulacao", icon: "calculator" },
      { title: "Incluir Imóvel Completo", href: "/tributacao/imoveis/novo", icon: "building2" },
      { title: "Recadastramento", href: "/tributacao/recadastramento", icon: "clipboardCheck" },
      { title: "Base Territorial", href: "/tributacao/base-territorial", icon: "mapPinned" },
      { title: "Catálogos e Formulários", href: "/tributacao/configuracoes-cadastrais", icon: "clipboardCheck" },
      { title: "REDESIM", href: "/tributacao/redesim", icon: "network" },
      { title: "Fontes Cadastrais", href: "/tributacao/fontes-cadastrais", icon: "databaseZap" },
    ],
  },
  {
    title: "Documentos e Arrecadação",
    items: [
      { title: "Motor Fiscal e Arrecadação", href: "/tributacao/motor-fiscal", icon: "calculator" },
      { title: "ITBI — Transmissões", href: "/tributacao/itbi", icon: "landmark" },
      { title: "Domicílio Tributário", href: "/tributacao/domicilio-tributario", icon: "mailOpen" },
      { title: "Alvarás e Licenças", href: "/tributacao/alvaras", icon: "fileCheck" },
      { title: "NFS-e", href: "/tributacao/nfse", icon: "fileText" },
      { title: "Simples Nacional", href: "/tributacao/simples-nacional", icon: "scale" },
      { title: "Arquivos e Termos do Simples", href: "/tributacao/simples-nacional/arquivos", icon: "fileCheck" },
      { title: "ISS Bancário / DES-IF", href: "/tributacao/iss-bancario", icon: "landmark" },
      { title: "Guias e Arrecadação", href: "/tributacao/guias", icon: "receipt" },
      { title: "Calendário de Cotas e Parcelas", href: "/tributacao/calendarios", icon: "calculator" },
      { title: "Notificações e Avisos de Débitos", href: "/tributacao/notificacoes", icon: "mailOpen" },
      { title: "Cobrança e Parcelamentos", href: "/tributacao/cobranca", icon: "handCoins" },
      { title: "Dívida Ativa, Protesto e Execução", href: "/tributacao/divida-ativa", icon: "gavel" },
      { title: "Dívida Ativa", href: "/tributacao/divida", icon: "banknote" },
      { title: "Cemitérios", href: "/tributacao/cemiterios", icon: "cross" },
      { title: "VAF — Valor Adicionado", href: "/tributacao/vaf", icon: "landmark" },
      { title: "BI Tributário", href: "/tributacao/bi-tributario", icon: "barChart3" },
      { title: "Comparativo Anual", href: "/tributacao/comparativo-anual", icon: "barChart3" },
      { title: "Resumo Anual dos Tributos", href: "/tributacao/resumo-anual", icon: "barChart3" },
      { title: "Certidões", href: "/tributacao/certidoes", icon: "fileBadge" },
    ],
  },
  {
    title: "Controle",
    items: [
      { title: "Fiscalização", href: "/tributacao/fiscalizacao", icon: "shieldAlert" },
      { title: "Operações Internas", href: "/tributacao/operacoes", icon: "scale" },
    ],
  },
];

export default function TributacaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <ModuleShell
        moduleTitle="Tributação"
        moduleCaption="Gestão Fiscal"
        moduleIcon="building2"
        navigation={navigation}
      >
        {children}
      </ModuleShell>
    </Suspense>
  );
}
