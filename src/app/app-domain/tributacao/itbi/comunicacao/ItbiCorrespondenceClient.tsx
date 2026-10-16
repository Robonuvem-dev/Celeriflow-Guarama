"use client";

import { useState, useTransition } from "react";
import { configureItbiCorrespondenceAction } from "./actions";
import type { z } from "zod";
import type { propertyAddressSchema } from "@/lib/tributacao/property-profile-schema";

export default function ItbiCorrespondenceClient(props: { declarationId: string; updatedAt: string; buyers: { id: string; name: string }[]; initial: { enabled: boolean; buyerId: string; address: z.infer<typeof propertyAddressSchema> | null } }) {
  const [enabled, setEnabled] = useState(props.initial.enabled); const [notice, setNotice] = useState(""); const [pending, startTransition] = useTransition();
  const field = "mt-1 w-full rounded border p-2 text-xs";
  return <details className="rounded border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">Endereço de correspondência após a transmissão</summary>{notice && <p role="status" className="mt-2 text-sm">{notice}</p>}<form action={form => startTransition(async () => {
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const result = await configureItbiCorrespondenceAction({ declarationId: props.declarationId, expectedUpdatedAt: props.updatedAt, updateAddress: enabled, buyerTaxpayerId: enabled ? text("buyer") : null, address: enabled ? { street: text("street"), number: text("number"), complement: text("complement"), neighborhood: text("neighborhood"), city: text("city"), state: text("state").toUpperCase(), zipCode: text("zipCode") } : null, reason: text("reason") });
    setNotice(result.error ?? "Opção registrada. A correspondência será atualizada junto com a transmissão fiscal após o pagamento integral.");
  })} className="mt-3 grid gap-3 sm:grid-cols-3"><label className="flex gap-2 text-xs sm:col-span-3"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)}/>Atualizar o endereço de correspondência para o adquirente</label>{enabled && <><label className="text-xs">Adquirente<select name="buyer" defaultValue={props.initial.buyerId} required className={field}><option value="">Selecione</option>{props.buyers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{([ ["street", "Logradouro"], ["number", "Número"], ["complement", "Complemento"], ["neighborhood", "Bairro"], ["city", "Município"], ["state", "UF"], ["zipCode", "CEP"] ] as const).map(([key, label]) => <label key={key} className="text-xs">{label}<input name={key} defaultValue={props.initial.address?.[key]} required={["street", "city", "state"].includes(key)} maxLength={key === "state" ? 2 : 240} className={field}/></label>)}</>}<label className="text-xs sm:col-span-3">Fundamento<textarea name="reason" required className={field}/></label><button disabled={pending} className="rounded border p-2 text-xs">Salvar opção de correspondência</button></form></details>;
}
