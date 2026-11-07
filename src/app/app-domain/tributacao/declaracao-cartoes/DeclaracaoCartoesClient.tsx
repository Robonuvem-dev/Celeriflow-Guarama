"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  FileSpreadsheet,
  ShieldCheck,
  Search,
  Filter,
  Printer,
  Download,
  BookOpen,
  AlertCircle,
  Building,
  CheckCircle2,
  HelpCircle,
  Landmark,
  ArrowRight,
} from "lucide-react";

interface CardTransaction {
  id: string;
  adminName: string;
  cnpj: string;
  terminalId: string;
  brand: string;
  merchantName: string;
  merchantCnpj: string;
  competence: string;
  grossAmount: number;
  netAmount: number;
  feeAmount: number;
  taxableBase: number;
  issDue: number;
  status: "Processado" | "Em análise" | "Divergente";
  transactionCount: number;
}

const mockTransactions: CardTransaction[] = [
  {
    id: "tx-1",
    adminName: "Cielo S.A.",
    cnpj: "01.027.058/0001-91",
    terminalId: "POS-98442",
    brand: "Visa / Mastercard",
    merchantName: "Supermercado Guarama Ltda",
    merchantCnpj: "12.345.678/0001-90",
    competence: "01/2026",
    grossAmount: 1850400.5,
    feeAmount: 37008.01,
    netAmount: 1813392.49,
    taxableBase: 37008.01,
    issDue: 1850.4,
    status: "Processado",
    transactionCount: 14200,
  },
  {
    id: "tx-2",
    adminName: "Redecard Instituição de Pagamento S.A.",
    cnpj: "01.425.787/0001-04",
    terminalId: "POS-77120",
    brand: "Mastercard / Elo",
    merchantName: "Farmácia Central Guarama",
    merchantCnpj: "98.765.432/0001-11",
    competence: "01/2026",
    grossAmount: 1420800.0,
    feeAmount: 28416.0,
    netAmount: 1392384.0,
    taxableBase: 28416.0,
    issDue: 1420.8,
    status: "Processado",
    transactionCount: 11150,
  },
  {
    id: "tx-3",
    adminName: "PagSeguro Internet Instituição de Pagamento S.A.",
    cnpj: "08.561.701/0001-01",
    terminalId: "MP-33190",
    brand: "Elo / Hipercard / Pix",
    merchantName: "Restaurante e Lanchonete do Lago",
    merchantCnpj: "45.123.789/0001-55",
    competence: "01/2026",
    grossAmount: 960250.2,
    feeAmount: 24006.25,
    netAmount: 936243.95,
    taxableBase: 24006.25,
    issDue: 1200.31,
    status: "Processado",
    transactionCount: 8940,
  },
  {
    id: "tx-4",
    adminName: "Stone Instituição de Pagamento S.A.",
    cnpj: "16.501.555/0001-57",
    terminalId: "ST-88210",
    brand: "Visa / Elo",
    merchantName: "Auto Posto Alvorada",
    merchantCnpj: "33.222.111/0001-44",
    competence: "02/2026",
    grossAmount: 1150000.0,
    feeAmount: 23000.0,
    netAmount: 1127000.0,
    taxableBase: 23000.0,
    issDue: 1150.0,
    status: "Processado",
    transactionCount: 9780,
  },
];

