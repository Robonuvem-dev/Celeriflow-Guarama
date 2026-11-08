"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  Printer,
  Scale,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

export type RelatorioContratoRow = {
  id: string;
  number: string;
  processNumber: string;
  processModality: string;
  processYear: string;
  supplierId: string;
  supplierName: string;
  supplierDocument: string;
  object: string;
  secretariatName: string;
  sourceBudgetUnitCode: string;
  sourceBudgetUnitName: string;
  resourceSourceCode: string;
  resourceSourceName: string;
  startDate: string;
  endDate: string;
  signatureDate: string;
  termDays: number;
  initialValue: number;
  updatedValue: number;
  committedValue: number;
  settledValue: number;
  paidValue: number;
  balanceToCommit: number;
  balanceToPay: number;
  generalBalance: number;
  status: string;
  managerName: string;
  inspectorName: string;
  instrumentType: string;
  executionPercent: number;
  hasAmendments: boolean;
  amendments: {
    id: string;
    type: string;
    justification: string;
    previousValue: number | null;
    newValue: number | null;
    previousEndDate: string | null;
    newEndDate: string | null;
    createdAt: string;
  }[];
  financialImpacts: {
    id: string;
    tipo: string;
    valor: number;
    justificativa: string;
    data: string;
  }[];
  items: {
    id: string;
    description: string;
    quantityContracted: number;
    quantityReceived: number;
    quantityRemaining: number;
    unit: string;
    unitPrice: number;
    totalContracted: number;
    totalReceived: number;
    totalRemaining: number;
  }[];
  daysUntilExpiry: number;
  expiryCategory: "vencido" | "urgente_30" | "atencao_60" | "confortavel";
};

type TabKey =
  | "16.1"
  | "16.2"
  | "16.3"
  | "16.4"
  | "16.18"
  | "16.19"
  | "16.20"
  | "16.21"
  | "16.22"
  | "16.23"
  | "16.24"
  | "16.25"
  | "monitoramento";

const TABS: { key: TabKey; title: string; req: string }[] = [
  { key: "monitoramento", title: "Monitoramento de Contratos & Legenda", req: "16.30" },
  { key: "16.1", title: "Impacto Financeiro por Contrato", req: "16.1" },
  { key: "16.2", title: "Situação Atual dos Contratos", req: "16.2" },
  { key: "16.3", title: "Saldo Geral dos Contratos", req: "16.3" },
  { key: "16.4", title: "Contrato e Processo por Fonte de Recursos", req: "16.4" },
  { key: "16.18", title: "Reemissão Geral de Contratos (Filtros)", req: "16.18" },
  { key: "16.19", title: "Itens para Contrato (Anexo I)", req: "16.19" },
  { key: "16.20", title: "Relatório de Contratos Cadastrados", req: "16.20" },
  { key: "16.21", title: "Contratos que tiveram Aditivos", req: "16.21" },
  { key: "16.22", title: "Contratos por Fornecedor (Múltipla Seleção)", req: "16.22" },
  { key: "16.23", title: "Vencimento de Contratos", req: "16.23" },
  { key: "16.24", title: "Relação por Itens ou Serviços", req: "16.24" },
  { key: "16.25", title: "Saldo Restante de Itens / Serviços", req: "16.25" },
];

