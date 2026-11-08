"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Send,
  Inbox,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  Printer,
  Search,
  RotateCcw,
  Package,
  Layers,
  ArrowRight,
} from "lucide-react";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { type OperationalColumn, OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import {
  dispatchRemessaAction,
  receiveRemessaAction,
  closeRemessaAction,
  dispatchSingleProcessAction,
} from "./actions";

export type RemessaSummary = {
  remessaNumber: string;
  fromDepartmentId: string;
  fromDepartmentName: string;
  toDepartmentId: string;
  toDepartmentName: string;
  processCount: number;
  status: "Aguardando Recebimento" | "Recebida" | "Encerrada";
  createdAt: string;
  notes: string | null;
  processProtocols: string[];
};

export type RemessaProcessItem = {
  processId: string;
  protocolNumber: string;
  remessaNumber: string;
  fromDepartmentName: string;
  toDepartmentName: string;
  status: string;
  movedAt: string;
  interessado: string;
};

export type AvailableProcess = {
  id: string;
  protocolNumber: string;
  subjectName: string;
  interessado: string;
  createdAt: string;
};

export type DepartmentOption = {
  id: string;
  name: string;
};

export default function RemessasClient({
  remessas,
  remessaProcesses,
  availableProcesses,
  departments,
  currentDepartmentId,
  canOperate,
}: {
  remessas: RemessaSummary[];
  remessaProcesses: RemessaProcessItem[];
  availableProcesses: AvailableProcess[];
  departments: DepartmentOption[];
  currentDepartmentId: string | null;
  canOperate: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"remessas" | "processos" | "nova" | "unitario" | "relatorio">("remessas");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Filtros Remessas (19.61)
  const [filterRemessaNumber, setFilterRemessaNumber] = useState("");
  const [filterDestDepartment, setFilterDestDepartment] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Filtros Processos nas Remessas (19.62)
  const [filterProcessQuery, setFilterProcessQuery] = useState("");
  const [filterProcessRemessa, setFilterProcessRemessa] = useState("");

  // Filtro Relatório Remessas por Processo (19.78)
  const [reportProtocolQuery, setReportProtocolQuery] = useState("");

  // Formulário Nova Remessa (19.64)
  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>([]);
  const [newRemessaDestDept, setNewRemessaDestDept] = useState("");
  const [newRemessaNotes, setNewRemessaNotes] = useState("");

  // Formulário Envio Unitário (19.64)
  const [singleProcessId, setSingleProcessId] = useState("");
  const [singleDestDept, setSingleDestDept] = useState("");
  const [singleNotes, setSingleNotes] = useState("");

  // Diálogo Recebimento / Encerramento
  const [actionRemessaModal, setActionRemessaModal] = useState<{
    type: "receive" | "close";
    remessaNumber: string;
  } | null>(null);
  const [actionNotes, setActionNotes] = useState("");

  // Filtragem de Remessas
  const filteredRemessas = useMemo(() => {
    return remessas.filter((r) => {
      const matchNumber = !filterRemessaNumber || r.remessaNumber.toLowerCase().includes(filterRemessaNumber.toLowerCase());
      const matchDept = !filterDestDepartment || r.toDepartmentId === filterDestDepartment;
      const matchStatus = !filterStatus || r.status === filterStatus;
      return matchNumber && matchDept && matchStatus;
    });
  }, [remessas, filterRemessaNumber, filterDestDepartment, filterStatus]);

  // Filtragem de Processos em Remessas
  const filteredRemessaProcesses = useMemo(() => {
    return remessaProcesses.filter((p) => {
      const matchQuery =
        !filterProcessQuery ||
        p.protocolNumber.toLowerCase().includes(filterProcessQuery.toLowerCase()) ||
        p.interessado.toLowerCase().includes(filterProcessQuery.toLowerCase());
      const matchRemessa = !filterProcessRemessa || p.remessaNumber.toLowerCase().includes(filterProcessRemessa.toLowerCase());
      return matchQuery && matchRemessa;
    });
  }, [remessaProcesses, filterProcessQuery, filterProcessRemessa]);

  // Filtragem do Relatório de Remessas por Processo (19.78)
  const reportRemessasByProcess = useMemo(() => {
    if (!reportProtocolQuery.trim()) return remessaProcesses;
    return remessaProcesses.filter((p) =>
      p.protocolNumber.toLowerCase().includes(reportProtocolQuery.toLowerCase())
    );
  }, [remessaProcesses, reportProtocolQuery]);

  // Exportação CSV Remessas (19.61)
  const exportRemessasCSV = () => {
    const headers = ["Número da Remessa", "Setor Origem", "Setor Destino", "Qtd Processos", "Situação", "Data de Envio", "Observações"];
    const rows = filteredRemessas.map((r) => [
      r.remessaNumber,
      `"${r.fromDepartmentName}"`,
      `"${r.toDepartmentName}"`,
      r.processCount,
      r.status,
      r.createdAt,
      `"${r.notes || ""}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(";"), ...rows.map((row) => row.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `remessas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportação CSV Processos em Remessas (19.62)
  const exportProcessesCSV = () => {
    const headers = ["Protocolo", "Remessa", "Setor Origem", "Setor Destino", "Interessado", "Situação", "Data Tramitação"];
    const rows = filteredRemessaProcesses.map((p) => [
      p.protocolNumber,
      p.remessaNumber,
      `"${p.fromDepartmentName}"`,
      `"${p.toDepartmentName}"`,
      `"${p.interessado}"`,
      p.status,
      p.movedAt,
    ]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(";"), ...rows.map((row) => row.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `processos_remessas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Impressão HTML (19.61, 19.62)
  const printCurrentView = () => {
    window.print();
  };

  // Submeter Envio de Remessa (19.64)
  const handleDispatchRemessa = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await dispatchRemessaAction({
        toDepartmentId: newRemessaDestDept,
        processIds: selectedProcessIds,
        notes: newRemessaNotes,
      });
      if (res.error) {
        setFeedback({ type: "error", message: res.error });
      } else {
        setFeedback({
          type: "success",
          message: `Remessa ${res.remessaNumber} gerada e despachada com sucesso com ${selectedProcessIds.length} processo(s)!`,
        });
        setSelectedProcessIds([]);
        setNewRemessaNotes("");
        setActiveTab("remessas");
        router.refresh();
      }
    });
  };

  // Submeter Recebimento por Remessa (19.66)
  const handleConfirmReceive = () => {
    if (!actionRemessaModal) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await receiveRemessaAction(actionRemessaModal.remessaNumber, actionNotes);
      if (res.error) {
        setFeedback({ type: "error", message: res.error });
      } else {
        setFeedback({
          type: "success",
          message: `Recebimento de todos os processos da Remessa ${actionRemessaModal.remessaNumber} confirmado com sucesso!`,
        });
        setActionRemessaModal(null);
        setActionNotes("");
        router.refresh();
      }
    });
  };

  // Submeter Encerramento de Remessa (19.63)
  const handleConfirmClose = () => {
    if (!actionRemessaModal) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await closeRemessaAction(actionRemessaModal.remessaNumber, actionNotes);
      if (res.error) {
        setFeedback({ type: "error", message: res.error });
      } else {
        setFeedback({
          type: "success",
          message: `Remessa ${actionRemessaModal.remessaNumber} e seus processos foram encerrados simultaneamente!`,
        });
        setActionRemessaModal(null);
        setActionNotes("");
        router.refresh();
      }
    });
  };

  // Submeter Envio Unitário (19.64)
  const handleDispatchSingle = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await dispatchSingleProcessAction({
        processId: singleProcessId,
        toDepartmentId: singleDestDept,
        notes: singleNotes,
      });
      if (res.error) {
        setFeedback({ type: "error", message: res.error });
      } else {
        setFeedback({ type: "success", message: "Processo encaminhado unitariamente com sucesso!" });
        setSingleProcessId("");
        setSingleNotes("");
        router.refresh();
      }
    });
  };

  // Colunas da Tabela de Remessas (19.61)
  const remessaColumns: OperationalColumn[] = [
    { key: "remessaNumber", label: "Remessa", initialWidth: 160, minWidth: 120, maxWidth: 220, type: "text", resizable: true },
    { key: "fromDepartment", label: "Setor Origem", initialWidth: 200, minWidth: 150, maxWidth: 300, type: "text", resizable: true },
    { key: "toDepartment", label: "Setor Destino", initialWidth: 200, minWidth: 150, maxWidth: 300, type: "text", resizable: true },
    { key: "count", label: "Qtd Processos", initialWidth: 110, minWidth: 90, maxWidth: 140, type: "number", resizable: true },
    { key: "status", label: "Situação", initialWidth: 180, minWidth: 130, maxWidth: 220, type: "status", resizable: true },
    { key: "date", label: "Data Envio", initialWidth: 140, minWidth: 110, maxWidth: 180, type: "text", resizable: true },
    { key: "actions", label: "Ações", initialWidth: 180, minWidth: 140, maxWidth: 240, type: "actions", resizable: false },
  ];

  // Colunas da Tabela de Processos na Remessa (19.62)
  const processColumns: OperationalColumn[] = [
    { key: "protocol", label: "Protocolo", initialWidth: 160, minWidth: 120, maxWidth: 220, type: "text", resizable: true },
    { key: "remessa", label: "Remessa", initialWidth: 150, minWidth: 120, maxWidth: 200, type: "text", resizable: true },
    { key: "interessado", label: "Interessado", initialWidth: 220, minWidth: 160, maxWidth: 350, type: "text", resizable: true },
    { key: "route", label: "Encaminhamento", initialWidth: 240, minWidth: 180, maxWidth: 400, type: "text", resizable: true },
    { key: "status", label: "Situação", initialWidth: 150, minWidth: 120, maxWidth: 200, type: "status", resizable: true },
    { key: "date", label: "Data Tramitação", initialWidth: 140, minWidth: 110, maxWidth: 180, type: "text", resizable: true },
  ];

  return (
    <div className="space-y-4">
      {/* Notificações e feedback */}
      {feedback && (
        <div
          role="alert"
          className={`flex items-center justify-between p-4 rounded-xl border text-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs font-bold underline">
            Fechar
          </button>
        </div>
      )}

      {/* Navegação entre Abas do Módulo de Remessas */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 print:hidden">
        <button
          onClick={() => setActiveTab("remessas")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === "remessas" ? "bg-emerald-700 text-white" : "bg-white text-slate-700 border hover:bg-slate-50"
          }`}
        >
          <Layers className="w-4 h-4" />
          Consulta de Remessas (19.61)
        </button>
        <button
          onClick={() => setActiveTab("processos")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === "processos" ? "bg-emerald-700 text-white" : "bg-white text-slate-700 border hover:bg-slate-50"
          }`}
        >
          <Package className="w-4 h-4" />
          Processos nas Remessas (19.62)
        </button>
        {canOperate && (
          <button
            onClick={() => setActiveTab("nova")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === "nova" ? "bg-emerald-700 text-white" : "bg-white text-slate-700 border hover:bg-slate-50"
            }`}
          >
            <Send className="w-4 h-4" />
            Nova Remessa em Lote (19.64)
          </button>
        )}
        {canOperate && (
          <button
            onClick={() => setActiveTab("unitario")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === "unitario" ? "bg-emerald-700 text-white" : "bg-white text-slate-700 border hover:bg-slate-50"
            }`}
          >
            <ArrowRight className="w-4 h-4" />
            Envio Unitário ao Setor (19.64)
          </button>
        )}
        <button
          onClick={() => setActiveTab("relatorio")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            activeTab === "relatorio" ? "bg-emerald-700 text-white" : "bg-white text-slate-700 border hover:bg-slate-50"
          }`}
        >
          <Printer className="w-4 h-4" />
          Relatório Remessas por Processo (19.78)
        </button>
      </div>

      {/* ABA 1: CONSULTA DE REMESSAS (19.61) */}
      {activeTab === "remessas" && (
        <OperationalListFrame
          label="Consulta e Gestão de Remessas"
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={exportRemessasCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Exportar CSV (19.61)
              </button>
              <button
                onClick={printCurrentView}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                Imprimir Relatório HTML (19.61)
              </button>
            </div>
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-3 w-full bg-slate-50 p-3 rounded-lg border border-slate-200">
              <input
                type="text"
                placeholder="Filtrar por número da remessa..."
                value={filterRemessaNumber}
                onChange={(e) => setFilterRemessaNumber(e.target.value)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs w-64 bg-white"
              />
              <select
                value={filterDestDepartment}
                onChange={(e) => setFilterDestDepartment(e.target.value)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs bg-white"
              >
                <option value="">Todos os setores de destino</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs bg-white"
              >
                <option value="">Todas as situações</option>
                <option value="Aguardando Recebimento">Aguardando Recebimento</option>
                <option value="Recebida">Recebida</option>
                <option value="Encerrada">Encerrada</option>
              </select>
              <button
                onClick={() => {
                  setFilterRemessaNumber("");
                  setFilterDestDepartment("");
                  setFilterStatus("");
                }}
                className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 px-2 py-1.5 border rounded bg-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpar (19.107)
              </button>
            </div>
          }
        >
          <OperationalTable
            columns={remessaColumns}
            preferenceId="protocolos.remessas.lista"
            caption="Lista de Remessas de Processos"
            emptyMessage="Nenhuma remessa encontrada para os filtros selecionados."
            rows={filteredRemessas.map((rem) => {
              const isDestCurrent = currentDepartmentId && rem.toDepartmentId === currentDepartmentId;
              const isPendingReceipt = rem.status === "Aguardando Recebimento";

              return {
                id: rem.remessaNumber,
                label: rem.remessaNumber,
                values: {
                  remessaNumber: rem.remessaNumber,
                  fromDepartment: rem.fromDepartmentName,
                  toDepartment: rem.toDepartmentName,
                  count: rem.processCount,
                  status: rem.status,
                  date: rem.createdAt,
                },
                actions: (
                  <div className="flex items-center gap-2">
                    {canOperate && isDestCurrent && isPendingReceipt && (
                      <button
                        onClick={() =>
                          setActionRemessaModal({ type: "receive", remessaNumber: rem.remessaNumber })
                        }
                        className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                        title="Confirmar recebimento de todos os processos desta remessa (19.66)"
                      >
                        Receber Remessa (19.66)
                      </button>
                    )}
                    {canOperate && isDestCurrent && rem.status !== "Encerrada" && (
                      <button
                        onClick={() =>
                          setActionRemessaModal({ type: "close", remessaNumber: rem.remessaNumber })
                        }
                        className="px-2 py-1 rounded bg-slate-700 text-white text-xs font-semibold hover:bg-slate-800"
                        title="Encerrar remessa simultaneamente (19.63)"
                      >
                        Encerrar (19.63)
                      </button>
                    )}
                  </div>
                ),
              };
            })}
          />
        </OperationalListFrame>
      )}

      {/* ABA 2: PROCESSOS NAS REMESSAS (19.62) */}
      {activeTab === "processos" && (
        <OperationalListFrame
          label="Processos Contidos nas Remessas"
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={exportProcessesCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Exportar CSV (19.62)
              </button>
              <button
                onClick={printCurrentView}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                Imprimir Relatório HTML (19.62)
              </button>
            </div>
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-3 w-full bg-slate-50 p-3 rounded-lg border border-slate-200">
              <input
                type="text"
                placeholder="Buscar por protocolo ou interessado..."
                value={filterProcessQuery}
                onChange={(e) => setFilterProcessQuery(e.target.value)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs w-64 bg-white"
              />
              <input
                type="text"
                placeholder="Filtrar por número da remessa..."
                value={filterProcessRemessa}
                onChange={(e) => setFilterProcessRemessa(e.target.value)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs w-56 bg-white"
              />
              <button
                onClick={() => {
                  setFilterProcessQuery("");
                  setFilterProcessRemessa("");
                }}
                className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-800 px-2 py-1.5 border rounded bg-white"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Limpar (19.107)
              </button>
            </div>
          }
        >
          <OperationalTable
            columns={processColumns}
            preferenceId="protocolos.remessas.processos"
            caption="Processos em Remessas"
            emptyMessage="Nenhum processo em remessa encontrado."
            rows={filteredRemessaProcesses.map((item) => ({
              id: `${item.remessaNumber}-${item.processId}`,
              label: item.protocolNumber,
              values: {
                protocol: item.protocolNumber,
                remessa: item.remessaNumber,
                interessado: item.interessado,
                route: `${item.fromDepartmentName} → ${item.toDepartmentName}`,
                status: item.status,
                date: item.movedAt,
              },
              cells: {
                protocol: (
                  <Link
                    href={`/protocolos/processos/${item.processId}`}
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    {item.protocolNumber}
                  </Link>
                ),
              },
            }))}
          />
        </OperationalListFrame>
      )}

      {/* ABA 3: NOVA REMESSA EM LOTE (19.64) */}
      {activeTab === "nova" && canOperate && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Nova Remessa / Envio em Lote (19.64)</h2>
            <p className="text-sm text-slate-500">
              Selecione múltiplos processos que estão sob posse do seu setor para encaminhá-los simultaneamente ao setor de destino.
            </p>
          </div>

          <form onSubmit={handleDispatchRemessa} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Setor de Destino *
                </label>
                <select
                  required
                  value={newRemessaDestDept}
                  onChange={(e) => setNewRemessaDestDept(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                >
                  <option value="">Selecione o setor de destino...</option>
                  {departments
                    .filter((d) => d.id !== currentDepartmentId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Observações da Remessa (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Remessa de processos fiscais para análise técnica..."
                  value={newRemessaNotes}
                  onChange={(e) => setNewRemessaNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
                />
              </div>
            </div>

            {/* Seleção de processos elegíveis do setor */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 uppercase">
                  Processos Disponíveis no seu Setor ({availableProcesses.length}):
                </span>
                <span className="text-xs text-emerald-700 font-semibold">
                  {selectedProcessIds.length} selecionado(s)
                </span>
              </div>

              {availableProcesses.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  Nenhum processo disponível no setor no momento para inclusão em remessa.
                </div>
              ) : (
                <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {availableProcesses.map((proc) => {
                    const isSelected = selectedProcessIds.includes(proc.id);
                    return (
                      <label
                        key={proc.id}
                        className={`flex items-center gap-3 p-3 text-sm cursor-pointer hover:bg-slate-50 transition-colors ${
                          isSelected ? "bg-emerald-50/60" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProcessIds([...selectedProcessIds, proc.id]);
                            } else {
                              setSelectedProcessIds(selectedProcessIds.filter((id) => id !== proc.id));
                            }
                          }}
                          className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                        />
                        <div className="flex-1">
                          <p className="font-bold text-slate-900">{proc.protocolNumber}</p>
                          <p className="text-xs text-slate-600">
                            {proc.subjectName} · Interessado: {proc.interessado}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400">{proc.createdAt}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isPending || selectedProcessIds.length === 0 || !newRemessaDestDept}
              className="flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {isPending ? "Despachando..." : `Despachar Remessa (${selectedProcessIds.length} processos)`}
            </button>
          </form>
        </div>
      )}

      {/* ABA 4: ENVIO UNITÁRIO AO SETOR (19.64) */}
      {activeTab === "unitario" && canOperate && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6 max-w-2xl">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Envio de Processo Unitário (19.64)</h2>
            <p className="text-sm text-slate-500">
              Encaminhe um único processo diretamente ao setor responsável sem necessidade de agrupar em remessa.
            </p>
          </div>

          <form onSubmit={handleDispatchSingle} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Processo a Encaminhar *
              </label>
              <select
                required
                value={singleProcessId}
                onChange={(e) => setSingleProcessId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
              >
                <option value="">Selecione o processo...</option>
                {availableProcesses.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.protocolNumber} - {p.subjectName} ({p.interessado})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Setor de Destino *
              </label>
              <select
                required
                value={singleDestDept}
                onChange={(e) => setSingleDestDept(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
              >
                <option value="">Selecione o setor...</option>
                {departments
                  .filter((d) => d.id !== currentDepartmentId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Motivo / Despacho do Encaminhamento
              </label>
              <textarea
                rows={3}
                placeholder="Descreva o motivo do encaminhamento deste processo..."
                value={singleNotes}
                onChange={(e) => setSingleNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isPending || !singleProcessId || !singleDestDept}
              className="flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              <ArrowRight className="w-4 h-4" />
              {isPending ? "Encaminhando..." : "Encaminhar Processo Unitariamente"}
            </button>
          </form>
        </div>
      )}

      {/* ABA 5: RELATÓRIO REMESSAS POR PROCESSO (19.78) */}
      {activeTab === "relatorio" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Relatório Remessas por Processo (19.78)</h2>
              <p className="text-sm text-slate-500">
                Histórico detalhado das remessas em que cada processo tramitou no sistema.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={printCurrentView}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                <Printer className="w-4 h-4" />
                Imprimir Relatório (19.78)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
            <input
              type="text"
              placeholder="Pesquisar por número de protocolo..."
              value={reportProtocolQuery}
              onChange={(e) => setReportProtocolQuery(e.target.value)}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs w-72 bg-white"
            />
            {reportProtocolQuery && (
              <button
                onClick={() => setReportProtocolQuery("")}
                className="text-xs text-slate-600 hover:underline"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-700 border-b font-bold uppercase">
                <tr>
                  <th className="p-3">Protocolo</th>
                  <th className="p-3">Remessa Vinculada</th>
                  <th className="p-3">Interessado</th>
                  <th className="p-3">Origem → Destino</th>
                  <th className="p-3">Situação</th>
                  <th className="p-3">Data Tramitação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportRemessasByProcess.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      Nenhum histórico de remessa encontrado para o protocolo informado.
                    </td>
                  </tr>
                ) : (
                  reportRemessasByProcess.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">
                        <Link
                          href={`/protocolos/processos/${item.processId}`}
                          className="text-emerald-700 hover:underline"
                        >
                          {item.protocolNumber}
                        </Link>
                      </td>
                      <td className="p-3 font-mono font-semibold text-slate-800">{item.remessaNumber}</td>
                      <td className="p-3 text-slate-700">{item.interessado}</td>
                      <td className="p-3 text-slate-600">
                        {item.fromDepartmentName} → {item.toDepartmentName}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-800">
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{item.movedAt}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE AÇÃO: RECEBER OU ENCERRAR REMESSA (19.66 & 19.63) */}
      {actionRemessaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {actionRemessaModal.type === "receive"
                ? `Confirmar Recebimento por Remessa (19.66)`
                : `Encerrar Remessa em Lote (19.63)`}
            </h3>

            <p className="text-sm text-slate-600">
              {actionRemessaModal.type === "receive"
                ? `Você está confirmando o recebimento de todos os processos enviados na Remessa ${actionRemessaModal.remessaNumber}. Os processos passarão a constar como Aberto sob responsabilidade do seu setor.`
                : `Você está efetuando o encerramento simultâneo da Remessa ${actionRemessaModal.remessaNumber} e todos os processos contidos nela.`}
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                {actionRemessaModal.type === "receive" ? "Observações de Recebimento" : "Motivo do Encerramento *"}
              </label>
              <textarea
                required={actionRemessaModal.type === "close"}
                rows={3}
                placeholder="Informe as anotações operacionais..."
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionRemessaModal(null)}
                className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isPending || (actionRemessaModal.type === "close" && actionNotes.trim().length < 5)}
                onClick={actionRemessaModal.type === "receive" ? handleConfirmReceive : handleConfirmClose}
                className={`rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${
                  actionRemessaModal.type === "receive" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-red-700 hover:bg-red-800"
                }`}
              >
                {isPending
                  ? "Processando..."
                  : actionRemessaModal.type === "receive"
                  ? "Confirmar Recebimento"
                  : "Encerrar Remessa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
