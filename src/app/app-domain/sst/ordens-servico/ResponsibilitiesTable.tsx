"use client";

import { useState } from "react";
import { OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { usePanelPage, type PanelPage, type PanelReply } from "../_components/usePanelPage";
import { SstTablePanel } from "../_components/SstTablePanel";
import { sstColumn } from "../_components/operational-columns";
import { SstForm } from "../SstForm";
import { revokeTechnicalRecord } from "./actions";

type Responsibility = { id: string; person: string; kind: string; revoked: boolean; startsAt: string; endsAt: string };

export function ResponsibilitiesTable({ initial, loadPageAction, canRevoke }: { initial: PanelPage<Responsibility>; loadPageAction: (page: number) => Promise<PanelReply<Responsibility>>; canRevoke: boolean }) {
  const [selected, setSelected] = useState<Responsibility | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const { data, pending, error, changePage, retry } = usePanelPage(initial, loadPageAction);
  async function revoke(form: FormData) {
    const result = await revokeTechnicalRecord(form);
    if (!result.error) { await changePage(data.page); setSelected(null); }
    return result;
  }
  return <section className="space-y-3">
    <SstTablePanel title="Responsabilidades técnicas" triggerLabel="Consultar responsabilidades em tela cheia" description="Selecione uma responsabilidade e feche a consulta para revogar. A justificativa permanece no pai ao paginar e fechar." preferenceId="sst-responsabilidades"
      columns={[sstColumn("person", "Responsável", 260, 140), sstColumn("kind", "Tipo", 160, 100), sstColumn("startsAt", "Início", 190, 130), sstColumn("endsAt", "Fim exclusivo", 190, 130), sstColumn("status", "Situação", 120, 90, "status"), sstColumn("actions", "Revogação", 100, 90, "actions")]}
      rows={data.rows.map(record => ({ id: record.id, label: record.person, values: { person: record.person, kind: record.kind, startsAt: record.startsAt, endsAt: record.endsAt, status: record.revoked ? "Revogada" : "Registrada" }, actions: !record.revoked && canRevoke ? <button type="button" onClick={() => setSelected(record)} aria-pressed={selected?.id === record.id}>Selecionar</button> : undefined }))}
      toolbar={error && <><span role="alert">{error}</span><button type="button" onClick={retry}>Tentar novamente</button></>}
      pagination={<OperationalPagination page={data.page} total={data.total} pending={pending} onPageChange={page => void changePage(page)} />} />
    {selected && <section className="rounded border p-3"><h2 className="font-semibold">Revogar responsabilidade de {selected.person}</h2><p>{selected.kind} · {selected.startsAt} — {selected.endsAt}</p><SstForm key={selected.id} action={revoke} label="Revogar responsabilidade"><input type="hidden" name="id" value={selected.id} /><input type="hidden" name="kind" value="RESPONSIBILITY" /><label>Justificativa<input name="reason" required minLength={10} value={reasons[selected.id] || ""} onChange={event => setReasons(current => ({ ...current, [selected.id]: event.target.value }))} className="block w-full rounded border p-2" /></label></SstForm></section>}
  </section>;
}
