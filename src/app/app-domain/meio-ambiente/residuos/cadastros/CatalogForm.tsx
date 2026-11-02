"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalContext";
import styles from "@/components/app-ui/operational/operational.module.css";
import { recyclingCatalogs, type RecyclingEntry, type RecyclingCatalogSaveResult } from "@/lib/environment/recycling-catalog";

type Props = { kind: RecyclingEntry["kind"]; entry?: RecyclingEntry; saveAction: (form: FormData) => Promise<RecyclingCatalogSaveResult> };
const fieldClass = "block w-full rounded-md border border-input bg-background p-2 text-sm text-foreground";
export function CatalogForm({ kind, entry, saveAction }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => ({ code: entry?.code ?? "", name: entry?.name ?? "", description: entry?.description ?? "", address: entry?.address ?? "", active: entry?.active ?? true }));
  const [reset, setReset] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const { device } = useOperationalWorkspace();
  const router = useRouter();
  const formId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error || message) feedback.current?.focus(); }, [error, message]);
  const title = entry ? "Editar cadastro" : "Novo cadastro";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setError(""); setMessage("");
    startTransition(async () => {
      try {
        const result = await saveAction(data);
        if ("error" in result) { setError(result.error); return; }
        if (!entry) { setDraft({ code: "", name: "", description: "", address: "", active: true }); setReset(value => value + 1); }
        setMessage("Cadastro salvo.");
        router.refresh();
      } catch { setError("Não foi possível confirmar a gravação. Confira o catálogo antes de tentar novamente com o mesmo código."); }
    });
  }
  return <Dialog open={open} onOpenChange={next => { if (!pending) setOpen(next); }}>
    <button ref={trigger} type="button" className={entry ? styles.iconButton : styles.newButton} title={title} aria-label={entry ? `Editar cadastro ${entry.code}` : title} onClick={() => setOpen(true)}>
      {entry ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}<span className={entry ? styles.srOnly : styles.newLabel}>{title}</span>
    </button>
    <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{recyclingCatalogs[kind]}{entry ? ` · ${entry.code}` : ""}</DialogDescription></DialogHeader>
      <OperationalPagedContent device={device} label={title} footer={<div className={styles.dialogButtons}>
        <button type="button" disabled={pending} className={styles.dialogButton} onClick={() => setOpen(false)}><X />Fechar</button>
        <button type="submit" form={formId} disabled={pending} className={`${styles.dialogButton} ${styles.primaryButton}`}>{pending ? "Salvando…" : "Salvar cadastro"}</button>
      </div>}>
        <form key={reset} id={formId} onSubmit={submit} className="space-y-3" onChange={event => {
          const data = new FormData(event.currentTarget);
          setDraft({ code: String(data.get("code") ?? ""), name: String(data.get("name") ?? ""), description: String(data.get("description") ?? ""), address: String(data.get("address") ?? ""), active: data.get("active") === "on" });
        }}>
          <input type="hidden" name="kind" value={kind} /><input type="hidden" name="mode" value={entry ? "update" : "create"} />
          <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">{title}</legend>
            <label>Código<input aria-label="Código" className={fieldClass} required name="code" maxLength={40} readOnly={!!entry} defaultValue={draft.code} /></label>
            <label>Nome<input aria-label="Nome" className={fieldClass} required name="name" minLength={2} maxLength={160} defaultValue={draft.name} /></label>
            <label className="sm:col-span-2">Descrição<textarea aria-label="Descrição" className={fieldClass} name="description" maxLength={2000} rows={3} defaultValue={draft.description} /></label>
            {(kind === "centers" || kind === "depots") ? <label className="sm:col-span-2">Endereço<input aria-label="Endereço" className={fieldClass} name="address" maxLength={500} defaultValue={draft.address} /></label> : <input type="hidden" name="address" value={draft.address} />}
            <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={draft.active} /> Ativo</label>
          </fieldset>
          {error && <p ref={feedback} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p>}
          {message && <p ref={feedback} tabIndex={-1} role="status" className="text-sm">{message}</p>}
        </form>
      </OperationalPagedContent>
    </DialogContent>
  </Dialog>;
}
