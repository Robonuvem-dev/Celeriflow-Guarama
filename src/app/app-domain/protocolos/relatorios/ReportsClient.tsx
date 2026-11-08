"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  BarChart3,
  FileSpreadsheet,
  Printer,
  RotateCcw,
  Search,
  FileText,
  FileCheck,
  Send,
  UserCheck,
  Clock,
  Layers,
  ChevronRight,
} from "lucide-react";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";

export type ProcessReportItem = {
  id: string;
  protocolNumber: string;
  processTypeName: string;
  subjectName: string;
  subassunto?: string;
  status: string;
  situation?: string;
  interessado: string;
  interessadoDoc?: string;
  currentDepartmentName: string;
  createdAt: string;
  rawDate: string;
  year: number;
  priority: string;
  description?: string;
  movementsCount: number;
  lastMovementReason?: string;
  lastMovementDate?: string;
  lastFromDepartment?: string;
  lastToDepartment?: string;
  notesSequence?: { seq: number; type: string; text: string; date: string; author: string }[];
};

export type ProcessTypeOption = { id: string; name: string };
export type SubjectOption = { id: string; name: string; processTypeId: string };
export type SituationOption = { id: string; name: string };

type ReportType =
  | "geral"
  | "entrada"
  | "roteiro"
  | "obs_movimentacao"
  | "comunicado_situacao"
  | "comparecimento"
  | "comprovante_encaminhamento"
  | "comprovante_movimentacao"
  | "obs_sequencia";

