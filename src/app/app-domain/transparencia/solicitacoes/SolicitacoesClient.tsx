"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  MessageSquare,
  ShieldAlert,
  Send,
  User,
} from "lucide-react";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { respondCitizenRequest, extendCitizenDeadline, respondCitizenAppeal } from "./actions";

export type CitizenAppealItem = {
  id: string;
  level: number;
  message: string;
  status: string;
  response: string | null;
  dueAt: string;
  respondedAt: string | null;
  createdAt: string;
};

export type CitizenRequestItem = {
  id: string;
  protocol: string;
  type: string;
  entity: string;
  name: string | null;
  email: string | null;
  subject: string;
  message: string;
  status: string;
  response: string | null;
  respondedAt: string | null;
  dueAt: string;
  outcome: string | null;
  extendedAt: string | null;
  extensionReason: string | null;
  nativeTicketId: string | null;
  nativeOmbudsmanId: string | null;
  createdAt: string;
  ageDays: number;
  timeStatus: {
    label: string;
    variant: "default" | "secondary" | "warning" | "destructive" | "success";
    urgency: "baixa" | "media" | "alta" | "critica" | "concluida";
  };
  appeals: CitizenAppealItem[];
};

const columns: OperationalColumn[] = [
  { key: "protocol", label: "Protocolo", initialWidth: 150, minWidth: 120, maxWidth: 200, type: "identifier", resizable: true, sortable: false, details: "none" },
  { key: "type", label: "Tipo", initialWidth: 100, minWidth: 80, maxWidth: 130, type: "text", resizable: true, sortable: false, details: "none" },
  { key: "subject", label: "Descrição / Assunto", initialWidth: 280, minWidth: 180, maxWidth: 500, type: "text", resizable: true, sortable: false, details: "overflow" },
  { key: "applicant", label: "Solicitante", initialWidth: 180, minWidth: 120, maxWidth: 260, type: "text", resizable: true, sortable: false, details: "overflow" },
  { key: "createdAt", label: "Criação", initialWidth: 105, minWidth: 95, maxWidth: 130, type: "text", resizable: true, sortable: false, details: "none" },
  { key: "ageDays", label: "Tempo Decorrido", initialWidth: 130, minWidth: 110, maxWidth: 160, type: "text", resizable: true, sortable: false, details: "none" },
  { key: "timeStatus", label: "Status por Tempo", initialWidth: 170, minWidth: 140, maxWidth: 220, type: "status", resizable: true, sortable: false, details: "none" },
  { key: "status", label: "Situação", initialWidth: 120, minWidth: 100, maxWidth: 150, type: "status", resizable: true, sortable: false, details: "none" },
  { key: "actions", label: "Ações", initialWidth: 90, minWidth: 80, maxWidth: 110, type: "actions", resizable: false, sortable: false, details: "none", align: "right" },
];

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function SolicitacoesClient({
  requests,
  canUpdate,
}: {
  requests: CitizenRequestItem[];
  canUpdate: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState<CitizenRequestItem | null>(null);

  const term = search.trim().toLowerCase();
  const filtered = requests.filter((row) => {
    if (term) {
      const match =
        row.protocol.toLowerCase().includes(term) ||
        row.subject.toLowerCase().includes(term) ||
        (row.name && row.name.toLowerCase().includes(term)) ||
        (row.email && row.email.toLowerCase().includes(term));
      if (!match) return false;
    }
    if (statusFilter && row.status !== statusFilter) return false;
    if (typeFilter && row.type !== typeFilter) return false;
    if (urgencyFilter && row.timeStatus.urgency !== urgencyFilter) return false;
    return true;
  });

  const total = filtered.length;
  const activePage = Math.min(page, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const pageRows = filtered.slice(
    (activePage - 1) * OPERATIONAL_PAGE_SIZE,
    activePage * OPERATIONAL_PAGE_SIZE
  );

  // Quick stats
  const totalEsic = requests.filter((r) => r.type === "ESIC").length;
  const pendentes = requests.filter((r) => r.status !== "RESPONDIDO").length;
  const criticos = requests.filter(
    (r) => r.status !== "RESPONDIDO" && (r.timeStatus.urgency === "critica" || r.timeStatus.urgency === "alta")
  ).length;

  return (
    <>
      <OperationalListFrame
        label="Fila de Atendimento e-SIC e Manifestações"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/transparencia" className={styles.dialogButton}>
              ← Painel Transparência
            </Link>
            <Link
              href="/portal/acesso-informacao"
              target="_blank"
              className={styles.dialogButton}
            >
              Portal Público e-SIC ↗
            </Link>
          </div>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Buscar solicitação"
              className={styles.searchInput}
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por protocolo, assunto, solicitante ou e-mail…"
            />
            <select
              aria-label="Filtrar por tipo"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded border border-slate-300 px-2 text-xs"
            >
              <option value="">Todos os tipos</option>
              <option value="ESIC">e-SIC</option>
              <option value="SOLICITACAO">Solicitação</option>
              <option value="RECLAMACAO">Reclamação</option>
              <option value="DENUNCIA">Denúncia</option>
              <option value="SUGESTAO">Sugestão</option>
              <option value="ELOGIO">Elogio</option>
            </select>
            <select
              aria-label="Filtrar por situação"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded border border-slate-300 px-2 text-xs"
            >
              <option value="">Todas as situações</option>
              <option value="RECEBIDO">Recebido</option>
              <option value="EM_ANALISE">Em Análise</option>
              <option value="RESPONDIDO">Respondido</option>
            </select>
            <select
              aria-label="Filtrar por status temporal"
              value={urgencyFilter}
              onChange={(e) => {
                setUrgencyFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded border border-slate-300 px-2 text-xs"
            >
              <option value="">Todas as urgências</option>
              <option value="baixa">No Prazo (≤ 5 dias)</option>
              <option value="media">Em Andamento (6–15 dias)</option>
              <option value="alta">Alerta de Prazo (16–20 dias)</option>
              <option value="critica">Prazo Vencido (&gt; 20 dias)</option>
              <option value="concluida">Respondidos</option>
            </select>
            <div className="ml-auto hidden items-center gap-3 text-xs md:flex">
              <span className="font-semibold text-slate-600">Total e-SIC: {totalEsic}</span>
              <span className="font-semibold text-amber-700">Pendentes: {pendentes}</span>
              {criticos > 0 && (
                <span className="rounded bg-rose-100 px-2 py-0.5 font-bold text-rose-800">
                  {criticos} em alerta/crítico
                </span>
              )}
            </div>
          </div>
        }
        pagination={
          <OperationalPagination
            page={activePage}
            total={total}
            onPageChange={setPage}
          />
        }
      >
        <OperationalTable
          columns={columns}
          preferenceId="transparencia.solicitacoes.fila"
          caption="Fila de atendimento de pedidos de informação e-SIC com status baseado no tempo em dias"
          emptyMessage="Nenhuma solicitação encontrada para os filtros selecionados."
          rows={pageRows.map((row) => ({
            id: row.id,
            label: row.protocol,
            values: {
              protocol: row.protocol,
              type: row.type,
              subject: row.subject,
              applicant: row.name ? `${row.name}${row.email ? ` (${row.email})` : ""}` : "Anônimo",
              createdAt: formatDate(row.createdAt),
              ageDays: `${row.ageDays} dia(s)`,
              timeStatus: row.timeStatus.label,
              status: row.status,
            },
            actions: (
              <div className={styles.rowActions}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedRequest(row)}
                  title="Ver detalhes e atender solicitação"
                  className="h-7 px-2 text-xs"
                >
                  <Eye className="size-3.5 mr-1" />
                  Atender
                </Button>
              </div>
            ),
          }))}
        />
      </OperationalListFrame>

      {/* Modal de Atendimento e Detalhes do Pedido */}
      <Dialog open={Boolean(selectedRequest)} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedRequest && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="size-5 text-sky-700" />
                    Solicitação {selectedRequest.protocol}
                  </DialogTitle>
                  <Badge
                    variant={
                      selectedRequest.timeStatus.variant === "destructive"
                        ? "destructive"
                        : "secondary"
                    }
                    className={
                      selectedRequest.timeStatus.variant === "success"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : selectedRequest.timeStatus.variant === "warning"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : undefined
                    }
                  >
                    {selectedRequest.timeStatus.label}
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-slate-500">
                  Criada em {formatDate(selectedRequest.createdAt)} ({selectedRequest.ageDays} dias corridos) · Prazo legal até {formatDate(selectedRequest.dueAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 pt-2 text-sm">
                <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <strong className="text-slate-500 block">Tipo:</strong>
                      <span>{selectedRequest.type}</span>
                    </div>
                    <div>
                      <strong className="text-slate-500 block">Entidade:</strong>
                      <span className="capitalize">{selectedRequest.entity}</span>
                    </div>
                    <div>
                      <strong className="text-slate-500 block">Solicitante:</strong>
                      <span>{selectedRequest.name || "Identificação não informada"}</span>
                    </div>
                    <div>
                      <strong className="text-slate-500 block">E-mail:</strong>
                      <span>{selectedRequest.email || "Não informado"}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <strong className="text-slate-700 block text-xs mb-1">Assunto / Título:</strong>
                    <p className="font-semibold text-slate-900">{selectedRequest.subject}</p>
                  </div>
                  <div>
                    <strong className="text-slate-700 block text-xs mb-1">Mensagem / Pedido do Cidadão:</strong>
                    <p className="whitespace-pre-wrap rounded bg-white p-2.5 border text-xs text-slate-800 leading-relaxed">
                      {selectedRequest.message}
                    </p>
                  </div>
                </div>

                {/* Resposta / Ação de Atendimento */}
                {selectedRequest.nativeTicketId || selectedRequest.nativeOmbudsmanId ? (
                  <div className="rounded border border-sky-300 bg-sky-50 p-3 text-xs text-sky-900">
                    <p className="font-semibold">Solicitação integrada ao módulo de Atendimento:</p>
                    <Link
                      href={
                        selectedRequest.nativeTicketId
                          ? `/atendimento/chamados/${selectedRequest.nativeTicketId}`
                          : `/atendimento/ouvidoria/${selectedRequest.nativeOmbudsmanId}`
                      }
                      className="mt-1 inline-block font-bold underline"
                    >
                      Abrir chamado / manifestação correspondente ↗
                    </Link>
                  </div>
                ) : (
                  <form action={respondCitizenRequest} className="space-y-3 rounded-lg border p-3 bg-white">
                    <input type="hidden" name="id" value={selectedRequest.id} />
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Send className="size-3.5 text-sky-700" />
                      Registrar Resposta Oficial
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <label className="font-semibold block mb-1">Situação:</label>
                        <select
                          name="status"
                          defaultValue={selectedRequest.status === "RECEBIDO" ? "EM_ANALISE" : selectedRequest.status}
                          className="w-full rounded border p-2"
                        >
                          <option value="EM_ANALISE">Em Análise</option>
                          <option value="RESPONDIDO">Respondido</option>
                        </select>
                      </div>
                      <div>
                        <label className="font-semibold block mb-1">Resultado:</label>
                        <select
                          name="outcome"
                          defaultValue={selectedRequest.outcome || "CONCEDIDO"}
                          className="w-full rounded border p-2"
                        >
                          <option value="CONCEDIDO">Acesso Concedido</option>
                          <option value="PARCIAL">Acesso Parcial</option>
                          <option value="INDEFERIDO">Acesso Indeferido</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="font-semibold block text-xs mb-1">Texto da Resposta:</label>
                      <textarea
                        name="response"
                        rows={4}
                        maxLength={12000}
                        defaultValue={selectedRequest.response || ""}
                        placeholder="Insira a fundamentação e as informações solicitadas pelo cidadão..."
                        className="w-full rounded border p-2 text-xs"
                      />
                    </div>
                    <Button type="submit" disabled={!canUpdate} size="sm" className="w-full bg-sky-900 text-white">
                      Salvar Resposta da Solicitação
                    </Button>
                  </form>
                )}

                {/* Prorrogação de Prazo */}
                {!selectedRequest.extendedAt && selectedRequest.status !== "RESPONDIDO" && (
                  <details className="rounded border p-3 bg-amber-50/50 text-xs">
                    <summary className="font-bold text-amber-900 cursor-pointer">
                      Prorrogar Prazo Legal (+{selectedRequest.type === "ESIC" ? "10" : "30"} dias)
                    </summary>
                    <form action={extendCitizenDeadline} className="mt-3 space-y-2">
                      <input type="hidden" name="id" value={selectedRequest.id} />
                      <label className="font-semibold block">Justificativa da Prorrogação:</label>
                      <textarea
                        name="reason"
                        required
                        minLength={20}
                        maxLength={4000}
                        placeholder="Descreva o motivo que exige tempo adicional para consolidar as informações..."
                        className="w-full rounded border p-2 bg-white"
                        rows={2}
                      />
                      <Button
                        type="submit"
                        disabled={!canUpdate}
                        variant="outline"
                        size="sm"
                        className="border-amber-600 text-amber-900 hover:bg-amber-100"
                      >
                        Confirmar Prorrogação
                      </Button>
                    </form>
                  </details>
                )}

                {/* Recursos */}
                {selectedRequest.appeals.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                      Recursos Interpostos pelo Cidadão ({selectedRequest.appeals.length})
                    </h4>
                    {selectedRequest.appeals.map((appeal) => (
                      <div key={appeal.id} className="rounded border p-3 bg-slate-50 text-xs space-y-2">
                        <div className="flex justify-between font-semibold">
                          <span>Instância Recursal {appeal.level}ª</span>
                          <span className="text-slate-500">Prazo: {formatDate(appeal.dueAt)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-slate-700 bg-white p-2 rounded border">
                          {appeal.message}
                        </p>
                        <form action={respondCitizenAppeal} className="space-y-2">
                          <input type="hidden" name="id" value={appeal.id} />
                          <label className="font-semibold block">Decisão do Recurso:</label>
                          <textarea
                            name="response"
                            required
                            minLength={10}
                            defaultValue={appeal.response || ""}
                            className="w-full rounded border p-2 bg-white"
                            rows={2}
                          />
                          <Button type="submit" disabled={!canUpdate} size="sm" variant="outline">
                            Registrar Decisão Recursal
                          </Button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
