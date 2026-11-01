"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { RecyclingEntry } from "@/lib/environment/recycling-catalog";
import type { RecyclingMovementResult, RecyclingStockPosition } from "@/lib/environment/recycling-stock";

type Props = {
  entries: RecyclingEntry[]; today: string; initialRequestKey: string;
  position?: RecyclingStockPosition;
  recordAction: (form: FormData) => Promise<RecyclingMovementResult>;
};
const fieldClass = "block w-full rounded border p-2";

export function MovementForm({ entries, today, initialRequestKey, position, recordAction }: Props) {
  const [requestKey, setRequestKey] = useState(initialRequestKey);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
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
        setRequestKey(crypto.randomUUID());
        formRef.current?.reset();
        setMessage("Movimentação registrada.");
        router.refresh();
      } catch { setError("Não foi possível confirmar a gravação. Tente novamente com os mesmos dados para evitar duplicidade."); }
    });
  }
  return <form ref={formRef} onSubmit={submit} className="space-y-3 rounded border p-4">
    <input type="hidden" name="kind" value={position ? "EXIT" : "ENTRY"} />
    <input type="hidden" name="idempotencyKey" value={requestKey} />
    <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-3 font-semibold">{position ? `Saída de ${position.materialName} · ${position.depotName}` : "Entrada de material reciclável"}</legend>
      {position ? <><input type="hidden" name="materialCode" value={position.materialCode} /><input type="hidden" name="depotCode" value={position.depotCode} /></> : <>
        <label>Material<select name="materialCode" className={fieldClass} required defaultValue=""><option value="" disabled>Selecione</option>{options("materials")}</select></label>
        <label>Depósito<select name="depotCode" className={fieldClass} required defaultValue=""><option value="" disabled>Selecione</option>{options("depots")}</select></label>
        <label>Tipo de material<select name="typeCode" className={fieldClass} defaultValue=""><option value="">Usar tipo já registrado</option>{options("types")}</select></label>
        <label>Unidade de medida<select name="unitCode" className={fieldClass} defaultValue=""><option value="">Usar unidade já registrada</option>{options("units")}</select></label>
        <p className="text-sm text-muted-foreground sm:col-span-2">Na primeira entrada, informe tipo e unidade. Essa classificação será mantida para o material em todos os depósitos.</p>
        <label className="sm:col-span-2">Origem da coleta<input name="origin" className={fieldClass} required maxLength={200} placeholder="Gerador, local ou referência da coleta" /></label>
      </>}
      <label>Data<input type="date" name="occurredOn" className={fieldClass} required defaultValue={today} max={today} /></label>
      <label>Quantidade{position ? ` (${position.unitName})` : ""}<input name="quantity" className={fieldClass} required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,3})?" maxLength={19} title="Quantidade positiva, sem separador de milhares, com até 3 casas decimais." /></label>
      {position && <>
        <label>Centro de reciclagem ou destinação<select name="destinationCode" className={fieldClass} required defaultValue=""><option value="" disabled>Selecione</option>{options("centers")}</select></label>
        <label>Valor total obtido (R$)<input name="amount" className={fieldClass} required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,2})?" maxLength={19} defaultValue="0,00" title="Valor sem separador de milhares, com até 2 casas decimais." /></label>
      </>}
      <label className="sm:col-span-2">Observações<textarea name="notes" className={fieldClass} maxLength={1000} rows={2} /></label>
      <button type="submit" className="rounded bg-emerald-800 px-4 py-2 text-white disabled:opacity-60 sm:col-span-2">{pending ? "Registrando…" : position ? "Registrar saída" : "Registrar entrada"}</button>
    </fieldset>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
  </form>;
}
