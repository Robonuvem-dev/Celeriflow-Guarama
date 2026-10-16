"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishFeeVersionAction, recordAdditionalFeeEventAction, retryFeeEventAction } from "./actions";
import type { CemeteryFeeSourceType } from "@/lib/cemeteries/fees-service";

const control = "block w-full rounded border p-2 mt-1 bg-background";

export function FeeRuleForm({ taxes, cemeteries }: { taxes: { id: string; name: string }[]; cemeteries: { id: string; name: string }[] }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <form className="grid gap-4 rounded border p-4 md:grid-cols-2" onSubmit={(event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    startTransition(async () => {
      const result = await publishFeeVersionAction(data);
      setMessage(result.error ?? "Nova versão publicada. A versão anterior e os cálculos já registrados foram preservados.");
      if (!result.error) { form.reset(); router.refresh(); }
    });
  }}>
    <label>Cemitério<select name="cemeteryId" className={control}><option value="">Todos (regra geral)</option>{cemeteries.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    <label>Evento<input name="eventType" list="cemetery-fee-event-types" className={control} required placeholder="ACQUISICAO_LOTE" pattern="[A-Za-z][A-Za-z0-9_]{2,79}" /><datalist id="cemetery-fee-event-types">{["ACQUISICAO_LOTE", "SEPULTAMENTO", "CREMACAO", "VELORIO", "EXUMACAO", "OUTRO_LOTE", "OSSUARIO", "MUDANCA_CIDADE", "MUDANCA_CEMITERIO", "DESAPROPRIACAO", "CONCESSAO", "OUTRO"].map((event) => <option key={event} value={event} />)}</datalist></label>
    <label>Descrição<input name="label" className={control} required minLength={3} maxLength={200} /></label>
    <label>Tributo central<select name="taxId" required className={control}><option value="">Selecione uma taxa ativa</option>{taxes.map((tax) => <option key={tax.id} value={tax.id}>{tax.name}</option>)}</select></label>
    <label>Fórmula<select name="formula" className={control}><option value="VALOR_FIXO">Valor fixo</option><option value="BASE_X_QUANTIDADE">Valor-base × quantidade</option></select></label>
    <label>Valor-base (R$)<input name="baseAmount" className={control} required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" placeholder="100.00" /></label>
    <label>Início da vigência<input type="date" name="validFrom" required className={control} /></label>
    <label>Fim da vigência (opcional)<input type="date" name="validUntil" className={control} /></label>
    <label>Prazo de vencimento (dias após evento)<input type="number" name="dueDays" required min={0} max={365} defaultValue={30} className={control} /></label>
    <label>Fundamento legal<textarea name="legalBasis" required minLength={3} maxLength={4000} className={control} /></label>
    <p className="text-sm text-muted-foreground md:col-span-2">A última versão publicada vigente prevalece. Regra específica do cemitério tem prioridade sobre a geral. O exercício tributário acompanha o ano do vencimento. Fórmulas são opções fechadas, sem execução de código.</p>
    <button type="submit" disabled={pending} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{pending ? "Publicando…" : "Publicar nova versão"}</button>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}

export function RetryFeeButton({ eventKey }: { eventKey: string }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <div><button className="rounded border px-3 py-1 disabled:opacity-50" disabled={pending} onClick={() => startTransition(async () => {
    const result = await retryFeeEventAction(eventKey);
    setMessage(result.error ?? "Guia emitida ou emissão já existente recuperada.");
    router.refresh();
  })}>{pending ? "Emitindo…" : "Reprocessar"}</button><p role="status" className="text-sm">{message}</p></div>;
}

export function AdditionalFeeEventForm() {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <form className="grid gap-3 rounded border p-4 md:grid-cols-4" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await recordAdditionalFeeEventAction({ eventType: String(data.get("eventType")), sourceType: String(data.get("sourceType")) as CemeteryFeeSourceType, sourceId: String(data.get("sourceId")), quantity: String(data.get("quantity")) });
      setMessage(result.error ?? "Evento registrado. Consulte seu estado no ledger abaixo.");
      router.refresh();
    });
  }}>
    <label>Evento<input className={control} name="eventType" required list="cemetery-fee-event-types" /></label>
    <label>Origem<select className={control} name="sourceType"><option value="MOVIMENTO">Movimentação</option><option value="CONCESSAO">Concessão</option><option value="PROCESSO">Processo realizado</option><option value="LOTE">Aquisição de lote</option></select></label>
    <label>ID do registro de origem<input className={control} name="sourceId" required /></label>
    <label>Quantidade<input className={control} name="quantity" required defaultValue="1" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,4})?" /></label>
    <p className="text-sm text-muted-foreground md:col-span-4">Eventos adicionais usam registros reais. Contribuinte, cemitério e data são obtidos da origem. A mesma origem/evento só pode gerar uma cobrança.</p>
    <button type="submit" disabled={pending} className="rounded border px-4 py-2 disabled:opacity-50">Registrar evento</button><p role="status" className="md:col-span-3">{message}</p>
  </form>;
}
