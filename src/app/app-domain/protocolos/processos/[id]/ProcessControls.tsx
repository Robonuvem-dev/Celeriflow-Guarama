"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, FileText, Send, X, HelpCircle, Copy, Compass, Ban, Archive, CheckSquare, RotateCcw, AlertTriangle } from "lucide-react";
import {
  addProcessDispatch,
  approveGenericProcessWorkflow,
  archiveProcess,
  cancelProcess,
  cancelProcessForwarding,
  cloneProcessAction,
  concludeGenericProcessWorkflow,
  concludeProcess,
  editProcessInitialRoute,
  forwardProcess,
  publishProcessNotice,
  receiveProcess,
  rejectGenericProcessWorkflow,
  rejectProcessForwarding,
  reopenProcess,
  requestProcessSignatures,
  returnGenericProcessWorkflow,
} from "../../actions";

type Department = { id: string; name: string };
type Mode =
  | "dispatch"
  | "forward"
  | "document"
  | "signatures"
  | "conclude"
  | "archive"
  | "cancel"
  | "reopen"
  | "editRoute"
  | "shortcutsHelp"
  | "genericApprove"
  | "genericReturn"
  | "genericReject"
  | "genericConclude"
  | "cancelForwarding"
  | "rejectForwarding"
  | null;