export default function ReportsClient({
  processes,
  processTypes,
  subjects,
  situations,
}: {
  processes: ProcessReportItem[];
  processTypes: ProcessTypeOption[];
  subjects: SubjectOption[];
  situations: SituationOption[];
}) {
  // 19.67: Menu único com escolha do relatório
  const [selectedReport, setSelectedReport] = useState<ReportType>("geral");

  // Filtros Gerais e Específicos
  const [filterQuery, setFilterQuery] = useState("");
  const [filterProcInicio, setFilterProcInicio] = useState("");
  const [filterProcFim, setFilterProcFim] = useState("");
  const [filterAnoInicio, setFilterAnoInicio] = useState("");
  const [filterAnoFim, setFilterAnoFim] = useState("");
  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSituacao, setFilterSituacao] = useState("");
  const [filterRequerente, setFilterRequerente] = useState("");
  const [filterNotaFiscal, setFilterNotaFiscal] = useState("");
  const [filterProcessType, setFilterProcessType] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterSubassunto, setFilterSubassunto] = useState("");

  // Processo selecionado para emissão individual (notificação / comprovante)
  const [selectedProcessId, setSelectedProcessId] = useState<string>(processes[0]?.id || "");

  // Limpar filtros (19.107)
  const handleClearFilters = () => {
    setFilterQuery("");
    setFilterProcInicio("");
    setFilterProcFim("");
    setFilterAnoInicio("");
    setFilterAnoFim("");
    setFilterDataInicio("");
    setFilterDataFim("");
    setFilterStatus("");
    setFilterSituacao("");
    setFilterRequerente("");
    setFilterNotaFiscal("");
    setFilterProcessType("");
    setFilterSubject("");
    setFilterSubassunto("");
  };

  // Filtragem dos dados
  const filteredData = useMemo(() => {
    return processes.filter((p) => {
      // Query geral
      if (filterQuery && !p.protocolNumber.toLowerCase().includes(filterQuery.toLowerCase()) && !p.interessado.toLowerCase().includes(filterQuery.toLowerCase())) {
        return false;
      }
      // Requerente
      if (filterRequerente && !p.interessado.toLowerCase().includes(filterRequerente.toLowerCase())) {
        return false;
      }
      // Nota Fiscal (busca na descrição / objeto)
      if (filterNotaFiscal && !p.description?.toLowerCase().includes(filterNotaFiscal.toLowerCase())) {
        return false;
      }
      // Processo Inicial e Final
      if (filterProcInicio && p.protocolNumber < filterProcInicio) return false;
      if (filterProcFim && p.protocolNumber > filterProcFim) return false;
      // Ano Inicial e Final
      if (filterAnoInicio && p.year < Number(filterAnoInicio)) return false;
      if (filterAnoFim && p.year > Number(filterAnoFim)) return false;
      // Data Inicial e Final
      if (filterDataInicio && p.rawDate < filterDataInicio) return false;
      if (filterDataFim && p.rawDate > filterDataFim) return false;
      // Status
      if (filterStatus && p.status !== filterStatus) return false;
      // Tipo de Processo
      if (filterProcessType && p.processTypeName !== filterProcessType) return false;
      // Assunto
      if (filterSubject && p.subjectName !== filterSubject) return false;
      // Subassunto
      if (filterSubassunto && !p.subassunto?.toLowerCase().includes(filterSubassunto.toLowerCase())) return false;

      return true;
    });
  }, [
    processes,
    filterQuery,
    filterRequerente,
    filterNotaFiscal,
    filterProcInicio,
    filterProcFim,
    filterAnoInicio,
    filterAnoFim,
    filterDataInicio,
    filterDataFim,
    filterStatus,
    filterProcessType,
    filterSubject,
    filterSubassunto,
  ]);

  // Processo para notificação / comprovante individual
  const activeProcess = useMemo(() => {
    return processes.find((p) => p.id === selectedProcessId) || filteredData[0] || processes[0];
  }, [processes, selectedProcessId, filteredData]);

  // Exportar CSV
  const handleExportCSV = () => {
    const headers = [
      "Protocolo",
      "Tipo de Processo",
      "Assunto",
      "Interessado",
      "Status",
      "Setor Atual",
      "Data de Abertura",
      "Prioridade",
      "Movimentações",
    ];
    const rows = filteredData.map((p) => [
      p.protocolNumber,
      `"${p.processTypeName}"`,
      `"${p.subjectName}"`,
      `"${p.interessado}"`,
      p.status,
      `"${p.currentDepartmentName}"`,
      p.createdAt,
      p.priority,
      p.movementsCount,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(";"), ...rows.map((row) => row.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_${selectedReport}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Imprimir HTML
  const handlePrintHTML = () => {
    window.print();
  };

  // Colunas da Tabela Geral / Entrada
  const reportColumns: OperationalColumn[] = [
    { key: "protocol", label: "Protocolo", initialWidth: 150, minWidth: 120, maxWidth: 220, type: "text", resizable: true },
    { key: "type", label: "Tipo de Processo", initialWidth: 170, minWidth: 130, maxWidth: 250, type: "text", resizable: true },
    { key: "subject", label: "Assunto", initialWidth: 200, minWidth: 150, maxWidth: 300, type: "text", resizable: true },
    { key: "interessado", label: "Requerente / Interessado", initialWidth: 220, minWidth: 160, maxWidth: 350, type: "text", resizable: true },
    { key: "department", label: "Setor Atual", initialWidth: 180, minWidth: 140, maxWidth: 260, type: "text", resizable: true },
    { key: "status", label: "Status", initialWidth: 140, minWidth: 110, maxWidth: 200, type: "status", resizable: true },
    { key: "date", label: "Data Abertura", initialWidth: 130, minWidth: 100, maxWidth: 160, type: "text", resizable: true },
  ];

  return (
    <div className="space-y-6">
      {/* 19.67: MENU ÚNICO DE RELATÓRIOS DO SISTEMA */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm print:hidden space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Escolha do Relatório (19.67):
            </label>
            <select
              value={selectedReport}
              onChange={(e) => setSelectedReport(e.target.value as ReportType)}
              className="text-base font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg p-2.5 min-w-[340px]"
            >
              <optgroup label="Consultas e Listagens Operacionais">
                <option value="geral">19.82 - Relatório Geral de Processos</option>
                <option value="entrada">19.27 - Consulta de Entrada de Processos (com filtros e exportação)</option>
                <option value="roteiro">19.42 - Consulta do Roteiro do Processo (Tipo / Assunto / Subassunto)</option>
              </optgroup>
              <optgroup label="Histórico e Observações">
                <option value="obs_movimentacao">19.73 - Relatório de Observações por Movimentação</option>
                <option value="obs_sequencia">19.80 - Relatório de Observações por Sequência</option>
              </optgroup>
              <optgroup label="Notificações e Comunicados Oficiais">
                <option value="comunicado_situacao">19.74 - Notificação de Comunicado de Situação do Processo</option>
                <option value="comparecimento">19.75 - Notificação de Solicitação de Comparecimento</option>
              </optgroup>
              <optgroup label="Comprovantes de Trâmite">
                <option value="comprovante_encaminhamento">19.76 - Comprovante de Encaminhamento de Processo</option>
                <option value="comprovante_movimentacao">19.77 - Comprovante de Movimentação de Processo</option>
              </optgroup>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
              title="Exportar para CSV (19.27, 19.42, 19.105)"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Exportar CSV
            </button>
            <button
              onClick={handlePrintHTML}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 shadow-sm"
              title="Imprimir Relatório HTML (19.27, 19.42, 19.67)"
            >
              <Printer className="w-4 h-4" />
              Imprimir Relatório HTML
            </button>
          </div>
        </div>

        {/* FAIXA COMPACTA DE FILTROS PARAMETRIZÁVEIS (19.27, 19.42, 19.107) */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2.5 text-xs">
          <input
            type="text"
            placeholder="Buscar por protocolo..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="rounded border border-slate-300 px-2.5 py-1.5 w-40 bg-white"
          />

          {/* Filtros específicos de 19.27: Processo Inicial/Final, Ano, Datas, Status, NF, Requerente */}
          {(selectedReport === "entrada" || selectedReport === "geral") && (
            <>
              <input
                type="text"
                placeholder="Proc. Inicial (19.27)"
                value={filterProcInicio}
                onChange={(e) => setFilterProcInicio(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1.5 w-32 bg-white"
              />
              <input
                type="text"
                placeholder="Proc. Final (19.27)"
                value={filterProcFim}
                onChange={(e) => setFilterProcFim(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1.5 w-32 bg-white"
              />
              <input
                type="number"
                placeholder="Ano Ini."
                value={filterAnoInicio}
                onChange={(e) => setFilterAnoInicio(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1.5 w-20 bg-white"
              />
              <input
                type="number"
                placeholder="Ano Fim"
                value={filterAnoFim}
                onChange={(e) => setFilterAnoFim(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1.5 w-20 bg-white"
              />
              <input
                type="text"
                placeholder="Requerente..."
                value={filterRequerente}
                onChange={(e) => setFilterRequerente(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1.5 w-36 bg-white"
              />
              <input
                type="text"
                placeholder="Nota Fiscal / Doc..."
                value={filterNotaFiscal}
                onChange={(e) => setFilterNotaFiscal(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1.5 w-32 bg-white"
              />
              <div className="flex items-center gap-1">
                <span className="text-slate-500">De:</span>
                <input
                  type="date"
                  value={filterDataInicio}
                  onChange={(e) => setFilterDataInicio(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 bg-white"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500">Até:</span>
                <input
                  type="date"
                  value={filterDataFim}
                  onChange={(e) => setFilterDataFim(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 bg-white"
                />
              </div>
            </>
          )}

          {/* Filtros específicos de 19.42: Roteiro (Tipo processo, Assunto, Subassunto) */}
          {selectedReport === "roteiro" && (
            <>
              <select
                value={filterProcessType}
                onChange={(e) => setFilterProcessType(e.target.value)}
                className="rounded border border-slate-300 px-2.5 py-1.5 bg-white"
              >
                <option value="">Todos os tipos de processo</option>
                {processTypes.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="rounded border border-slate-300 px-2.5 py-1.5 bg-white"
              >
                <option value="">Todos os assuntos</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Subassunto..."
                value={filterSubassunto}
                onChange={(e) => setFilterSubassunto(e.target.value)}
                className="rounded border border-slate-300 px-2.5 py-1.5 w-36 bg-white"
              />
            </>
          )}

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded border border-slate-300 px-2.5 py-1.5 bg-white"
          >
            <option value="">Todos os status</option>
            <option value="Aberto">Aberto</option>
            <option value="Em Andamento">Em Andamento</option>
            <option value="Aguardando Recebimento">Aguardando Recebimento</option>
            <option value="Concluído">Concluído</option>
            <option value="Arquivado">Arquivado</option>
            <option value="Cancelado">Cancelado</option>
          </select>

          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-800 px-2 py-1.5 border rounded bg-white"
            title="Limpar todos os filtros (19.107)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Limpar (19.107)
          </button>
        </div>
      </div>

      {/* RENDERIZAÇÃO DO RELATÓRIO SELECIONADO */}

      {/* CASO 1: RELATÓRIO GERAL (19.82) & CONSULTA DE ENTRADA (19.27) */}
      {(selectedReport === "geral" || selectedReport === "entrada") && (
        <OperationalListFrame
          label={
            selectedReport === "geral"
              ? "Relatório Geral de Processos (19.82)"
              : "Consulta de Entrada de Processos (19.27)"
          }
        >
          <OperationalTable
            columns={reportColumns}
            preferenceId="protocolos.relatorios.geral"
            caption="Listagem de processos protocolados"
            emptyMessage="Nenhum processo encontrado para os critérios de pesquisa informados."
            rows={filteredData.map((p) => ({
              id: p.id,
              label: p.protocolNumber,
              values: {
                protocol: p.protocolNumber,
                type: p.processTypeName,
                subject: p.subjectName,
                interessado: p.interessado,
                department: p.currentDepartmentName,
                status: p.status,
                date: p.createdAt,
              },
              cells: {
                protocol: (
                  <Link
                    href={`/protocolos/processos/${p.id}`}
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    {p.protocolNumber}
                  </Link>
                ),
              },
            }))}
          />
        </OperationalListFrame>
      )}

      {/* CASO 2: CONSULTA DO ROTEIRO DO PROCESSO (19.42) */}
      {selectedReport === "roteiro" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="border-b pb-3">
            <h2 className="text-base font-bold text-slate-900">Consulta do Roteiro do Processo (19.42)</h2>
            <p className="text-xs text-slate-500">
              Mapeamento de tramitação por tipo de processo, assunto e subassunto estabelecido.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 font-bold uppercase text-slate-700">
                <tr>
                  <th className="p-3 border">Tipo de Processo</th>
                  <th className="p-3 border">Assunto</th>
                  <th className="p-3 border">Subassunto / Tema</th>
                  <th className="p-3 border">Protocolos Ativos</th>
                  <th className="p-3 border">Setor Atual</th>
                  <th className="p-3 border">Roteiro / Etapas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="p-3 border font-semibold text-slate-900">{p.processTypeName}</td>
                    <td className="p-3 border">{p.subjectName}</td>
                    <td className="p-3 border text-slate-600">{p.subassunto || "Geral"}</td>
                    <td className="p-3 border font-mono font-bold text-emerald-700">
                      <Link href={`/protocolos/processos/${p.id}`} className="hover:underline">
                        {p.protocolNumber}
                      </Link>
                    </td>
                    <td className="p-3 border">{p.currentDepartmentName}</td>
                    <td className="p-3 border text-slate-500">
                      {p.movementsCount} movimentação(ões) realizada(s)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CASO 3: OBSERVAÇÕES POR MOVIMENTAÇÃO (19.73) & POR SEQUÊNCIA (19.80) */}
      {(selectedReport === "obs_movimentacao" || selectedReport === "obs_sequencia") && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="border-b pb-3">
            <h2 className="text-base font-bold text-slate-900">
              {selectedReport === "obs_movimentacao"
                ? "Relatório de Observações Informadas em Cada Movimentação (19.73)"
                : "Relatório de Observações por Sequência Operacional (19.80)"}
            </h2>
            <p className="text-xs text-slate-500">
              Registro cronológico integral de despachos, anotações e pareceres efetuados nas movimentações.
            </p>
          </div>

          <div className="space-y-4">
            {filteredData.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-200 p-4 bg-slate-50/50 space-y-2">
                <div className="flex flex-wrap items-center justify-between border-b pb-2">
                  <span className="font-bold text-sm text-slate-900">
                    Processo nº {p.protocolNumber} — {p.subjectName}
                  </span>
                  <span className="text-xs text-slate-500">Interessado: {p.interessado}</span>
                </div>

                <div className="text-xs space-y-2 pt-1">
                  <div className="p-2.5 rounded bg-white border border-slate-200">
                    <p className="font-semibold text-slate-800">
                      Movimentação mais recente ({p.lastMovementDate || p.createdAt}):
                    </p>
                    <p className="text-slate-600 mt-1 italic">
                      &quot;{p.lastMovementReason || p.description || "Sem anotações adicionais."}&quot;
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Setores: {p.lastFromDepartment || "Abertura"} → {p.lastToDepartment || p.currentDepartmentName}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CASO 4: COMUNICADO DE SITUAÇÃO DO PROCESSO (19.74) */}
      {selectedReport === "comunicado_situacao" && activeProcess && (
        <div className="bg-white rounded-xl border-2 border-slate-800 p-8 shadow-sm max-w-3xl mx-auto space-y-6">
          <div className="text-center border-b-2 border-slate-800 pb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">ESTADO DO PARANÁ</p>
            <h1 className="text-xl font-black text-slate-950">PREFEITURA MUNICIPAL</h1>
            <p className="text-xs text-slate-600">Sistema Celeriflow · Protocolo e Controle de Processos</p>
            <h2 className="mt-3 text-lg font-bold uppercase text-slate-900 underline">
              Notificação de Comunicado de Situação de Processo (19.74)
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded border">
              <span className="font-bold block">Protocolo:</span>
              <span className="font-mono text-base font-bold text-slate-900">{activeProcess.protocolNumber}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded border">
              <span className="font-bold block">Data de Emissão:</span>
              <span>{new Date().toLocaleDateString("pt-BR")}</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded border text-xs space-y-2">
            <p><strong>Destinatário / Interessado:</strong> {activeProcess.interessado}</p>
            <p><strong>Documento:</strong> {activeProcess.interessadoDoc || "Não informado"}</p>
            <p><strong>Assunto:</strong> {activeProcess.processTypeName} - {activeProcess.subjectName}</p>
            <p><strong>Situação Atual:</strong> <span className="font-bold">{activeProcess.status}</span></p>
            <p><strong>Setor Competente:</strong> {activeProcess.currentDepartmentName}</p>
          </div>

          <div className="text-xs leading-relaxed text-slate-800 space-y-3">
            <p>
              Prezado(a) Senhor(a),
            </p>
            <p>
              Por meio deste comunicado oficial, informamos que o processo administrativo sob epígrafe encontra-se na situação de <strong>{activeProcess.status}</strong> perante o setor <strong>{activeProcess.currentDepartmentName}</strong>.
            </p>
            <p>
              Informações complementares sobre o andamento e eventuais despachos podem ser consultadas diretamente no Portal de Serviços Online mediante o protocolo correspondente.
            </p>
          </div>

          <div className="pt-8 text-center text-xs text-slate-600 border-t border-slate-300">
            <div className="w-64 border-t border-slate-500 mx-auto pt-1 font-bold text-slate-800">
              Protocolo Geral / Departamento Competente
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Autenticação: NOTIF-19.74-{activeProcess.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
      )}

      {/* CASO 5: NOTIFICAÇÃO DE SOLICITAÇÃO DE COMPARECIMENTO (19.75) */}
      {selectedReport === "comparecimento" && activeProcess && (
        <div className="bg-white rounded-xl border-2 border-slate-800 p-8 shadow-sm max-w-3xl mx-auto space-y-6">
          <div className="text-center border-b-2 border-slate-800 pb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">ESTADO DO PARANÁ</p>
            <h1 className="text-xl font-black text-slate-950">PREFEITURA MUNICIPAL</h1>
            <p className="text-xs text-slate-600">Sistema Celeriflow · Protocolo e Controle de Processos</p>
            <h2 className="mt-3 text-lg font-bold uppercase text-slate-900 underline">
              Notificação de Solicitação de Comparecimento (19.75)
            </h2>
          </div>

          <div className="p-4 bg-slate-50 rounded border text-xs space-y-2">
            <p><strong>Ao(À) Interessado(a):</strong> {activeProcess.interessado}</p>
            <p><strong>Documento / CPF:</strong> {activeProcess.interessadoDoc || "Não informado"}</p>
            <p><strong>Referência - Protocolo nº:</strong> <span className="font-mono font-bold">{activeProcess.protocolNumber}</span></p>
            <p><strong>Assunto:</strong> {activeProcess.subjectName}</p>
          </div>

          <div className="text-xs leading-relaxed text-slate-800 space-y-3">
            <p>
              Fica o(a) requerente acima qualificado(a) <strong>CONVOCADO(A) A COMPARECER</strong> à sede da Prefeitura Municipal, junto ao setor <strong>{activeProcess.currentDepartmentName}</strong>, no prazo de até <strong>5 (cinco) dias úteis</strong> a contar do recebimento desta notificação.
            </p>
            <p>
              <strong>Finalidade:</strong> Prestar esclarecimentos necessários e/ou apresentar documentos originais pertinentes à instrução do processo supracitado.
            </p>
            <p>
              O não comparecimento no prazo legal poderá ensejar o indeferimento ou arquivamento do feito por inércia do requerente.
            </p>
          </div>

          <div className="pt-10 text-center text-xs text-slate-600 border-t border-slate-300">
            <div className="w-64 border-t border-slate-500 mx-auto pt-1 font-bold text-slate-800">
              Assinatura do Responsável pelo Setor
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Notificação CF19-19.75-{activeProcess.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
      )}

      {/* CASO 6: COMPROVANTE DE ENCAMINHAMENTO (19.76) & COMPROVANTE DE MOVIMENTAÇÃO (19.77) */}
      {(selectedReport === "comprovante_encaminhamento" || selectedReport === "comprovante_movimentacao") && activeProcess && (
        <div className="bg-white rounded-xl border-2 border-slate-800 p-8 shadow-sm max-w-3xl mx-auto space-y-6">
          <div className="text-center border-b-2 border-slate-800 pb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-600">ESTADO DO PARANÁ</p>
            <h1 className="text-xl font-black text-slate-950">PREFEITURA MUNICIPAL</h1>
            <p className="text-xs text-slate-600">Sistema Celeriflow · Protocolo e Controle de Processos</p>
            <h2 className="mt-3 text-lg font-bold uppercase text-slate-900 underline">
              {selectedReport === "comprovante_encaminhamento"
                ? "Comprovante de Encaminhamento de Processo (19.76)"
                : "Comprovante de Movimentação de Processo (19.77)"}
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded border">
              <span className="font-bold block">Protocolo do Processo:</span>
              <span className="font-mono text-base font-bold text-slate-900">{activeProcess.protocolNumber}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded border">
              <span className="font-bold block">Data / Hora do Trâmite:</span>
              <span>{activeProcess.lastMovementDate || activeProcess.createdAt}</span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded border text-xs space-y-2">
            <p><strong>Setor Remetente (Origem):</strong> {activeProcess.lastFromDepartment || "Abertura / Protocolo Geral"}</p>
            <p><strong>Setor Destinatário:</strong> {activeProcess.lastToDepartment || activeProcess.currentDepartmentName}</p>
            <p><strong>Requerente:</strong> {activeProcess.interessado}</p>
            <p><strong>Assunto:</strong> {activeProcess.processTypeName} - {activeProcess.subjectName}</p>
            <p><strong>Despacho / Motivo:</strong> {activeProcess.lastMovementReason || "Encaminhamento formal de processo."}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-center text-xs text-slate-600 pt-6">
            <div className="border-t border-slate-400 pt-2">
              <p className="font-bold text-slate-800">Servidor Responsável pelo Envio</p>
              <p>Data e Rubrica</p>
            </div>
            <div className="border-t border-slate-400 pt-2">
              <p className="font-bold text-slate-800">Recebido no Setor de Destino</p>
              <p>Data e Rubrica</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
