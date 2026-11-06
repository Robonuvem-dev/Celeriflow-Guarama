"use client";

import { useState } from "react";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Ban, Edit, FileText, History } from "lucide-react";
import Link from "next/link";
import { inactivateBidding, getBiddingTimeline, type BiddingTimelineData } from "./actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function LicitacaoRowActions({ id }: { id: string }) {
  const [isInactivating, setIsInactivating] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [timeline, setTimeline] = useState<BiddingTimelineData | null>(null);
  const [historyError, setHistoryError] = useState("");

  async function handleInactivate() {
    if (confirm("Tem certeza que deseja inativar esta licitação?")) {
      setIsInactivating(true);
      try {
        const result = await inactivateBidding(id);
        if (!result.success) alert(result.error);
      } finally {
        setIsInactivating(false);
      }
    }
  }

  async function handleOpenHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError("");
    const res = await getBiddingTimeline(id);
    setHistoryLoading(false);
    if (res.success) {
      setTimeline(res.data);
    } else {
      setHistoryError(res.error);
    }
  }

  return (
    <>
      <div className={styles.rowActions}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={handleOpenHistory}
          aria-label="Histórico e linha do tempo do certame"
          title="Histórico / Linha do Tempo"
        >
          <History className="h-4 w-4 text-purple-600" />
        </button>
        <Link href={`/compras/licitacoes/${id}`} className={styles.iconButton} aria-label="Ver detalhes da licitação" title="Ver Detalhes">
          <FileText className="h-4 w-4 text-blue-500" />
        </Link>
        <Link href={`/compras/licitacoes/${id}/editar`} className={styles.iconButton} aria-label="Editar licitação" title="Editar">
          <Edit className="h-4 w-4 text-amber-500" />
        </Link>
        <button type="button" className={styles.iconButton} onClick={handleInactivate} disabled={isInactivating} aria-label="Inativar licitação" title="Inativar">
          <Ban className="h-4 w-4 text-rose-500" />
        </button>
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Linha do Tempo e Histórico do Processo</DialogTitle>
            <DialogDescription>
              {timeline ? `${timeline.bidding.number} · Processo ${timeline.bidding.processNumber}` : "Histórico completo"}
            </DialogDescription>
          </DialogHeader>

          {historyLoading && <p className="text-sm text-slate-500 py-4">Carregando histórico do certame...</p>}
          {historyError && <p className="text-sm text-rose-600 py-4">{historyError}</p>}

          {timeline && (
            <div className="space-y-4 text-xs">
              <div className="rounded border bg-slate-50 p-2.5">
                <p className="font-semibold text-slate-900">{timeline.bidding.modality} · {timeline.bidding.status}</p>
                <p className="text-slate-600 mt-0.5">Objeto: {timeline.bidding.processObject}</p>
                {timeline.bidding.publicationDate && (
                  <p className="text-slate-500 mt-1">Publicação: {new Date(timeline.bidding.publicationDate).toLocaleDateString("pt-BR")}</p>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-slate-800 text-sm mb-2 border-b pb-1">Atos e Fases Registrados</h3>
                {!timeline.acts.length ? (
                  <p className="text-slate-500">Nenhum ato registrado.</p>
                ) : (
                  <ol className="relative border-l border-slate-200 ml-2 space-y-2">
                    {timeline.acts.map((act) => (
                      <li key={act.id} className="ml-4">
                        <div className="absolute -left-1.5 mt-1.5 size-3 rounded-full border border-white bg-purple-600" />
                        <time className="text-[11px] font-normal leading-none text-slate-400">
                          {new Date(act.occurredAt).toLocaleString("pt-BR")}
                        </time>
                        <p className="font-semibold text-slate-800 mt-0.5">{act.type}</p>
                        {act.description && <p className="text-slate-600">{act.description}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-slate-800 text-sm mb-2 border-b pb-1">
                  Participação dos Fornecedores ({timeline.participants.length})
                </h3>
                {!timeline.participants.length ? (
                  <p className="text-slate-500">Nenhum participante inscrito.</p>
                ) : (
                  <div className="space-y-3">
                    {timeline.participants.map((part) => (
                      <div key={part.id} className="rounded border border-slate-200 bg-white p-2.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-slate-900">{part.supplier.name}</span>
                            <span className="ml-2 font-mono text-slate-500">Doc: {part.supplier.document}</span>
                            {part.displayCode && <span className="ml-2 text-slate-400">({part.displayCode})</span>}
                          </div>
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{part.status}</span>
                        </div>

                        {part.eligibilities.length > 0 && (
                          <div className="mt-2 border-t pt-1.5">
                            <span className="font-semibold text-slate-700">Habilitação:</span>
                            {part.eligibilities.map((e) => (
                              <div key={e.id} className="flex gap-2 text-slate-600 mt-0.5">
                                <span>{e.lotNumber ? `Lote ${e.lotNumber}:` : ""}</span>
                                <span className={e.status === "HABILITADO" ? "text-emerald-700 font-semibold" : "text-rose-700 font-semibold"}>
                                  {e.status}
                                </span>
                                {e.reason && <span>- Motivo: {e.reason}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {part.bids.length > 0 && (
                          <div className="mt-2 border-t pt-1.5">
                            <span className="font-semibold text-slate-700">Lances Apresentados ({part.bids.length}):</span>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {part.bids.map((b) => (
                                <span key={b.id} className="rounded bg-slate-50 border px-1.5 py-0.5 text-[11px]">
                                  {b.lotNumber ? `L${b.lotNumber} ` : ""}#{b.sequence}: {money.format(b.totalValue)} ({b.status})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {part.results.length > 0 && (
                          <div className="mt-2 border-t pt-1.5">
                            <span className="font-semibold text-slate-700">Julgamento / Resultado:</span>
                            {part.results.map((r) => (
                              <div key={r.id} className="flex gap-2 text-slate-600 mt-0.5">
                                <span>{r.lotNumber ? `Lote ${r.lotNumber}:` : ""}</span>
                                <span className="font-semibold text-purple-700">{r.status}</span>
                                <span>- Valor: {money.format(r.totalValue)}</span>
                                {r.reason && <span>- Obs: {r.reason}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
