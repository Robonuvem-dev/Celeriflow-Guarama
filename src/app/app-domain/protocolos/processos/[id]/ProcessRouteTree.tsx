"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  GitFork,
  CheckCircle2,
  Clock,
  ArrowRight,
  Building,
  User,
  FileText,
  AlertCircle,
  CornerDownRight,
  Printer,
} from "lucide-react";

type Movement = {
  id: string;
  movedAt: Date;
  status: string;
  reason?: string | null;
  fromDepartment?: { name: string } | null;
  toDepartment: { name: string };
  employee?: { name: string } | null;
  receivedByEmployee?: { name: string } | null;
};

type GenericWorkflowStage = {
  id?: string;
  position: number;
  label: string;
  slaCalendarDays?: number;
};

type ProcessDispatchItem = {
  id: string;
  content: string;
  dispatchType: string;
  createdAt: Date;
  employee: { name: string };
};

type ProcessRouteTreeProps = {
  protocolNumber: string;
  status: string;
  createdAt: Date;
  portalOrigin: string | null;
  processTypeName: string;
  subjectName: string;
  currentDepartmentName?: string;
  interessado: string;
  genericStages?: GenericWorkflowStage[];
  currentPosition?: number;
  movements: Movement[];
  dispatches: ProcessDispatchItem[];
};