export default function ProcessControls({
  processId,
  status,
  currentDepartmentId,
  canOperate,
  departments,
  genericWorkflow,
  documentClasses,
  signableDocuments,
  signers,
  canPublishPublicNotice,
  pendingMovement,
  canCancelPending,
  canRejectPending,
  canEditRoute = false,
  situations = [],
}: {
  processId: string;
  status: string;
  currentDepartmentId: string | null;
  canOperate: boolean;
  departments: Department[];
  genericWorkflow: { currentPosition: number; totalStages: number; stageLabel: string; status: string } | null;
  documentClasses: { id: string; label: string }[];
  signableDocuments: { id: string; title: string }[];
  signers: { id: string; nome: string; email: string }[];
  canPublishPublicNotice: boolean;
  pendingMovement: { id: string; fromDepartmentName: string | null; toDepartmentName: string } | null;
  canCancelPending: boolean;
  canRejectPending: boolean;
  canEditRoute?: boolean;
  situations?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [destinationDepartmentId, setDestinationDepartmentId] = useState("");
  const [reason, setReason] = useState("");
  const [selectedSituation, setSelectedSituation] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [dispatchType, setDispatchType] = useState("Despacho");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentType, setDocumentType] = useState("Anexo");
  const [documentClassId, setDocumentClassId] = useState("");
  const [signatureDocumentId, setSignatureDocumentId] = useState("");
  const [selectedSignerIds, setSelectedSignerIds] = useState<string[]>([]);

  const isGeneric = Boolean(genericWorkflow);
  const isTerminal = ["Arquivado", "Cancelado", "Rejeitado"].includes(status) || (isGeneric && genericWorkflow?.status !== "ACTIVE");
  const isAwaitingAccounting = status === "Aguardando Contabilidade";
  const disabled = !canOperate || isTerminal || status === "Aguardando Recebimento";

  function close() {
    if (isPending) return;
    setMode(null);
    setError(null);
  }

  function handleResult(result: { error: string | null }) {
    if (result.error) {
      setError(result.error);
      return;
    }
    setMode(null);
    setError(null);
    router.refresh();
  }

  function handleReceive() {
    setError(null);
    startTransition(async () => handleResult(await receiveProcess(processId)));
  }

  // 19.47: Uso de situações dos processos no momento da movimentação
  function handleForward() {
    setError(null);
    const combinedReason = selectedSituation
      ? `[Situação: ${selectedSituation}] ${reason}`.trim()
      : reason;
    startTransition(async () => {
      handleResult(await forwardProcess({ processId, destinationDepartmentId, reason: combinedReason, dueAt }));
    });
  }

  function handleDispatch() {
    setError(null);
    startTransition(async () => {
      handleResult(await addProcessDispatch({ processId, dispatchType, content }));
    });
  }

  // 19.7: Permitir editar a rota dos processos que não iniciaram a tramitação
  function handleEditRoute() {
    if (!destinationDepartmentId) {
      setError("Selecione o novo setor de destino inicial.");
      return;
    }
    setError(null);
    startTransition(async () => {
      handleResult(await editProcessInitialRoute(processId, destinationDepartmentId, reason));
    });
  }

  // 19.18: Cancelamento de processo
  function handleCancelProcess() {
    if (!reason.trim()) {
      setError("Informe a justificativa do cancelamento.");
      return;
    }
    setError(null);
    startTransition(async () => {
      handleResult(await cancelProcess(processId, reason));
    });
  }

  // 19.31: Clonagem de processos quando se tratar do mesmo assunto
  function handleCloneProcess() {
    if (!confirm("Deseja clonar este processo mantendo o mesmo assunto e parâmetros para novo atendimento (19.31)?")) return;
    setError(null);
    startTransition(async () => {
      const result = await cloneProcessAction(processId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.newProcessId) {
        router.push(`/protocolos/processos/${result.newProcessId}`);
      }
    });
  }

  function handleLifecycle() {
    setError(null);
    startTransition(async () => {
      const result = mode === "genericApprove"
        ? await approveGenericProcessWorkflow(processId, reason)
        : mode === "genericReturn"
          ? await returnGenericProcessWorkflow(processId, reason)
          : mode === "genericReject"
            ? await rejectGenericProcessWorkflow(processId, reason)
            : mode === "genericConclude"
              ? await concludeGenericProcessWorkflow(processId, reason)
        : mode === "conclude"
        ? await concludeProcess(processId, reason)
        : mode === "archive"
          ? await archiveProcess(processId, reason)
          : await reopenProcess(processId, reason);
      handleResult(result);
    });
  }

  function handlePendingMovement() {
    if (!pendingMovement) return;
    setError(null);
    startTransition(async () => {
      const result = mode === "cancelForwarding"
        ? await cancelProcessForwarding(pendingMovement.id, reason)
        : await rejectProcessForwarding(pendingMovement.id, reason);
      handleResult(result);
    });
  }

  // 19.17: Permitir anexar documentos em diversos formatos: .DOC, .XLS, .XML, .TXT, .PDF, .ODT, .CSV, .TIFF e .JPEG
  function handleDocument() {
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }
    if (!documentTitle.trim()) {
      setError("Informe o título do documento.");
      return;
    }
    if (!documentClassId) {
      setError("Selecione a classe documental de assinatura interna.");
      return;
    }

    const allowedExts = [".doc", ".docx", ".xls", ".xlsx", ".xml", ".txt", ".pdf", ".odt", ".csv", ".tiff", ".tif", ".jpeg", ".jpg", ".png"];
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (file.size > 25 * 1024 * 1024 || !allowedExts.includes(ext)) {
      setError("Envie arquivos nos formatos permitidos: .DOC, .XLS, .XML, .TXT, .PDF, .ODT, .CSV, .TIFF ou .JPEG de até 25 MB (19.17).");
      return;
    }

    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("processId", processId);
      formData.append("title", documentTitle);
      formData.append("documentType", documentType);
      formData.append("documentClassId", documentClassId);
      const response = await fetch("/api/protocolos/upload", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Erro ao enviar o arquivo.");
        return;
      }
      setMode(null);
      router.refresh();
    });
  }

  function handleSignatures() {
    if (!signatureDocumentId) {
      setError("Selecione o documento para assinatura.");
      return;
    }
    if (!selectedSignerIds.length) {
      setError("Selecione ao menos um signatário.");
      return;
    }
    setError(null);
    startTransition(async () => handleResult(await requestProcessSignatures({
      processId,
      documentId: signatureDocumentId,
      signerUsuarioIds: selectedSignerIds,
    })));
  }

  function toggleSigner(signerId: string) {
    setSelectedSignerIds((current) => current.includes(signerId)
      ? current.filter((id) => id !== signerId)
      : [...current, signerId]);
  }

  function handlePublishPublicNotice() {
    if (!confirm("Publicar somente o aviso redigido, sem descrição, interessado ou anexos?")) return;
    setError(null);
    startTransition(async () => handleResult(await publishProcessNotice(processId)));
  }

  return (
    <>
      {/* 19.68: Menu Único de Ações Operacionais */}
      <div className="flex flex-wrap items-center gap-2">
        {/* 19.23: Botão informativo com instruções de cada ícone */}
        <button
          type="button"
          onClick={() => setMode("shortcutsHelp")}
          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors"
          title="Instruções dos Ícones e Ações (19.23)"
        >
          <HelpCircle className="w-4 h-4 text-indigo-600" />
          <span className="hidden sm:inline">Ajuda dos Atalhos (19.23)</span>
        </button>

        {status === "Aguardando Recebimento" && (
          <button
            disabled={!canOperate || isTerminal || isPending}
            onClick={handleReceive}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
            title="Confirmar movimentação e receber no setor (19.68)"
          >
            <CheckSquare className="w-4 h-4" />
            Receber Processo
          </button>
        )}

        {/* 19.7: Editar Rota Inicial */}
        {canEditRoute && status === "Aguardando Recebimento" && (
          <button
            disabled={isPending}
            onClick={() => setMode("editRoute")}
            className="px-3.5 py-2 bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors"
            title="Editar rota de processo que não iniciou tramitação (19.7)"
          >
            <Compass className="w-4 h-4 text-amber-700" />
            Editar Rota Inicial (19.7)
          </button>
        )}

        {!isGeneric && canCancelPending && pendingMovement && (
          <button
            disabled={isPending}
            onClick={() => setMode("cancelForwarding")}
            className="px-3.5 py-2 bg-white border border-amber-300 hover:bg-amber-50 disabled:opacity-50 text-amber-800 text-xs font-semibold rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
            title="Estornar movimentação antes do recebimento (19.68)"
          >
            <RotateCcw className="w-4 h-4" />
            Estornar Movimentação
          </button>
        )}

        {!isGeneric && canRejectPending && pendingMovement && (
          <button
            disabled={isPending}
            onClick={() => setMode("rejectForwarding")}
            className="px-3.5 py-2 bg-white border border-red-300 hover:bg-red-50 disabled:opacity-50 text-red-800 text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            Recusar Recebimento
          </button>
        )}

        {/* 19.17: Anexar Documento */}
        <button
          disabled={disabled}
          onClick={() => setMode("document")}
          className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors"
          title="Anexar documentos (.DOC, .XLS, .PDF, .ODT, etc.) (19.17)"
        >
          <FileUp className="w-4 h-4 text-blue-600" />
          Anexar Documento (19.17)
        </button>

        {signableDocuments.length > 0 && (
          <button
            disabled={disabled}
            onClick={() => setMode("signatures")}
            className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors"
          >
            Solicitar Assinatura
          </button>
        )}

        {canPublishPublicNotice && (
          <button
            disabled={isPending}
            onClick={handlePublishPublicNotice}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            Publicar Aviso
          </button>
        )}

        {/* Despacho / Parecer */}
        <button
          disabled={disabled}
          onClick={() => setMode("dispatch")}
          className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors"
          title="Observações gerais e despachos (19.68)"
        >
          <FileText className="w-4 h-4 text-emerald-600" />
          Despacho / Parecer
        </button>

        {/* 19.47: Tramitar com Situação */}
        {!isGeneric && (
          <button
            disabled={disabled || isAwaitingAccounting}
            onClick={() => setMode("forward")}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
            title="Movimentar processo para outro setor (19.68, 19.47)"
          >
            <Send className="w-4 h-4" />
            Tramitar
          </button>
        )}

        {/* 19.31: Clonar Processo */}
        <button
          type="button"
          disabled={isPending}
          onClick={handleCloneProcess}
          className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors"
          title="Clonar processo mantendo o mesmo assunto (19.31)"
        >
          <Copy className="w-4 h-4 text-purple-600" />
          Clonar (19.31)
        </button>

        {/* Fluxo Genérico */}
        {isGeneric && genericWorkflow && status !== "Aguardando Recebimento" && !isTerminal ? (
          <>
            {genericWorkflow.currentPosition < genericWorkflow.totalStages && (
              <button disabled={!canOperate || isPending} onClick={() => setMode("genericApprove")} className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors">
                Aprovar e Encaminhar
              </button>
            )}
            {genericWorkflow.currentPosition > 1 && (
              <button disabled={!canOperate || isPending} onClick={() => setMode("genericReturn")} className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors">
                Devolver Etapa
              </button>
            )}
            <button disabled={!canOperate || isPending} onClick={() => setMode("genericReject")} className="px-3.5 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors">
              Rejeitar
            </button>
            {genericWorkflow.currentPosition === genericWorkflow.totalStages && (
              <button disabled={!canOperate || isPending} onClick={() => setMode("genericConclude")} className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors">
                Concluir
              </button>
            )}
          </>
        ) : null}

        {/* 19.18: Concluir / Encerrar Processo */}
        {!isGeneric && (status === "Recebido" || status === "Em Analise" || status === "Reaberto") ? (
          <button
            disabled={!canOperate || isPending}
            onClick={() => setMode("conclude")}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
            title="Encerrar processo com deferimento (19.18, 19.68)"
          >
            Encerrar
          </button>
        ) : null}

        {/* 19.18: Cancelar Processo */}
        {!isTerminal && (
          <button
            disabled={disabled}
            onClick={() => setMode("cancel")}
            className="px-3.5 py-2 bg-white border border-red-300 hover:bg-red-50 disabled:opacity-50 text-red-700 text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5 transition-colors"
            title="Cancelar processo com fundamentação (19.18, 19.68)"
          >
            <Ban className="w-4 h-4 text-red-600" />
            Cancelar (19.18)
          </button>
        )}

        {/* 19.18: Arquivar Processo */}
        {!isGeneric && status === "Concluido" ? (
          <button
            disabled={!canOperate || isPending}
            onClick={() => setMode("archive")}
            className="px-3.5 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
            title="Arquivar processo definitivamente (19.18, 19.68)"
          >
            <Archive className="w-4 h-4" />
            Arquivar
          </button>
        ) : null}

        {!isGeneric && status === "Arquivado" ? (
          <button
            disabled={!canOperate || isPending}
            onClick={() => setMode("reopen")}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            Reabrir
          </button>
        ) : null}
      </div>

      {!canOperate && !canCancelPending && !canRejectPending && (
        <p className="mt-2 text-xs text-slate-500">
          Ações operacionais exigem vínculo ativo com o setor atual do processo.
        </p>
      )}

      {/* Modais e Caixas de Diálogo */}
      {mode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 sticky top-0 bg-white z-10">
              <h2 className="text-base font-bold text-slate-900">
                {mode === "shortcutsHelp"
                  ? "Instruções das Funcionalidades dos Atalhos (19.23)"
                  : mode === "editRoute"
                  ? "Editar Rota Inicial do Processo (19.7)"
                  : mode === "cancel"
                  ? "Cancelar Processo (19.18)"
                  : mode === "forward"
                  ? "Tramitar Processo (19.47)"
                  : mode === "dispatch"
                  ? "Adicionar Despacho / Parecer"
                  : mode === "document"
                  ? "Anexar Documento ao Processo (19.17)"
                  : mode === "signatures"
                  ? "Solicitar Assinaturas"
                  : mode === "conclude"
                  ? "Encerrar / Concluir Processo (19.18)"
                  : mode === "archive"
                  ? "Arquivar Processo (19.18)"
                  : mode === "cancelForwarding"
                  ? "Cancelar Encaminhamento"
                  : mode === "rejectForwarding"
                  ? "Recusar Recebimento"
                  : "Operação do Processo"}
              </h2>
              <button onClick={close} disabled={isPending} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5 text-xs">
              {/* 19.23: Modal com Instruções de Cada Ícone / Atalho */}
              {mode === "shortcutsHelp" && (
                <div className="space-y-3">
                  <p className="text-slate-600 leading-relaxed">
                    Guia de referência das ações operacionais disponíveis no Protocolo e Controle de Processos:
                  </p>
                  <dl className="divide-y divide-slate-100 space-y-2">
                    <div className="pt-2">
                      <dt className="font-bold text-slate-900 flex items-center gap-1.5">
                        <CheckSquare className="w-3.5 h-3.5 text-blue-600" /> Receber Processo
                      </dt>
                      <dd className="text-slate-600 mt-0.5">Confirma o recebimento físico/eletrônico do processo no setor atual.</dd>
                    </div>
                    <div className="pt-2">
                      <dt className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-amber-600" /> Editar Rota Inicial (19.7)
                      </dt>
                      <dd className="text-slate-600 mt-0.5">Permite alterar o setor de destino de processos que ainda não iniciaram tramitação.</dd>
                    </div>
                    <div className="pt-2">
                      <dt className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Send className="w-3.5 h-3.5 text-emerald-600" /> Tramitar / Movimentar (19.47)
                      </dt>
                      <dd className="text-slate-600 mt-0.5">Encaminha o processo ao próximo setor, permitindo informar a situação atual e prazo da etapa.</dd>
                    </div>
                    <div className="pt-2">
                      <dt className="font-bold text-slate-900 flex items-center gap-1.5">
                        <FileUp className="w-3.5 h-3.5 text-blue-600" /> Anexar Documentos (19.17)
                      </dt>
                      <dd className="text-slate-600 mt-0.5">Permite o envio de arquivos em formatos .DOC, .XLS, .XML, .TXT, .PDF, .ODT, .CSV, .TIFF e .JPEG com classe documental.</dd>
                    </div>
                    <div className="pt-2">
                      <dt className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Copy className="w-3.5 h-3.5 text-purple-600" /> Clonar Processo (19.31)
                      </dt>
                      <dd className="text-slate-600 mt-0.5">Cria uma nova autuação copiando o mesmo assunto e parâmetros para atender nova demanda similar.</dd>
                    </div>
                    <div className="pt-2">
                      <dt className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Ban className="w-4 h-4 text-red-600" /> Cancelar Processo (19.18)
                      </dt>
                      <dd className="text-slate-600 mt-0.5">Cancela definitivamente a tramitação mediante justificativa obrigatória.</dd>
                    </div>
                    <div className="pt-2">
                      <dt className="font-bold text-slate-900 flex items-center gap-1.5">
                        <Archive className="w-4 h-4 text-slate-700" /> Arquivar Processo (19.18)
                      </dt>
                      <dd className="text-slate-600 mt-0.5">Arquiva processos já concluídos no repositório geral da administração.</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* 19.7: Editar Rota Inicial */}
              {mode === "editRoute" && (
                <>
                  <p className="text-slate-600">
                    O processo ainda não iniciou a tramitação. Selecione o novo setor de destino para corrigir a rota inicial:
                  </p>
                  <label className="block text-slate-700 font-semibold">
                    Novo Setor Inicial *
                    <select
                      value={destinationDepartmentId}
                      onChange={e => setDestinationDepartmentId(e.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    >
                      <option value="">Selecione o setor...</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-slate-700 font-semibold">
                    Motivo da alteração de rota
                    <textarea
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      rows={3}
                      placeholder="Justifique a correção de rota inicial..."
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    />
                  </label>
                </>
              )}

              {/* 19.18: Cancelamento */}
              {mode === "cancel" && (
                <>
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800">
                    <p className="font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      Confirmação de Cancelamento de Processo
                    </p>
                    <p className="mt-1 text-[11px]">
                      Esta ação encerra a tramitação do processo e notifica o requerente.
                    </p>
                  </div>
                  <label className="block text-slate-700 font-semibold">
                    Justificativa Obrigatória do Cancelamento *
                    <textarea
                      required
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      rows={4}
                      placeholder="Descreva fundamentadamente o motivo do cancelamento..."
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    />
                  </label>
                </>
              )}

              {/* 19.47: Tramitar com Situação */}
              {mode === "forward" && (
                <>
                  <label className="block text-slate-700 font-semibold">
                    Setor de Destino *
                    <select
                      value={destinationDepartmentId}
                      onChange={event => setDestinationDepartmentId(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    >
                      <option value="">Selecione o setor de destino...</option>
                      {departments.filter(d => d.id !== currentDepartmentId).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </label>

                  {/* 19.47: Seleção de Situação Cadastrada */}
                  {situations.length > 0 && (
                    <label className="block text-slate-700 font-semibold">
                      Situação do Processo (19.47)
                      <select
                        value={selectedSituation}
                        onChange={e => setSelectedSituation(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                      >
                        <option value="">Selecione uma situação cadastrada...</option>
                        {situations.map(s => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="block text-slate-700 font-semibold">
                    Prazo da Etapa (Opcional)
                    <input
                      type="date"
                      value={dueAt}
                      onChange={event => setDueAt(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    />
                  </label>

                  <label className="block text-slate-700 font-semibold">
                    Despacho / Motivo do Encaminhamento
                    <textarea
                      value={reason}
                      onChange={event => setReason(event.target.value)}
                      rows={4}
                      placeholder="Orientações e despacho para o setor de destino..."
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    />
                  </label>
                </>
              )}

              {mode === "dispatch" && (
                <>
                  <label className="block text-slate-700 font-semibold">
                    Tipo de Manifestação
                    <select
                      value={dispatchType}
                      onChange={event => setDispatchType(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    >
                      <option>Despacho</option>
                      <option>Parecer Técnico</option>
                      <option>Decisão Administrativa</option>
                      <option>Nota de Expediente</option>
                    </select>
                  </label>
                  <label className="block text-slate-700 font-semibold">
                    Conteúdo
                    <textarea
                      value={content}
                      onChange={event => setContent(event.target.value)}
                      rows={6}
                      placeholder="Redija o despacho ou parecer..."
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    />
                  </label>
                </>
              )}

              {/* 19.17: Anexar Documento */}
              {mode === "document" && (
                <>
                  <label className="block text-slate-700 font-semibold">
                    Título do Documento *
                    <input
                      value={documentTitle}
                      onChange={event => setDocumentTitle(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    />
                  </label>
                  <label className="block text-slate-700 font-semibold">
                    Tipo do Anexo
                    <input
                      value={documentType}
                      onChange={event => setDocumentType(event.target.value)}
                      placeholder="Ex: Anexo, Laudo, Relatório, Edital"
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    />
                  </label>
                  <label className="block text-slate-700 font-semibold">
                    Classe Documental GED *
                    <select
                      value={documentClassId}
                      onChange={event => setDocumentClassId(event.target.value)}
                      required
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    >
                      <option value="">Selecione a classe documental...</option>
                      {documentClasses.map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      Arquivo (19.17: .DOC, .XLS, .XML, .TXT, .PDF, .ODT, .CSV, .TIFF, .JPEG)
                    </label>
                    <input
                      type="file"
                      accept=".doc,.docx,.xls,.xlsx,.xml,.txt,.pdf,.odt,.csv,.tiff,.tif,.jpeg,.jpg,.png,application/pdf,image/*,text/*"
                      onChange={event => {
                        const selectedFile = event.target.files?.[0] || null;
                        setFile(selectedFile);
                        if (selectedFile && !documentTitle) setDocumentTitle(selectedFile.name);
                      }}
                      className="block w-full text-xs text-slate-600 border border-slate-300 rounded-md p-2"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Formatos aceitos: DOC, XLS, XML, TXT, PDF, ODT, CSV, TIFF, JPEG até 25 MB.
                    </p>
                  </div>
                </>
              )}

              {mode === "signatures" && (
                <>
                  <label className="block text-slate-700 font-semibold">
                    Documento para Assinatura
                    <select
                      value={signatureDocumentId}
                      onChange={event => setSignatureDocumentId(event.target.value)}
                      className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                    >
                      <option value="">Selecione o documento...</option>
                      {signableDocuments.map(d => (
                        <option key={d.id} value={d.id}>{d.title}</option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="space-y-1.5 border border-slate-200 rounded-lg p-3">
                    <legend className="px-1 text-slate-700 font-semibold">Signatários com Acesso</legend>
                    {signers.map(s => (
                      <label key={s.id} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded">
                        <input
                          type="checkbox"
                          checked={selectedSignerIds.includes(s.id)}
                          onChange={() => toggleSigner(s.id)}
                        />
                        <span>
                          <strong>{s.nome}</strong> ({s.email})
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </>
              )}

              {(mode === "conclude" || mode === "archive" || mode === "reopen" || mode === "genericReturn" || mode === "genericReject" || mode === "genericConclude" || mode === "cancelForwarding" || mode === "rejectForwarding") && (
                <label className="block text-slate-700 font-semibold">
                  Justificativa / Parecer Final *
                  <textarea
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    rows={4}
                    placeholder="Descreva a fundamentação do encerramento/arquivamento..."
                    className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                  />
                </label>
              )}

              {error && <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 sticky bottom-0">
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                {mode === "shortcutsHelp" ? "Fechar" : "Cancelar"}
              </button>
              {mode !== "shortcutsHelp" && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={
                    mode === "forward"
                      ? handleForward
                      : mode === "editRoute"
                      ? handleEditRoute
                      : mode === "cancel"
                      ? handleCancelProcess
                      : mode === "dispatch"
                      ? handleDispatch
                      : mode === "document"
                      ? handleDocument
                      : mode === "signatures"
                      ? handleSignatures
                      : mode === "cancelForwarding" || mode === "rejectForwarding"
                      ? handlePendingMovement
                      : handleLifecycle
                  }
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isPending
                    ? "Salvando..."
                    : mode === "forward"
                    ? "Confirmar Tramitação"
                    : mode === "editRoute"
                    ? "Salvar Nova Rota"
                    : mode === "cancel"
                    ? "Confirmar Cancelamento"
                    : mode === "dispatch"
                    ? "Salvar Despacho"
                    : mode === "document"
                    ? "Anexar Arquivo"
                    : mode === "signatures"
                    ? "Solicitar Assinatura"
                    : mode === "conclude"
                    ? "Encerrar Processo"
                    : mode === "archive"
                    ? "Arquivar Processo"
                    : "Confirmar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
