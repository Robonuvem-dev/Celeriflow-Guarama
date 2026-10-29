"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { TaxOperationalTable } from "../TaxOperationalTable";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { registerRedesimEvent } from "../cadastros-fiscais/actions";

type EventRow = { id: string; eventType: string; status: string; evidenceLevel: string; protocol: string | null; externalReference: string | null; taxpayerId: string | null; economicRegistrationId: string | null; receivedAt: string; result: unknown };
type TaxpayerOption = { id: string; name: string; cnpj: string; municipalInsc: string };

export default function RedesimClient({ events, taxpayers }: { events: EventRow[]; taxpayers: TaxpayerOption[] }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const filtered = useMemo(() => events.filter((event) => `${event.eventType} ${event.status} ${event.protocol ?? ""} ${event.externalReference ?? ""}`.toLowerCase().includes(search.toLowerCase())), [events, search]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const result = await registerRedesimEvent({
      eventType: String(form.get("eventType") ?? ""), taxpayerId: String(form.get("taxpayerId") ?? ""), municipalInsc: String(form.get("municipalInsc") ?? ""), primaryCnae: String(form.get("primaryCnae") ?? ""), taxRegime: String(form.get("taxRegime") ?? ""), riskLevel: String(form.get("riskLevel") ?? ""), externalReference: String(form.get("externalReference") ?? ""), protocol: String(form.get("protocol") ?? ""), eventDate: String(form.get("eventDate") ?? ""), serviceActivity: form.get("serviceActivity") === "on",
    });
    if (result.error) return setMessage(result.error);
    setOpen(false);
    setMessage(result.duplicate ? "O evento já havia sido processado; a inscrição existente foi preservada." : "Evento registrado e processado no ambiente interno controlado.");
  }

  return <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
    <TaxOperationalTable resetKey={search} id="redesim" emptyMessage="Nenhum evento encontrado."
      actions={<button onClick={() => setOpen(true)} className="inline-flex h-7 items-center gap-1 rounded bg-amber-500 px-2 text-xs font-bold"><Plus className="size-4" />Registrar evento</button>}
      toolbar={<><input aria-label="Buscar eventos REDESIM" value={search} onChange={event => setSearch(event.target.value)} placeholder="Evento, situação ou referência" className="h-7 min-w-0 flex-1 rounded border px-2 text-[13px]" /><OperationalFilters label="Contexto e resultado"><p>Sem contrato configurado, os eventos permanecem no nível L0 e não representam confirmação oficial da Junta Comercial.</p>{message && <p role="status">{message}</p>}</OperationalFilters></>}
      columns={[["event", "Evento", 110, 170], ["reference", "Referência", 120, 180, "identifier"], ["date", "Data", 95, 105], ["status", "Situação", 140, 190, "status"], ["evidence", "Evidência interna", 100, 130], ["actions", "Cadastro", 110, 110, "actions"]]}
      rows={filtered.map(event => ({ id: event.id, label: event.protocol ?? event.externalReference ?? event.id, values: { event: event.eventType, reference: event.protocol ?? event.externalReference ?? "Referência interna", date: new Date(event.receivedAt).toLocaleDateString("pt-BR"), status: event.status.replaceAll("_", " "), evidence: `${event.evidenceLevel} · interno` }, actions: event.economicRegistrationId ? <Link href={`/tributacao/economico/${event.economicRegistrationId}`} className="text-emerald-700 underline">Abrir inscrição</Link> : null }))} />
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-md bg-white shadow-xl"><div className="sticky top-0 flex justify-between border-b bg-white px-4 py-3"><h2 className="text-sm font-bold">Registrar evento recebido ou preparado</h2><button type="button" onClick={() => setOpen(false)}><X className="size-4" /></button></div><div className="grid gap-3 p-4 sm:grid-cols-2">
      <label className="text-xs font-semibold">Evento<select name="eventType" required className="input mt-1"><option>VIABILIDADE</option><option>FORMALIZACAO</option><option>ABERTURA</option><option>ALTERACAO</option><option>BAIXA</option><option>MEI</option><option>LICENCIAMENTO</option></select></label>
      <label className="text-xs font-semibold">Pessoa jurídica<select name="taxpayerId" required className="input mt-1"><option value="">Selecione</option>{taxpayers.map((taxpayer) => <option key={taxpayer.id} value={taxpayer.id}>{taxpayer.name} · {taxpayer.cnpj}</option>)}</select></label>
      <label className="text-xs font-semibold">Inscrição municipal<input name="municipalInsc" className="input mt-1" /></label>
      <p className="text-xs sm:col-span-2">Para abrir uma nova inscrição a partir de evento recebido, use a <Link href="/tributacao/economico/novo" className="text-emerald-700 underline">inclusão completa de empresa</Link> e selecione a origem REDESIM. O perfil, os tipos de sócios e a conferência de débitos são efetivados na mesma transação do evento.</p>
      <label className="text-xs font-semibold">CNAE principal<input name="primaryCnae" className="input mt-1" /></label>
      <label className="text-xs font-semibold">Regime<select name="taxRegime" className="input mt-1"><option value="">Não alterar</option><option>Simples Nacional</option><option>SIMEI</option><option>Lucro Presumido</option><option>Lucro Real</option></select></label>
      <label className="text-xs font-semibold">Risco da atividade<select name="riskLevel" className="input mt-1"><option value="">Regra não informada</option><option>Baixo</option><option>Médio</option><option>Alto</option></select></label>
      <label className="text-xs font-semibold">Data do evento<input name="eventDate" required type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input mt-1" /></label>
      <label className="text-xs font-semibold">Referência externa recebida<input name="externalReference" className="input mt-1" /></label>
      <label className="text-xs font-semibold sm:col-span-2">Protocolo retornado pela contraparte<input name="protocol" className="input mt-1" /><span className="mt-1 block text-[10px] font-normal text-slate-500">Deixe vazio quando não houver retorno real.</span></label>
      <label className="flex items-center gap-2 text-xs sm:col-span-2"><input name="serviceActivity" type="checkbox" />A atividade é de serviço e deve seguir para validação de habilitação NFS-e</label>
      {message && <p className="text-xs text-rose-700 sm:col-span-2">{message}</p>}
    </div><div className="flex justify-end gap-2 border-t bg-slate-50 px-4 py-3"><button type="button" onClick={() => setOpen(false)} className="h-7 rounded border bg-white px-3 text-xs font-semibold">Cancelar</button><button className="h-7 rounded bg-emerald-700 px-3 text-xs font-semibold text-white">Processar evento</button></div></form></div>}
  </div>;
}
