"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { saveChamberMinutes, saveChamberSession } from "./actions";
import styles from "@/components/app-ui/operational/operational.module.css";

export type SessionDraft = { id?: string; updatedAt?: string; numero: string; tipo: string; data: string; local: string; status: string; quorum: string; legislaturaId: string };
export type MinutesDraft = { id: string; updatedAt: string; numero: string; conteudo: string; status: string };

export function SessionEditor({ initial, legislatures, open, onOpenChange }: { initial: SessionDraft; legislatures: { id: string; numero: number }[]; open: boolean; onOpenChange: (value: boolean) => void }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const field = (key: keyof SessionDraft, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={styles.dialog}>
    <DialogHeader><DialogTitle>{initial.id ? "Gerenciar sessão" : "Nova sessão"}</DialogTitle><DialogDescription>Dados da sessão plenária. Horários de Brasília.</DialogDescription></DialogHeader>
    <form className="grid gap-3" onSubmit={event => { event.preventDefault(); setError(""); startTransition(async () => { try { const result = await saveChamberSession(draft); if (result.error) setError(result.error); else { onOpenChange(false); router.refresh(); } } catch { setError("Não foi possível salvar. Confira sua sessão de acesso e tente novamente."); } }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>Número<input aria-label="Número da sessão" type="number" min="1" required className={styles.searchInput} value={draft.numero} onChange={event => field("numero", event.target.value)} /></label>
        <label>Tipo<input aria-label="Tipo da sessão" required className={styles.searchInput} value={draft.tipo} onChange={event => field("tipo", event.target.value)} /></label>
        <label>Data e hora<input aria-label="Data e hora da sessão" type="datetime-local" required className={styles.searchInput} value={draft.data} onChange={event => field("data", event.target.value)} /></label>
        <label>Local<input aria-label="Local da sessão" required className={styles.searchInput} value={draft.local} onChange={event => field("local", event.target.value)} /></label>
        <label>Legislatura<select aria-label="Legislatura da sessão" required className={styles.searchInput} value={draft.legislaturaId} onChange={event => field("legislaturaId", event.target.value)}><option value="">Selecione</option>{legislatures.map(row => <option key={row.id} value={row.id}>{row.numero}ª legislatura</option>)}</select></label>
        <label>Quórum<input aria-label="Quórum da sessão" type="number" min="0" className={styles.searchInput} value={draft.quorum} onChange={event => field("quorum", event.target.value)} /></label>
        <label>Situação<select aria-label="Situação da sessão" className={styles.searchInput} value={draft.status} onChange={event => field("status", event.target.value)}>{[...new Set([draft.status, "Agendada", "Em Preparação", "Em Andamento", "Realizada", "Encerrada", "Cancelada"])].map(status => <option key={status}>{status}</option>)}</select></label>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2"><button type="button" className={styles.filterButton} onClick={() => onOpenChange(false)}>Fechar</button><button type="submit" disabled={pending} className={styles.newButton}>{pending ? "Salvando…" : "Salvar sessão"}</button></div>
    </form>
  </DialogContent></Dialog>;
}

export function MinutesEditor({ initial, readOnly, open, onOpenChange }: { initial: MinutesDraft; readOnly: boolean; open: boolean; onOpenChange: (value: boolean) => void }) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className={styles.dialog}>
    <DialogHeader><DialogTitle>{readOnly ? "Visualizar ata" : "Editar ata"}</DialogTitle><DialogDescription>{initial.status} · Texto integral da ata da sessão</DialogDescription></DialogHeader>
    <form className="grid gap-3" onSubmit={event => { event.preventDefault(); if (readOnly) return; setError(""); startTransition(async () => { try { const result = await saveChamberMinutes(draft); if (result.error) setError(result.error); else { onOpenChange(false); router.refresh(); } } catch { setError("Não foi possível salvar. Confira sua sessão de acesso e tente novamente."); } }); }}>
      <label>Número<input aria-label="Número da ata" required readOnly={readOnly} className={styles.searchInput} value={draft.numero} onChange={event => setDraft(previous => ({ ...previous, numero: event.target.value }))} /></label>
      <label>Conteúdo<textarea aria-label="Conteúdo da ata" required readOnly={readOnly} rows={8} className="w-full rounded border border-slate-300 p-2 text-sm" value={draft.conteudo} onChange={event => setDraft(previous => ({ ...previous, conteudo: event.target.value }))} /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2"><button type="button" className={styles.filterButton} onClick={() => onOpenChange(false)}>Fechar</button>{!readOnly && <button type="submit" disabled={pending} className={styles.newButton}>{pending ? "Salvando…" : "Salvar ata"}</button>}</div>
    </form>
  </DialogContent></Dialog>;
}
