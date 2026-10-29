"use client";

import { useState, useTransition } from "react";
import { publishAccountantAction } from "./actions";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { TaxOperationalTable } from "../../TaxOperationalTable";

export default function AccountantsClient(props: { taxpayers: { id: string; label: string }[]; entries: { id: string; taxpayerId: string; version: number; crc: string; reason: string; date: string; actorId: string | null }[] }) {
  const [taxpayerId, setTaxpayerId] = useState("");
  const [notice, setNotice] = useState(""); const [pending, startTransition] = useTransition();
  const entries = props.entries.filter(entry => entry.taxpayerId === taxpayerId); const latest = entries[0];
  const field = "mt-1 w-full rounded border p-2 text-sm";
  return <TaxOperationalTable id="contadores" resetKey={taxpayerId}
    toolbar={<><label className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">Contribuinte<select value={taxpayerId} onChange={event => setTaxpayerId(event.target.value)} className="h-7 min-w-0 flex-1 rounded border"><option value="">Selecione</option>{props.taxpayers.map(taxpayer => <option key={taxpayer.id} value={taxpayer.id}>{taxpayer.label}</option>)}</select></label><OperationalFilters label="Publicar CRC / contexto"><p>As correções de CRC preservam as versões anteriores e os perfis econômicos já registrados. Nos novos perfis, informe o CRC vigente.</p>{notice && <p role="status">{notice}</p>}{taxpayerId && <form key={`${taxpayerId}:${latest?.version ?? 0}`} action={form => startTransition(async () => { const result = await publishAccountantAction({ taxpayerId, crc: String(form.get("crc")), expectedVersion: latest?.version ?? 0, reason: String(form.get("reason")) }); setNotice(result.error ?? "Versão do contador publicada."); })} className="space-y-3"><label className="block">CRC<input name="crc" required maxLength={80} defaultValue={latest?.crc} className={field} /></label><label className="block">Fundamento da inclusão ou correção<textarea name="reason" required className={field} /></label><button disabled={pending} className="rounded border p-2">Publicar versão {(latest?.version ?? 0) + 1}</button></form>}</OperationalFilters></>}
    columns={[["version", "Versão", 65, 80], ["crc", "CRC", 110, 150, "identifier"], ["date", "Data", 155, 180], ["actor", "Usuário", 130, 170], ["reason", "Fundamento", 170, 330]]}
    rows={entries.map(entry => ({ id: entry.id, label: `${entry.crc} · versão ${entry.version}`, values: { version: String(entry.version), crc: entry.crc, date: new Date(entry.date).toLocaleString("pt-BR"), actor: entry.actorId ?? "—", reason: entry.reason } }))} />;
}