function money(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function datePt(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function ContratosRelatoriosClient({
  contracts,
  allSuppliers,
  initialTab = "monitoramento",
}: {
  contracts: RelatorioContratoRow[];
  allSuppliers: { id: string; name: string }[];
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>(
    (TABS.some((t) => t.key === initialTab) ? initialTab : "monitoramento") as TabKey
  );

  // Common filters
  const [search, setSearch] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalidadeFilter, setModalidadeFilter] = useState("");
  const [processoFilter, setProcessoFilter] = useState("");
  const [fonteFilter, setFonteFilter] = useState("");
  const [orderFilter, setOrderFilter] = useState<"alfabetica" | "numerica">("numerica");
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [filtroVencimento, setFiltroVencimento] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [selectedContractNumber, setSelectedContractNumber] = useState<string>("");

  const modalidades = Array.from(new Set(contracts.map((c) => c.processModality).filter(Boolean)));
  const fontes = Array.from(
    new Set(contracts.map((c) => `${c.sourceBudgetUnitCode} - ${c.sourceBudgetUnitName}`).filter(Boolean))
  );
  const anosContrato = Array.from(
    new Set(contracts.map((c) => (c.startDate ? c.startDate.slice(0, 4) : "")).filter(Boolean))
  ).sort().reverse();

  // Filtered dataset
  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      if (search) {
        const s = search.toLowerCase();
        const matches =
          c.number.toLowerCase().includes(s) ||
          c.supplierName.toLowerCase().includes(s) ||
          c.object.toLowerCase().includes(s) ||
          c.processNumber.toLowerCase().includes(s);
        if (!matches) return false;
      }
      if (statusFilter && c.status !== statusFilter) return false;
      if (modalidadeFilter && c.processModality !== modalidadeFilter) return false;
      if (processoFilter && !c.processNumber.toLowerCase().includes(processoFilter.toLowerCase())) return false;
      if (fonteFilter && !`${c.sourceBudgetUnitCode} - ${c.sourceBudgetUnitName}`.includes(fonteFilter)) return false;
      if (selectedYear && !c.startDate.startsWith(selectedYear)) return false;
      if (selectedContractNumber && !c.number.includes(selectedContractNumber)) return false;

      if (dataInicio) {
        const start = c.startDate.slice(0, 10);
        if (start < dataInicio) return false;
      }
      if (dataFim) {
        const end = c.endDate.slice(0, 10);
        if (end > dataFim) return false;
      }

      if (selectedSuppliers.length > 0 && !selectedSuppliers.includes(c.supplierId)) {
        return false;
      }

      if (filtroVencimento) {
        if (filtroVencimento === "vencidos" && c.expiryCategory !== "vencido") return false;
        if (filtroVencimento === "proximos_30" && c.expiryCategory !== "urgente_30") return false;
        if (filtroVencimento === "proximos_60" && c.expiryCategory !== "atencao_60") return false;
        if (filtroVencimento === "vigentes" && c.expiryCategory === "vencido") return false;
      }

      return true;
    }).sort((a, b) => {
      if (orderFilter === "alfabetica") {
        return a.supplierName.localeCompare(b.supplierName, "pt-BR");
      }
      return b.updatedValue - a.updatedValue || a.number.localeCompare(b.number, "pt-BR", { numeric: true });
    });
  }, [
    contracts,
    search,
    statusFilter,
    modalidadeFilter,
    processoFilter,
    fonteFilter,
    dataInicio,
    dataFim,
    selectedSuppliers,
    filtroVencimento,
    selectedYear,
    selectedContractNumber,
    orderFilter,
  ]);

  // Aggregate totals
  const totalContratado = filtered.reduce((acc, c) => acc + c.updatedValue, 0);
  const totalEmpenhado = filtered.reduce((acc, c) => acc + c.committedValue, 0);
  const totalLiquidado = filtered.reduce((acc, c) => acc + c.settledValue, 0);
  const totalPago = filtered.reduce((acc, c) => acc + c.paidValue, 0);
  const totalSaldoGeral = filtered.reduce((acc, c) => acc + c.generalBalance, 0);
  const totalSaldoAEmpenhar = filtered.reduce((acc, c) => acc + c.balanceToCommit, 0);

  // Monitoring stats
  const countVencidos = contracts.filter((c) => c.expiryCategory === "vencido").length;
  const countUrgente30 = contracts.filter((c) => c.expiryCategory === "urgente_30").length;
  const countAtencao60 = contracts.filter((c) => c.expiryCategory === "atencao_60").length;
  const countConfortavel = contracts.filter((c) => c.expiryCategory === "confortavel").length;

  function exportCsv() {
    const headers = [
      "Numero",
      "Processo",
      "Fornecedor",
      "CNPJ_CPF",
      "Objeto",
      "Secretaria",
      "UG_Fonte",
      "Inicio",
      "Fim",
      "Situacao",
      "Valor_Atualizado",
      "Empenhado",
      "Liquidado",
      "Pago",
      "Saldo_Geral",
    ];
    const lines = filtered.map((c) =>
      [
        `"${c.number}"`,
        `"${c.processNumber}"`,
        `"${c.supplierName.replace(/"/g, '""')}"`,
        `"${c.supplierDocument}"`,
        `"${c.object.replace(/"/g, '""')}"`,
        `"${c.secretariatName}"`,
        `"${c.sourceBudgetUnitCode} - ${c.sourceBudgetUnitName}"`,
        `"${datePt(c.startDate)}"`,
        `"${datePt(c.endDate)}"`,
        `"${c.status}"`,
        c.updatedValue.toFixed(2),
        c.committedValue.toFixed(2),
        c.settledValue.toFixed(2),
        c.paidValue.toFixed(2),
        c.generalBalance.toFixed(2),
      ].join(";")
    );
    const content = "\uFEFF" + [headers.join(";"), ...lines].join("\r\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_contratos_${activeTab}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageFrame className="mx-auto max-w-7xl space-y-4 p-4 print:max-w-none print:p-0">
      {/* Header com Ações Globais */}
      <header className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Link href="/compras/contratos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="size-3.5 mr-1" />
              Voltar para Contratos
            </Button>
          </Link>
          <Badge variant="outline" className="text-xs bg-slate-50">
            Módulo CF16 — Contratos & Relatórios
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5 mr-1" />
            Imprimir Relatório
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-3.5 mr-1" />
            Exportar CSV
          </Button>
        </div>
      </header>

      {/* Tabs Selector */}
      <div className="overflow-x-auto print:hidden">
        <div className="flex border-b border-slate-200 bg-white p-1 rounded-t-lg gap-1 min-w-max">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
                  isActive
                    ? "bg-sky-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span className="rounded bg-black/10 px-1 py-0.2 text-[10px] font-mono">
                  {tab.req}
                </span>
                {tab.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtros Parametrizáveis */}
      <Card className="print:hidden">
        <CardHeader className="border-b p-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Filter className="size-4 text-sky-800" />
            Parâmetros e Filtros do Relatório ({TABS.find((t) => t.key === activeTab)?.title})
          </CardTitle>
          <CardDescription className="text-xs">
            Ajuste os filtros de pesquisa, datas, ordenação e seleção de fornecedores conforme os requisitos do módulo.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            <div>
              <label className="font-semibold block mb-1">Buscar (Número, Objeto, Credor):</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ex.: 01/2026, Pavimentação, Empresa X..."
                className="w-full rounded border p-2"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Data Inicial (Vigência / Assinatura):</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full rounded border p-2"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Data Final:</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full rounded border p-2"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Ordenação:</label>
              <select
                value={orderFilter}
                onChange={(e) => setOrderFilter(e.target.value as "alfabetica" | "numerica")}
                className="w-full rounded border p-2"
              >
                <option value="numerica">Numérica (por valor / número decrescente)</option>
                <option value="alfabetica">Alfabética (por nome do fornecedor / credor)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs pt-2 border-t">
            <div>
              <label className="font-semibold block mb-1">Situação do Contrato:</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded border p-2"
              >
                <option value="">Todas as situações</option>
                <option value="Vigente">Vigente</option>
                <option value="Minuta">Minuta / Elaboração</option>
                <option value="Encerrado">Encerrado</option>
                <option value="Suspenso">Suspenso</option>
                <option value="Rescindido">Rescindido</option>
                <option value="Anulado">Anulado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="font-semibold block mb-1">Modalidade do Processo:</label>
              <select
                value={modalidadeFilter}
                onChange={(e) => setModalidadeFilter(e.target.value)}
                className="w-full rounded border p-2"
              >
                <option value="">Todas as modalidades</option>
                {modalidades.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold block mb-1">Fonte de Recursos / Unidade Gestora:</label>
              <select
                value={fonteFilter}
                onChange={(e) => setFonteFilter(e.target.value)}
                className="w-full rounded border p-2"
              >
                <option value="">Todas as fontes / UG</option>
                {fontes.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-semibold block mb-1">Filtro de Vencimento:</label>
              <select
                value={filtroVencimento}
                onChange={(e) => setFiltroVencimento(e.target.value)}
                className="w-full rounded border p-2"
              >
                <option value="">Todos os vencimentos</option>
                <option value="proximos_30">Vencimento próximo em até 30 dias</option>
                <option value="proximos_60">Vencimento em 31 a 60 dias</option>
                <option value="vencidos">Contratos Vencidos</option>
                <option value="vigentes">Contratos Vigentes (não vencidos)</option>
              </select>
            </div>
          </div>

          {/* Seleção Múltipla de Fornecedores (CF16 — 16.22) */}
          {(activeTab === "16.22" || selectedSuppliers.length > 0) && (
            <div className="pt-2 border-t text-xs">
              <label className="font-semibold block mb-1 text-sky-950">
                Seleção Múltipla de Fornecedores (CF16 — 16.22) — {selectedSuppliers.length} selecionado(s):
              </label>
              <div className="max-h-28 overflow-y-auto rounded border bg-slate-50 p-2 grid sm:grid-cols-2 md:grid-cols-3 gap-1.5">
                {allSuppliers.map((sup) => {
                  const isChecked = selectedSuppliers.includes(sup.id);
                  return (
                    <label key={sup.id} className="flex items-center gap-1.5 cursor-pointer hover:bg-slate-100 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedSuppliers((prev) =>
                            isChecked ? prev.filter((id) => id !== sup.id) : [...prev, sup.id]
                          );
                        }}
                        className="rounded text-sky-900"
                      />
                      <span className="truncate" title={sup.name}>
                        {sup.name}
                      </span>
                    </label>
                  );
                })}
              </div>
              {selectedSuppliers.length > 0 && (
                <button
                  onClick={() => setSelectedSuppliers([])}
                  className="mt-1 text-[11px] text-rose-600 underline"
                >
                  Limpar seleção de fornecedores
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totais Gerais Consolidados */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
        <div className="rounded border bg-white p-2.5">
          <span className="text-slate-500 block">Total de Contratos</span>
          <strong className="text-base text-slate-900">{filtered.length}</strong>
        </div>
        <div className="rounded border bg-white p-2.5">
          <span className="text-slate-500 block">Total Contratado</span>
          <strong className="text-base text-sky-900">{money(totalContratado)}</strong>
        </div>
        <div className="rounded border bg-white p-2.5">
          <span className="text-slate-500 block">Total Empenhado</span>
          <strong className="text-base text-indigo-900">{money(totalEmpenhado)}</strong>
        </div>
        <div className="rounded border bg-white p-2.5">
          <span className="text-slate-500 block">Total Liquidado</span>
          <strong className="text-base text-amber-900">{money(totalLiquidado)}</strong>
        </div>
        <div className="rounded border bg-white p-2.5">
          <span className="text-slate-500 block">Total Pago</span>
          <strong className="text-base text-emerald-900">{money(totalPago)}</strong>
        </div>
        <div className="rounded border bg-white p-2.5">
          <span className="text-slate-500 block">Saldo Geral a Pagar</span>
          <strong className="text-base text-slate-900">{money(totalSaldoGeral)}</strong>
        </div>
      </div>

      {/* Conteúdo Dinâmico por Aba */}
      {/* 1. ABA DE MONITORAMENTO COM LEGENDA VISUAL (CF16 — 16.30) */}
      {activeTab === "monitoramento" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-4">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 mb-2">
              <Clock className="size-4 text-sky-800" />
              Legenda Visual de Monitoramento de Vencimentos (CF16 — 16.30)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 p-3">
                <div className="flex items-center justify-between">
                  <strong className="text-emerald-900 flex items-center gap-1.5">
                    <span className="size-3 rounded-full bg-emerald-600 inline-block" />
                    Prazo Confortável (&gt; 60 dias)
                  </strong>
                  <span className="rounded bg-emerald-200 px-2 py-0.5 font-bold text-emerald-900">
                    {countConfortavel}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-emerald-800">
                  Contratos plenamente vigentes com mais de 2 meses para o término.
                </p>
              </div>

              <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3">
                <div className="flex items-center justify-between">
                  <strong className="text-amber-900 flex items-center gap-1.5">
                    <span className="size-3 rounded-full bg-amber-500 inline-block" />
                    Atenção (31 a 60 dias)
                  </strong>
                  <span className="rounded bg-amber-200 px-2 py-0.5 font-bold text-amber-900">
                    {countAtencao60}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-amber-800">
                  Avaliar prorrogação, novo termo aditivo ou nova licitação.
                </p>
              </div>

              <div className="rounded-lg border border-orange-300 bg-orange-50/70 p-3">
                <div className="flex items-center justify-between">
                  <strong className="text-orange-900 flex items-center gap-1.5">
                    <span className="size-3 rounded-full bg-orange-500 inline-block" />
                    Crítico / Iminente (≤ 30 dias)
                  </strong>
                  <span className="rounded bg-orange-200 px-2 py-0.5 font-bold text-orange-900">
                    {countUrgente30}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-orange-800">
                  Vencimento nos próximos 30 dias. Ação urgente necessária.
                </p>
              </div>

              <div className="rounded-lg border border-rose-300 bg-rose-50/70 p-3">
                <div className="flex items-center justify-between">
                  <strong className="text-rose-900 flex items-center gap-1.5">
                    <span className="size-3 rounded-full bg-rose-600 inline-block" />
                    Contrato Vencido
                  </strong>
                  <span className="rounded bg-rose-200 px-2 py-0.5 font-bold text-rose-900">
                    {countVencidos}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-rose-800">
                  Data de término já expirada. Verificar encerramento ou termo final.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b text-slate-600 font-semibold">
                  <tr>
                    <th className="p-2.5">Alerta / Legenda</th>
                    <th className="p-2.5">Contrato</th>
                    <th className="p-2.5">Fornecedor / Credor</th>
                    <th className="p-2.5">Objeto</th>
                    <th className="p-2.5">Vigência</th>
                    <th className="p-2.5">Dias Restantes</th>
                    <th className="p-2.5 text-right">Valor Total</th>
                    <th className="p-2.5 text-right">Saldo a Pagar</th>
                    <th className="p-2.5">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((c) => {
                    const badgeClass =
                      c.expiryCategory === "confortavel"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                        : c.expiryCategory === "atencao_60"
                        ? "bg-amber-100 text-amber-800 border-amber-300"
                        : c.expiryCategory === "urgente_30"
                        ? "bg-orange-100 text-orange-800 border-orange-300 font-bold"
                        : "bg-rose-100 text-rose-800 border-rose-300 font-bold";
                    const badgeText =
                      c.expiryCategory === "confortavel"
                        ? "Confortável (>60d)"
                        : c.expiryCategory === "atencao_60"
                        ? "Atenção (31–60d)"
                        : c.expiryCategory === "urgente_30"
                        ? "Urgente (≤30d)"
                        : "Vencido";

                    return (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="p-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] border ${badgeClass}`}>
                            {badgeText}
                          </span>
                        </td>
                        <td className="p-2.5 font-bold text-sky-950">
                          <Link href={`/compras/contratos/${c.id}`} className="hover:underline">
                            {c.number}
                          </Link>
                        </td>
                        <td className="p-2.5 font-medium">{c.supplierName}</td>
                        <td className="p-2.5 max-w-xs truncate" title={c.object}>
                          {c.object}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {datePt(c.startDate)} a {datePt(c.endDate)}
                        </td>
                        <td className="p-2.5">
                          {c.daysUntilExpiry < 0 ? (
                            <span className="text-rose-700 font-bold">Venceu há {Math.abs(c.daysUntilExpiry)}d</span>
                          ) : (
                            <span>{c.daysUntilExpiry} dia(s)</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-semibold">{money(c.updatedValue)}</td>
                        <td className="p-2.5 text-right font-semibold text-slate-700">{money(c.generalBalance)}</td>
                        <td className="p-2.5">
                          <Badge variant="outline">{c.status}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. ABA: IMPACTO FINANCEIRO POR CONTRATO (CF16 — 16.1) */}
      {activeTab === "16.1" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-3">
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              Relatório de Impacto Financeiro por Contrato (CF16 — 16.1)
            </h3>
            <p className="text-xs text-slate-500">
              Demonstra todas as solicitações e eventos de impacto financeiro (dotações, aditivos de valor, reservas, empenhos, medições, liquidações e pagamentos).
            </p>
          </div>
          <div className="space-y-3">
            {filtered.map((c) => (
              <Card key={c.id}>
                <CardHeader className="p-3 border-b bg-slate-50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm font-bold text-slate-900">
                      Contrato {c.number} — {c.supplierName}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Processo: {c.processNumber}</span>
                      <Badge variant="outline">{c.status}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 text-xs space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <span className="text-slate-500 block">Valor Inicial:</span>
                      <strong>{money(c.initialValue)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Valor Atualizado:</span>
                      <strong className="text-sky-900">{money(c.updatedValue)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Total Empenhado:</span>
                      <strong>{money(c.committedValue)}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Total Liquidado / Pago:</span>
                      <strong>{money(c.settledValue)} / {money(c.paidValue)}</strong>
                    </div>
                  </div>

                  {/* Impactos de Aditamentos / Movimentos */}
                  {c.financialImpacts.length > 0 && (
                    <div className="rounded border p-2 bg-amber-50/50">
                      <strong className="block text-[11px] text-amber-900 mb-1">
                        Solicitações de Impacto Financeiro / Aditamentos Registrados ({c.financialImpacts.length}):
                      </strong>
                      <div className="space-y-1">
                        {c.financialImpacts.map((imp) => (
                          <div key={imp.id} className="flex justify-between text-[11px]">
                            <span>{imp.tipo} — {imp.justificativa}</span>
                            <span className="font-bold">{money(imp.valor)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Aditivos de Valor */}
                  {c.amendments.filter((a) => a.newValue !== null).length > 0 && (
                    <div className="rounded border p-2 bg-slate-50">
                      <strong className="block text-[11px] text-slate-700 mb-1">
                        Histórico de Aditivos de Valor:
                      </strong>
                      <div className="space-y-1">
                        {c.amendments
                          .filter((a) => a.newValue !== null)
                          .map((a) => (
                            <div key={a.id} className="flex justify-between text-[11px]">
                              <span>
                                {a.type} em {datePt(a.createdAt)}: {a.justification}
                              </span>
                              <span className="font-semibold">
                                {money(a.previousValue || 0)} → {money(a.newValue || 0)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 3. ABA: SALDO GERAL DOS CONTRATOS (CF16 — 16.3) */}
      {activeTab === "16.3" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-3">
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              Relatório de Saldo Geral dos Contratos (CF16 — 16.3)
            </h3>
            <p className="text-xs text-slate-500">
              Demonstra o valor contratado, empenhado, liquidado, pago, saldo a empenhar e saldo residual a pagar de cada instrumento.
            </p>
          </div>
          <div className="rounded-lg border bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b text-slate-600 font-semibold">
                <tr>
                  <th className="p-2.5">Contrato</th>
                  <th className="p-2.5">Fornecedor</th>
                  <th className="p-2.5 text-right">Contratado</th>
                  <th className="p-2.5 text-right">Empenhado</th>
                  <th className="p-2.5 text-right">Liquidado</th>
                  <th className="p-2.5 text-right">Pago</th>
                  <th className="p-2.5 text-right text-indigo-900">Saldo a Empenhar</th>
                  <th className="p-2.5 text-right text-rose-900 font-bold">Saldo Geral</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-sky-950">{c.number}</td>
                    <td className="p-2.5 truncate max-w-xs">{c.supplierName}</td>
                    <td className="p-2.5 text-right">{money(c.updatedValue)}</td>
                    <td className="p-2.5 text-right">{money(c.committedValue)}</td>
                    <td className="p-2.5 text-right">{money(c.settledValue)}</td>
                    <td className="p-2.5 text-right">{money(c.paidValue)}</td>
                    <td className="p-2.5 text-right font-semibold text-indigo-900">{money(c.balanceToCommit)}</td>
                    <td className="p-2.5 text-right font-bold text-rose-900">{money(c.generalBalance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t">
                <tr>
                  <td colSpan={2} className="p-2.5">Totais Consolidados ({filtered.length} contratos)</td>
                  <td className="p-2.5 text-right">{money(totalContratado)}</td>
                  <td className="p-2.5 text-right">{money(totalEmpenhado)}</td>
                  <td className="p-2.5 text-right">{money(totalLiquidado)}</td>
                  <td className="p-2.5 text-right">{money(totalPago)}</td>
                  <td className="p-2.5 text-right text-indigo-900">{money(totalSaldoAEmpenhar)}</td>
                  <td className="p-2.5 text-right text-rose-900 font-bold">{money(totalSaldoGeral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 4. ABA: FONTE DE RECURSOS (CF16 — 16.4) */}
      {activeTab === "16.4" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-3">
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              Contratos e Processos por Fonte de Recursos (CF16 — 16.4)
            </h3>
            <p className="text-xs text-slate-500">
              Demonstração analítica agrupada pela Unidade Gestora e Fonte de Recursos orçamentária vinculada.
            </p>
          </div>
          <div className="rounded-lg border bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b text-slate-600 font-semibold">
                <tr>
                  <th className="p-2.5">Fonte / Unidade Gestora</th>
                  <th className="p-2.5">Processo</th>
                  <th className="p-2.5">Contrato</th>
                  <th className="p-2.5">Fornecedor</th>
                  <th className="p-2.5">Vigência</th>
                  <th className="p-2.5 text-right">Valor Contratual</th>
                  <th className="p-2.5">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-semibold text-slate-800">
                      {c.sourceBudgetUnitCode} - {c.sourceBudgetUnitName}
                    </td>
                    <td className="p-2.5">{c.processNumber}</td>
                    <td className="p-2.5 font-bold text-sky-950">{c.number}</td>
                    <td className="p-2.5">{c.supplierName}</td>
                    <td className="p-2.5 whitespace-nowrap">{datePt(c.startDate)} a {datePt(c.endDate)}</td>
                    <td className="p-2.5 text-right font-bold">{money(c.updatedValue)}</td>
                    <td className="p-2.5"><Badge variant="outline">{c.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. ABA: ITENS PARA CONTRATO - ANEXO I (CF16 — 16.19) */}
      {activeTab === "16.19" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-3">
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              Relatório de Itens para Contrato — Anexo I (CF16 — 16.19)
            </h3>
            <p className="text-xs text-slate-500">
              Relação dos itens contratados com descrição, quantidades, unidades e valores unitários/totais. Filtre por ano e número do contrato.
            </p>
          </div>
          <div className="space-y-4">
            {filtered.map((c) => (
              <Card key={c.id}>
                <CardHeader className="p-3 border-b bg-slate-50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm font-bold text-slate-900">
                      Anexo I — Contrato {c.number} (Processo {c.processNumber})
                    </CardTitle>
                    <span className="text-xs font-semibold text-slate-600">
                      Credor: {c.supplierName} · Vigência: {datePt(c.startDate)} a {datePt(c.endDate)}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/70 border-b text-slate-600 font-semibold">
                      <tr>
                        <th className="p-2.5">Item / Descrição</th>
                        <th className="p-2.5">Unidade</th>
                        <th className="p-2.5 text-right">Qtd Contratada</th>
                        <th className="p-2.5 text-right">Preço Unitário</th>
                        <th className="p-2.5 text-right">Total Contratado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {c.items.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-3 text-slate-500 text-center">
                            Nenhum item individual cadastrado para este contrato.
                          </td>
                        </tr>
                      ) : (
                        c.items.map((item, idx) => (
                          <tr key={item.id || idx} className="hover:bg-slate-50">
                            <td className="p-2.5 font-medium">{item.description}</td>
                            <td className="p-2.5">{item.unit}</td>
                            <td className="p-2.5 text-right">{item.quantityContracted}</td>
                            <td className="p-2.5 text-right">{money(item.unitPrice)}</td>
                            <td className="p-2.5 text-right font-bold">{money(item.totalContracted)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 6. ABA: CONTRATOS QUE TIVERAM ADITIVOS (CF16 — 16.21) */}
      {activeTab === "16.21" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-3">
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              Relatório de Contratos que Tiveram Aditivos (CF16 — 16.21)
            </h3>
            <p className="text-xs text-slate-500">
              Filtre por processo, ano/número do contrato, número do aditivo, fornecedor e ordenação alfabética ou numérica.
            </p>
          </div>
          <div className="space-y-3">
            {filtered
              .filter((c) => c.amendments.length > 0)
              .map((c) => (
                <Card key={c.id}>
                  <CardHeader className="p-3 border-b bg-slate-50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-sm font-bold text-slate-900">
                        Contrato {c.number} — {c.supplierName} ({c.amendments.length} aditivo(s))
                      </CardTitle>
                      <span className="text-xs text-slate-500">Processo: {c.processNumber}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 text-xs space-y-2">
                    {c.amendments.map((a, idx) => (
                      <div key={a.id || idx} className="rounded border p-2.5 bg-slate-50 grid sm:grid-cols-3 gap-2">
                        <div>
                          <strong className="block text-slate-800">
                            Termo Aditivo Nº {idx + 1} — {a.type}
                          </strong>
                          <span className="text-slate-500 text-[11px]">Registrado em {datePt(a.createdAt)}</span>
                        </div>
                        <div>
                          <strong className="block text-slate-800">Motivo / Justificativa:</strong>
                          <p className="text-slate-600 text-[11px]">{a.justification}</p>
                        </div>
                        <div className="text-right">
                          {a.newValue !== null && (
                            <span className="block font-semibold">
                              Valor: {money(a.previousValue || 0)} → {money(a.newValue)}
                            </span>
                          )}
                          {a.newEndDate && (
                            <span className="block text-slate-500 text-[11px]">
                              Nova Vigência: até {datePt(a.newEndDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>
      )}

      {/* 7. ABA: SALDO RESTANTE DE ITENS OU SERVIÇOS (CF16 — 16.25) */}
      {activeTab === "16.25" && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-3">
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              Relatório de Saldo Restante de Itens ou Serviços Contratados (CF16 — 16.25)
            </h3>
            <p className="text-xs text-slate-500">
              Acompanhamento de quantidades contratadas, entregues/medidas e saldos remanescentes físicos e financeiros.
            </p>
          </div>
          <div className="rounded-lg border bg-white overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b text-slate-600 font-semibold">
                <tr>
                  <th className="p-2.5">Contrato</th>
                  <th className="p-2.5">Item / Serviço</th>
                  <th className="p-2.5 text-right">Qtd Contratada</th>
                  <th className="p-2.5 text-right">Qtd Entregue</th>
                  <th className="p-2.5 text-right text-indigo-900 font-bold">Saldo Físico</th>
                  <th className="p-2.5 text-right">Preço Unit.</th>
                  <th className="p-2.5 text-right text-rose-900 font-bold">Saldo Financeiro</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.flatMap((c) =>
                  c.items.map((item, idx) => (
                    <tr key={`${c.id}-${item.id || idx}`} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-sky-950">{c.number}</td>
                      <td className="p-2.5 max-w-xs truncate" title={item.description}>
                        {item.description}
                      </td>
                      <td className="p-2.5 text-right">{item.quantityContracted} {item.unit}</td>
                      <td className="p-2.5 text-right">{item.quantityReceived} {item.unit}</td>
                      <td className="p-2.5 text-right font-bold text-indigo-900">
                        {item.quantityRemaining} {item.unit}
                      </td>
                      <td className="p-2.5 text-right">{money(item.unitPrice)}</td>
                      <td className="p-2.5 text-right font-bold text-rose-900">
                        {money(item.totalRemaining)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. DEMAIS ABAS GERAIS (16.2, 16.18, 16.20, 16.22, 16.23, 16.24) */}
      {["16.2", "16.18", "16.20", "16.22", "16.23", "16.24"].includes(activeTab) && (
        <div className="space-y-4">
          <div className="rounded-lg border bg-white p-3">
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              {TABS.find((t) => t.key === activeTab)?.title}
            </h3>
            <p className="text-xs text-slate-500">
              Listagem analítica completa conforme filtros selecionados. Total de {filtered.length} registro(s) encontrado(s).
            </p>
          </div>
          <div className="rounded-lg border bg-white overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b text-slate-600 font-semibold">
                <tr>
                  <th className="p-2.5">Contrato</th>
                  <th className="p-2.5">Processo / Ano</th>
                  <th className="p-2.5">Fornecedor / Credor</th>
                  <th className="p-2.5">Objeto</th>
                  <th className="p-2.5">Vigência</th>
                  <th className="p-2.5">Gestor / Fiscal</th>
                  <th className="p-2.5 text-right">Valor Atual</th>
                  <th className="p-2.5 text-right">Saldo a Pagar</th>
                  <th className="p-2.5">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="p-2.5 font-bold text-sky-950">
                      <Link href={`/compras/contratos/${c.id}`} className="hover:underline">
                        {c.number}
                      </Link>
                    </td>
                    <td className="p-2.5 whitespace-nowrap">{c.processNumber}</td>
                    <td className="p-2.5 max-w-[200px] truncate" title={c.supplierName}>
                      {c.supplierName}
                    </td>
                    <td className="p-2.5 max-w-xs truncate" title={c.object}>
                      {c.object}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      {datePt(c.startDate)} a {datePt(c.endDate)} ({c.termDays}d)
                    </td>
                    <td className="p-2.5 text-slate-500">
                      {c.managerName || c.inspectorName ? `${c.managerName || "—"} / ${c.inspectorName || "—"}` : "Não designado"}
                    </td>
                    <td className="p-2.5 text-right font-bold">{money(c.updatedValue)}</td>
                    <td className="p-2.5 text-right font-semibold text-slate-700">{money(c.generalBalance)}</td>
                    <td className="p-2.5">
                      <Badge variant="outline">{c.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