export default function ProcessRouteTree({
  protocolNumber,
  status,
  createdAt,
  portalOrigin,
  processTypeName,
  subjectName,
  currentDepartmentName,
  interessado,
  genericStages = [],
  currentPosition = 1,
  movements,
  dispatches,
}: ProcessRouteTreeProps) {
  const [expandTree, setExpandTree] = useState(true);
  const [expandWorkflow, setExpandWorkflow] = useState(true);
  const [expandMovements, setExpandMovements] = useState(true);
  const [expandDispatches, setExpandDispatches] = useState(true);

  const isPortal = Boolean(portalOrigin && portalOrigin !== "" && portalOrigin !== "BALCAO");

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-200 bg-slate-50/75 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitFork className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-800">
            Roteiro em Árvore do Processo (19.59)
          </h3>
          <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full font-semibold">
            Hierarquia Operacional
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const nextState = !expandTree;
              setExpandTree(nextState);
              setExpandWorkflow(nextState);
              setExpandMovements(nextState);
              setExpandDispatches(nextState);
            }}
            className="text-xs px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium transition"
          >
            {expandTree ? "Recolher Tudo" : "Expandir Tudo"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-900 text-white font-medium inline-flex items-center gap-1 transition"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir Roteiro
          </button>
        </div>
      </div>

      <div className="p-5 font-sans">
        {/* Raiz da Árvore: Processo */}
        <div className="relative pl-6 pb-4 border-l-2 border-indigo-300">
          <div className="absolute -left-2.5 top-0 w-5 h-5 rounded-full bg-indigo-600 border-2 border-white flex items-center justify-center text-white shadow-sm">
            <span className="text-[10px] font-bold">1</span>
          </div>

          <div className="bg-indigo-50/70 border border-indigo-200 rounded-lg p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-indigo-950 uppercase tracking-wide">
                Nó Raiz: Abertura do Protocolo #{protocolNumber}
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white text-indigo-800 border border-indigo-200">
                Canal: {isPortal ? "Portal de Serviços Online" : "Balcão Presencial"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs text-slate-700">
              <div>
                <span className="text-slate-400 block font-medium">Requerente / Interessado:</span>
                <strong className="text-slate-900">{interessado}</strong>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Tipo / Assunto:</span>
                <span className="text-slate-800">{processTypeName} &bull; {subjectName}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Data de Registro:</span>
                <span className="text-slate-800">{new Date(createdAt).toLocaleString("pt-BR")}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Setor Atual:</span>
                <span className="text-emerald-700 font-bold">{currentDepartmentName || "Setor de Protocolo"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ramo 1: Etapas Previstas do Roteiro / Workflow */}
        <div className="relative pl-6 pb-4 border-l-2 border-indigo-200">
          <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-sm"></div>

          <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/40">
            <button
              type="button"
              onClick={() => setExpandWorkflow(!expandWorkflow)}
              className="w-full p-2.5 bg-slate-100/80 hover:bg-slate-100 flex items-center justify-between text-left text-xs font-bold text-slate-800 transition"
            >
              <span className="flex items-center gap-2">
                {expandWorkflow ? <ChevronDown className="w-4 h-4 text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-600" />}
                Roteiro de Etapas Previstas {genericStages.length > 0 ? `(${genericStages.length} etapas no fluxo)` : "(Roteiro Dinâmico por Tipo)"}
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                Status Atual: Etapa {currentPosition} &bull; {status}
              </span>
            </button>

            {expandWorkflow && (
              <div className="p-3 bg-white space-y-2">
                {genericStages.length > 0 ? (
                  genericStages.map((stage) => {
                    const isDone = stage.position < currentPosition || status === "Concluído";
                    const isCurrent = stage.position === currentPosition && status !== "Concluído";
                    return (
                      <div
                        key={stage.position}
                        className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs transition ${
                          isCurrent
                            ? "bg-amber-50/70 border-amber-300 shadow-sm"
                            : isDone
                            ? "bg-emerald-50/40 border-emerald-200 text-slate-700"
                            : "bg-slate-50 border-slate-200 text-slate-500"
                        }`}
                      >
                        <div className="mt-0.5">
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : isCurrent ? (
                            <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-slate-300 flex items-center justify-center text-[9px] font-bold text-slate-400">
                              {stage.position}
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800">
                              Etapa {stage.position}: {stage.label}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                isDone
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isCurrent
                                  ? "bg-amber-200 text-amber-900"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {isDone ? "Concluída" : isCurrent ? "Em Andamento" : "Aguardando"}
                            </span>
                          </div>
                          {stage.slaCalendarDays && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Prazo regulamentar de atendimento: {stage.slaCalendarDays} dia(s)
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 bg-slate-50 rounded border text-xs text-slate-600">
                    <p className="font-semibold text-slate-800">
                      Roteiro padrão de tramitação para &quot;{subjectName}&quot;:
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="px-2 py-1 bg-white border rounded font-medium text-slate-700">1. Balcão / Protocolo Central</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="px-2 py-1 bg-white border rounded font-medium text-slate-700">2. Setor Competente ({currentDepartmentName || "Setor Técnico"})</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="px-2 py-1 bg-white border rounded font-medium text-slate-700">3. Parecer / Análise Conclusiva</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="px-2 py-1 bg-white border rounded font-medium text-slate-700">4. Finalização / Arquivamento</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ramo 2: Árvore Hierárquica de Movimentações */}
        <div className="relative pl-6 pb-4 border-l-2 border-indigo-200">
          <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-sm"></div>

          <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/40">
            <button
              type="button"
              onClick={() => setExpandMovements(!expandMovements)}
              className="w-full p-2.5 bg-slate-100/80 hover:bg-slate-100 flex items-center justify-between text-left text-xs font-bold text-slate-800 transition"
            >
              <span className="flex items-center gap-2">
                {expandMovements ? <ChevronDown className="w-4 h-4 text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-600" />}
                Tramitação e Ramificações de Setores ({movements.length} movimentações registradas)
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                {movements.length === 0 ? "Aguardando 1º encaminhamento" : "Árvore de Remessas"}
              </span>
            </button>

            {expandMovements && (
              <div className="p-3 bg-white space-y-3">
                {movements.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-2 text-center">
                    Processo registrado na unidade de origem sem remessas adicionais até o momento.
                  </p>
                ) : (
                  movements.map((mov, idx) => (
                    <div key={mov.id} className="relative pl-5 border-l-2 border-slate-200 space-y-1">
                      <div className="absolute -left-1.5 top-1.5 w-3 h-3 rounded-full bg-white border-2 border-indigo-500"></div>

                      <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <CornerDownRight className="w-3.5 h-3.5 text-indigo-600" />
                            {idx + 1}º Passo: {mov.fromDepartment?.name || "Protocolo de Origem"} &rarr;{" "}
                            <span className="text-indigo-900 underline">{mov.toDepartment.name}</span>
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(mov.movedAt).toLocaleString("pt-BR")}
                          </span>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            Remetente: {mov.employee?.name || "Sistema"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Building className="w-3 h-3 text-slate-400" />
                            Destino: {mov.toDepartment.name}
                          </span>
                          <span className="font-semibold text-slate-700">
                            Situação:{" "}
                            <span
                              className={
                                mov.status === "RECEIVED"
                                  ? "text-emerald-700 font-bold"
                                  : mov.status === "AWAITING_RECEIPT"
                                  ? "text-amber-700 font-bold"
                                  : "text-red-700 font-bold"
                              }
                            >
                              {mov.status === "RECEIVED"
                                ? `Recebido${mov.receivedByEmployee ? ` por ${mov.receivedByEmployee.name}` : ""}`
                                : mov.status === "AWAITING_RECEIPT"
                                ? "Aguardando recebimento"
                                : mov.status}
                            </span>
                          </span>
                        </div>

                        {mov.reason && (
                          <p className="mt-1.5 text-slate-600 bg-white p-1.5 rounded border border-slate-100 text-[11px] italic">
                            &quot;{mov.reason}&quot;
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ramo 3: Despachos e Pareceres Hierárquicos */}
        <div className="relative pl-6">
          <div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow-sm"></div>

          <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/40">
            <button
              type="button"
              onClick={() => setExpandDispatches(!expandDispatches)}
              className="w-full p-2.5 bg-slate-100/80 hover:bg-slate-100 flex items-center justify-between text-left text-xs font-bold text-slate-800 transition"
            >
              <span className="flex items-center gap-2">
                {expandDispatches ? <ChevronDown className="w-4 h-4 text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-600" />}
                Despachos e Pareceres no Roteiro ({dispatches.length} manifestações)
              </span>
              <span className="text-[11px] font-normal text-slate-500">
                Folhas de Despacho
              </span>
            </button>

            {expandDispatches && (
              <div className="p-3 bg-white space-y-2">
                {dispatches.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-2 text-center">
                    Nenhum parecer técnico ou despacho anexado a esta ramificação.
                  </p>
                ) : (
                  dispatches.map((disp, i) => (
                    <div key={disp.id} className="p-2.5 bg-slate-50 border rounded text-xs space-y-1">
                      <div className="flex items-center justify-between font-semibold text-slate-800">
                        <span className="inline-flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-indigo-600" />
                          Folha {i + 1} &bull; {disp.dispatchType} por {disp.employee.name}
                        </span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          {new Date(disp.createdAt).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-slate-700 whitespace-pre-wrap pl-5 border-l-2 border-amber-300 mt-1">
                        {disp.content}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