export default function DeclaracaoCartoesClient() {
  const [selectedAdmin, setSelectedAdmin] = useState<string>("TODOS");
  const [selectedCompetence, setSelectedCompetence] = useState<string>("01/2026");
  const [viewMode, setViewMode] = useState<"sintetica" | "analitica">("sintetica");
  const [activeTab, setActiveTab] = useState<"conta-corrente" | "legislacao">("conta-corrente");
  const [showLegislationModal, setShowLegislationModal] = useState<boolean>(false);
  const [searchTerminal, setSearchTerminal] = useState<string>("");

  const filtered = mockTransactions.filter((tx) => {
    const matchAdmin = selectedAdmin === "TODOS" || tx.adminName.includes(selectedAdmin);
    const matchComp = !selectedCompetence || tx.competence === selectedCompetence;
    const matchTerm = !searchTerminal || tx.terminalId.toLowerCase().includes(searchTerminal.toLowerCase()) || tx.merchantName.toLowerCase().includes(searchTerminal.toLowerCase());
    return matchAdmin && matchComp && matchTerm;
  });

  const totalGross = filtered.reduce((acc, cur) => acc + cur.grossAmount, 0);
  const totalFees = filtered.reduce((acc, cur) => acc + cur.feeAmount, 0);
  const totalIss = filtered.reduce((acc, cur) => acc + cur.issDue, 0);
  const totalTxs = filtered.reduce((acc, cur) => acc + cur.transactionCount, 0);

  const handlePrint = () => {
    window.print();
  };

  const handleExportCsv = () => {
    const headers = viewMode === "sintetica"
      ? "Administradora;CNPJ;Competência;Transações;Valor Bruto;Taxa Adm (Base ISS);ISSQN Devido;Status\n"
      : "Administradora;CNPJ;Terminal/POS;Estabelecimento;CNPJ Estabelecimento;Bandeira;Competência;Transações;Valor Bruto;Taxa Adm (Base ISS);ISSQN Devido;Status\n";

    const rows = filtered.map((tx) => {
      if (viewMode === "sintetica") {
        return `"${tx.adminName}";"${tx.cnpj}";"${tx.competence}";${tx.transactionCount};${tx.grossAmount.toFixed(2)};${tx.feeAmount.toFixed(2)};${tx.issDue.toFixed(2)};"${tx.status}"`;
      }
      return `"${tx.adminName}";"${tx.cnpj}";"${tx.terminalId}";"${tx.merchantName}";"${tx.merchantCnpj}";"${tx.brand}";"${tx.competence}";${tx.transactionCount};${tx.grossAmount.toFixed(2)};${tx.feeAmount.toFixed(2)};${tx.issDue.toFixed(2)};"${tx.status}"`;
    }).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `conta_corrente_cartoes_${viewMode}_${selectedCompetence.replace("/", "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho de Navegação e Título */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link href="/tributacao" className="hover:underline">Tributação</Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Declaração de Cartões (CF29)</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-blue-600" />
            Declaração das Administradoras de Cartões de Crédito e Débito
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Gestão do conta corrente sintético e analítico das movimentações financeiras, credenciamento e retenção de ISSQN incidente sobre operações de meios de pagamento.
          </p>
        </div>

        {/* Ações Rápidas */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowLegislationModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition"
            title="Visualização da legislação e obrigatoriedade de cadastro de equipamentos (29.2)"
          >
            <BookOpen className="w-4 h-4" />
            Obrigatoriedade e Legislação (29.2)
          </button>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-semibold transition"
            title="Exportar dados do conta corrente em planilha"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-xs font-semibold transition shadow-sm"
            title="Consultar e emitir conta corrente sintético/analítico oficial (29.6)"
          >
            <Printer className="w-4 h-4" />
            Emitir Conta Corrente (29.6)
          </button>
        </div>
      </div>

      {/* Navegação entre Abas: Conta Corrente vs Legislação */}
      <div className="flex border-b border-slate-200 gap-4 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab("conta-corrente")}
          className={`pb-2 px-1 border-b-2 transition ${
            activeTab === "conta-corrente"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Conta Corrente das Administradoras (29.6)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("legislacao")}
          className={`pb-2 px-1 border-b-2 transition ${
            activeTab === "legislacao"
              ? "border-blue-600 text-blue-700 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Obrigatoriedade e Cadastro de Equipamentos (29.2)
        </button>
      </div>

      {activeTab === "conta-corrente" && (
        <div className="space-y-6">
          {/* Cards de Resumo Sintético do Período */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Volume Transacionado</span>
              <div className="text-xl font-bold text-slate-900 mt-1">
                R$ {totalGross.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <span className="text-xs text-slate-500">{totalTxs.toLocaleString("pt-BR")} transações registradas</span>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Taxa de Administração (Base ISS)</span>
              <div className="text-xl font-bold text-blue-700 mt-1">
                R$ {totalFees.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <span className="text-xs text-slate-500">Receita auferida pelas operadoras</span>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ISSQN Devido / Apurado</span>
              <div className="text-xl font-bold text-emerald-700 mt-1">
                R$ {totalIss.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
              <span className="text-xs text-emerald-600 font-medium">Alíquota municipal incidente (5%)</span>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status da Conciliação</span>
              <div className="text-xl font-bold text-slate-800 mt-1 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                Regular
              </div>
              <span className="text-xs text-slate-500">Conformidade DIMP / COTEPE</span>
            </div>
          </div>

          {/* Filtros e Controle de Visualização Sintética/Analítica (Requisito 29.6) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => setViewMode("sintetica")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                      viewMode === "sintetica" ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-600"
                    }`}
                  >
                    Visão Sintética
                  </button>
                  <button
                    onClick={() => setViewMode("analitica")}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                      viewMode === "analitica" ? "bg-white text-slate-900 shadow-sm font-semibold" : "text-slate-600"
                    }`}
                  >
                    Visão Analítica
                  </button>
                </div>
                <span className="text-xs text-slate-500">
                  Modo selecionado: <strong>{viewMode === "sintetica" ? "Sintético (Totais Agrupados por Administradora)" : "Analítico (Detalhamento por Terminal/POS e Estabelecimento)"}</strong>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Buscar terminal ou loja…"
                  value={searchTerminal}
                  onChange={(e) => setSearchTerminal(e.target.value)}
                  className="p-1.5 border rounded-lg text-xs bg-white text-slate-700 w-44"
                />
                <select
                  value={selectedAdmin}
                  onChange={(e) => setSelectedAdmin(e.target.value)}
                  className="p-1.5 border rounded-lg text-xs bg-white text-slate-700"
                >
                  <option value="TODOS">Todas as Administradoras</option>
                  <option value="Cielo">Cielo S.A.</option>
                  <option value="Redecard">Redecard / Rede</option>
                  <option value="PagSeguro">PagSeguro</option>
                  <option value="Stone">Stone Pagamentos</option>
                </select>
                <select
                  value={selectedCompetence}
                  onChange={(e) => setSelectedCompetence(e.target.value)}
                  className="p-1.5 border rounded-lg text-xs bg-white text-slate-700"
                >
                  <option value="01/2026">Competência 01/2026</option>
                  <option value="02/2026">Competência 02/2026</option>
                </select>
              </div>
            </div>

            {/* Tabela de Conta Corrente Sintética / Analítica (29.6) */}
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                  <tr>
                    <th className="p-3">Administradora de Cartão</th>
                    <th className="p-3">CNPJ</th>
                    {viewMode === "analitica" && (
                      <>
                        <th className="p-3">Terminal / POS</th>
                        <th className="p-3">Estabelecimento Vinculado</th>
                        <th className="p-3">Bandeira</th>
                      </>
                    )}
                    <th className="p-3">Competência</th>
                    <th className="p-3 text-right">Qtd Transações</th>
                    <th className="p-3 text-right">Valor Bruto Transacionado</th>
                    <th className="p-3 text-right">Taxa Adm (Base ISS)</th>
                    <th className="p-3 text-right">ISSQN Calculado</th>
                    <th className="p-3 text-center">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-slate-700">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={viewMode === "analitica" ? 11 : 8} className="p-4 text-center text-slate-500">
                        Nenhuma movimentação de cartão localizada para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-900">{item.adminName}</td>
                        <td className="p-3 font-mono text-slate-600">{item.cnpj}</td>
                        {viewMode === "analitica" && (
                          <>
                            <td className="p-3 font-mono font-bold text-blue-700">{item.terminalId}</td>
                            <td className="p-3">
                              <span className="font-semibold block">{item.merchantName}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{item.merchantCnpj}</span>
                            </td>
                            <td className="p-3 text-slate-600">{item.brand}</td>
                          </>
                        )}
                        <td className="p-3 font-mono">{item.competence}</td>
                        <td className="p-3 text-right font-medium">{item.transactionCount.toLocaleString("pt-BR")}</td>
                        <td className="p-3 text-right font-semibold">
                          R$ {item.grossAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right text-blue-700 font-medium">
                          R$ {item.feeAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right text-emerald-700 font-bold">
                          R$ {item.issDue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-50 font-bold border-t text-slate-900">
                  <tr>
                    <td className="p-3" colSpan={viewMode === "analitica" ? 6 : 3}>Total Geral do Conta Corrente ({filtered.length} registro(s))</td>
                    <td className="p-3 text-right">{totalTxs.toLocaleString("pt-BR")}</td>
                    <td className="p-3 text-right">R$ {totalGross.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="p-3 text-right text-blue-700">R$ {totalFees.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="p-3 text-right text-emerald-700">R$ {totalIss.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="p-3 text-center">
                      <span className="text-[10px] text-emerald-700">Auditado</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Aba de Obrigatoriedade e Legislação Pertinente (Requisito 29.2) */}
      {activeTab === "legislacao" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center gap-2 border-b pb-3">
            <BookOpen className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              Obrigatoriedade e Legislação do Cadastro de Equipamentos de Cartão (Requisito 29.2)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-900">
              <div className="flex items-center gap-2 font-bold text-sm text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-700" />
                Vínculo Obrigatório POS / CNPJ
              </div>
              <p>
                Todo equipamento emissor de comprovante eletrônico (POS, TEF, SmartPOS) operando no território municipal deve estar estritamente cadastrado e vinculado ao CNPJ e Inscrição Municipal do estabelecimento em que realiza a captura da transação.
              </p>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2 text-xs text-blue-900">
              <div className="flex items-center gap-2 font-bold text-sm text-blue-950">
                <Landmark className="w-4 h-4 text-blue-700" />
                Incidência de ISSQN (Subitem 15.01)
              </div>
              <p>
                Os serviços de administração de cartões de crédito e débito, credenciamento e remuneração sobre meios de pagamento sujeitam-se à alíquota de ISSQN devida ao município onde ocorreu o fornecimento do serviço financeiro.
              </p>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2 text-xs text-emerald-900">
              <div className="flex items-center gap-2 font-bold text-sm text-emerald-950">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                Cruzamento de Informações DIMP
              </div>
              <p>
                As informações transmitidas mensalmente pelas operadoras através do padrão DIMP (Ato COTEPE 65/2018) são automaticamente confrontadas com as Notas Fiscais Eletrônicas e declarações municipais para detecção de inconsistências fiscais.
              </p>
            </div>
          </div>

          <div className="space-y-4 text-xs text-slate-700">
            <h3 className="font-bold text-sm text-slate-900">Quadro Normativo Pertinente:</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Lei Complementar Federal nº 116/2003 (subitem 15.01):</strong> Define a incidência do ISS sobre a administração de cartões de crédito, débito e assemelhados.
              </li>
              <li>
                <strong>Lei Complementar Federal nº 157/2016 e LC nº 175/2020:</strong> Fixam o padrão de declaração eletrônica nacional e as obrigações acessórias das instituições financeiras e operadoras de pagamento.
              </li>
              <li>
                <strong>Convênio ICMS nº 134/2016 e Ajuste SINIEF:</strong> Regras de cadastramento de equipamentos de transferência eletrônica de fundos e emissão simultânea de comprovante fiscal.
              </li>
              <li>
                <strong>Ato COTEPE/ICMS nº 65/2018 (DIMP):</strong> Estabelece o layout oficial da Declaração de Informações de Meios de Pagamentos entregue pelas credenciadoras aos Fiscos municipais e estaduais.
              </li>
              <li>
                <strong>Código Tributário Municipal:</strong> Prevê a obrigação acessória de cadastramento prévio dos terminais POS e as sanções pecuniárias para o uso de equipamentos não vinculados à inscrição municipal.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Modal de Obrigatoriedade e Legislação Pertinente (29.2) */}
      {showLegislationModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Obrigatoriedade e Legislação de Cartões e Equipamentos (Requisito 29.2)
                </h3>
              </div>
              <button
                onClick={() => setShowLegislationModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-3 text-amber-900">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Obrigatoriedade Legal de Cadastro de Equipamentos (POS / TEF)</h4>
                  <p className="mt-1">
                    Conforme a Legislação Tributária Municipal e o Convênio ICMS nº 134/2016, todas as empresas que operam com pagamentos eletrônicos devem manter os equipamentos terminais (POS, TEF, smartPOS e links de pagamento) devidamente vinculados ao CNPJ e à Inscrição Municipal do estabelecimento operante.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-sm text-slate-900">1. Base Legal e Normativa Aplicável</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Lei Complementar Federal nº 116/2003 (subitem 15.01):</strong> Incidência de ISSQN sobre a administração de cartões de crédito, débito e congêneres.</li>
                  <li><strong>Lei Complementar Federal nº 157/2016 e LC 175/2020:</strong> Fixação de competência e padrão nacional da obrigação acessória de operadoras financeiras e de cartões.</li>
                  <li><strong>Ato COTEPE/ICMS nº 65/2018 (DIMP):</strong> Declaração de Informações de Meios de Pagamentos obrigatória enviada pelas administradoras ao Fisco.</li>
                  <li><strong>Código Tributário Municipal:</strong> Obrigação de envio mensal da movimentação e retenção de ISSQN até o 10º dia do mês subsequente.</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-sm text-slate-900">2. Penalidades pelo Não Cadastramento</h4>
                <p>
                  O uso de equipamento emissor de comprovante ou terminal POS registrado em CNPJ divergente ou sem cadastro prévio no Cadastro Econômico Municipal sujeita o contribuinte e a administradora à apreensão do equipamento e aplicação de penalidade pecuniária por infração tributária.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-sm text-slate-900">3. Cruzamento com Faturamento Declarado</h4>
                <p>
                  As informações prestadas mensalmente pelas credenciadoras através deste módulo de Declaração de Cartões são automaticamente confrontadas com as Notas Fiscais de Serviços Eletrônicas (NFS-e) e com a DASN/PGDAS-D para apuração de eventuais omissões de receita.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                onClick={() => setShowLegislationModal(false)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800"
              >
                Entendido / Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
