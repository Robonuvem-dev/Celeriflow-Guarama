"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalContext";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { RecyclingEntry } from "@/lib/environment/recycling-catalog";
import type { RecyclingMovementResult, RecyclingStockPosition } from "@/lib/environment/recycling-stock";

type Props = {
  entries: RecyclingEntry[]; today: string; initialRequestKey: string;
  position?: RecyclingStockPosition;
  recordAction: (form: FormData) => Promise<RecyclingMovementResult>;
};
const fieldClass = "block w-full rounded-md border border-input bg-background p-2 text-sm text-foreground";

export function MovementForm({ entries, today, initialRequestKey, position, recordAction }: Props) {
  const [open, setOpen] = useState(false);
  const { device } = useOperationalWorkspace();
  const formId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [requestKey, setRequestKey] = useState(initialRequestKey);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const feedback = useRef<HTMLParagraphElement>(null);
  const router = useRouter();
  useEffect(() => { if (error || message) feedback.current?.focus(); }, [error, message]);
  const options = (kind: RecyclingEntry["kind"]) => entries.filter(entry => entry.kind === kind && entry.active).map(entry => <option key={entry.code} value={entry.code}>{entry.code} · {entry.name}</option>);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setError(""); setMessage("");
    startTransition(async () => {
      try {
        const result = await recordAction(data);
        if ("error" in result) { setError(result.error); return; }
        setDraft({});
        setRequestKey(crypto.randomUUID());
        formRef.current?.reset();
        setMessage("Movimentação registrada.");
        router.refresh();
      } catch { setError("Não foi possível confirmar a gravação. Tente novamente com os mesmos dados para evitar duplicidade."); }
    });
  }
  const title = position ? "Registrar saída" : "Registrar entrada";
  return <Dialog open={open} onOpenChange={next => { if (!pending) setOpen(next); }}>
    <button ref={trigger} type="button" className={position ? styles.iconButton : styles.newButton} aria-label={title} title={title} onClick={() => setOpen(true)}>
      {position ? <ArrowUpRight aria-hidden="true" /> : <Plus aria-hidden="true" />}<span className={position ? styles.srOnly : styles.newLabel}>{title}</span>
    </button>
    <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{position ? `${position.materialName} · ${position.depotName} · Saldo: ${position.quantity.replace(".", ",")} ${position.unitName}` : "Informe a coleta e o depósito de entrada do material reciclável."}</DialogDescription></DialogHeader>
      <OperationalPagedContent device={device} label={title} footer={<div className={styles.dialogButtons}>
        <button type="button" disabled={pending} className={styles.dialogButton} onClick={() => setOpen(false)}><X />Fechar</button>
        <button type="submit" form={formId} disabled={pending} className={`${styles.dialogButton} ${styles.primaryButton}`}>{pending ? "Registrando…" : title}</button>
      </div>}>
      <form id={formId} ref={formRef} onSubmit={submit} onChange={event => { setDraft(Object.fromEntries(Array.from(new FormData(event.currentTarget), ([key, value]) => [key, String(value)]))); }} className="space-y-3">
    <input type="hidden" name="kind" value={position ? "EXIT" : "ENTRY"} />
    <input type="hidden" name="idempotencyKey" value={requestKey} />
    <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">{position ? `Saída de ${position.materialName} · ${position.depotName}` : "Entrada de material reciclável"}</legend>
      {position ? <><input type="hidden" name="materialCode" value={position.materialCode} /><input type="hidden" name="depotCode" value={position.depotCode} /></> : <>
        <label>Material<select aria-label="Material" name="materialCode" className={fieldClass} required defaultValue={draft.materialCode ?? ""}><option value="" disabled>Selecione</option>{options("materials")}</select></label>
        <label>Depósito<select aria-label="Depósito" name="depotCode" className={fieldClass} required defaultValue={draft.depotCode ?? ""}><option value="" disabled>Selecione</option>{options("depots")}</select></label>
        <label>Tipo de material<select aria-label="Tipo de material" name="typeCode" className={fieldClass} defaultValue={draft.typeCode ?? ""}><option value="">Usar tipo já registrado</option>{options("types")}</select></label>
        <label>Unidade de medida<select aria-label="Unidade de medida" name="unitCode" className={fieldClass} defaultValue={draft.unitCode ?? ""}><option value="">Usar unidade já registrada</option>{options("units")}</select></label>
        <p className="text-sm text-muted-foreground sm:col-span-2">Na primeira entrada, informe tipo e unidade. Essa classificação será mantida para o material em todos os depósitos.</p>
        <label className="sm:col-span-2">Origem da coleta<input name="origin" className={fieldClass} required maxLength={200} defaultValue={draft.origin ?? ""} placeholder="Gerador, local ou referência da coleta" /></label>
      </>}
      <label>Data<input type="date" name="occurredOn" className={fieldClass} required defaultValue={draft.occurredOn ?? today} max={today} /></label>
      <label>Quantidade{position ? ` (${position.unitName})` : ""}<input name="quantity" className={fieldClass} required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,3})?" maxLength={19} defaultValue={draft.quantity ?? ""} title="Quantidade positiva, sem separador de milhares, com até 3 casas decimais." /></label>
      {position && <>
        <label>Centro de reciclagem ou destinação<select aria-label="Centro de reciclagem ou destinação" name="destinationCode" className={fieldClass} required defaultValue={draft.destinationCode ?? ""}><option value="" disabled>Selecione</option>{options("centers")}</select></label>
        <label>Valor total obtido (R$)<input name="amount" className={fieldClass} required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" maxLength={19} defaultValue={draft.amount ?? "0,00"} title="Valor sem separador de milhares, com até 2 casas decimais." /></label>
      </>}
      <label className="sm:col-span-2">Observações<textarea aria-label="Observações" name="notes" className={fieldClass} maxLength={1000} rows={2} defaultValue={draft.notes ?? ""} /></label>
    </fieldset>
    {error && <p ref={feedback} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p>}
    {message && <p ref={feedback} tabIndex={-1} role="status" className="text-sm">{message}</p>}
      </form>
      </OperationalPagedContent>
    </DialogContent>
  </Dialog>;
}
