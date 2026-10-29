"use client";

import Link from "next/link";
import { useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { previewOnlineItbiAction, submitOnlineItbiAction } from "./actions";
import OnlineItbiForms from "./OnlineItbiForms";
import OnlineItbiAttachments from "./OnlineItbiAttachments";
import { OnlineItbiPartyEditor } from "./OnlineItbiPartyEditor";
import { itbiPartiesError, itbiPartiesPayload, onlineItbiSubmissionFields, type ItbiPartyDraft } from "./party-drafts";

type Property = NonNullable<Awaited<ReturnType<typeof previewOnlineItbiAction>>["property"]>;

export default function OnlineItbiClient({ notaries }: { notaries: { id: string; label: string }[] }) {
  const router = useRouter();
  const [notaryId, setNotaryId] = useState("");
  const [property, setProperty] = useState<Property | null>(null);
  // Arrays belong to the parent; panels may unmount their controlled inputs.
  const [sellers, setSellers] = useState<ItbiPartyDraft[]>([{ draftId: "seller-initial", document: "", sharePercent: 100 }]);
  const [buyers, setBuyers] = useState<ItbiPartyDraft[]>([{ draftId: "buyer-initial", document: "", sharePercent: 100 }]);
  const [requestKey, setRequestKey] = useState("");
  const [contest, setContest] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const [attachments, setAttachments] = useState<{ requestKey: string; documentId: string; filename: string }[]>([]);
  const field = "mt-1 w-full rounded border p-2 text-sm";
  const partyEditor = (title: string, rows: ItbiPartyDraft[], update: Dispatch<SetStateAction<ItbiPartyDraft[]>>) => <OnlineItbiPartyEditor title={title} rows={rows} update={update} pending={pending} />;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!property || pending) return;
    const partyError = itbiPartiesError(sellers, "Transmitentes") || itbiPartiesError(buyers, "Adquirentes");
    if (partyError) { setNotice(partyError); return; }
    const form = new FormData(event.currentTarget);
    const forms = property.forms.map((definition) => ({ catalogId: definition.id, expectedVersion: definition.version, values: Object.fromEntries(definition.fields.map((input) => {
      const value = String(form.get(`additional.${definition.id}.${input.key}`) ?? "");
      return [input.key, input.type === "BOOLEAN" ? value === "" ? null : value === "true" : value];
    })) }));
    const input = { ...onlineItbiSubmissionFields(form, sellers, buyers), requestKey, notaryId, expectedPolicyVersion: property.policyVersion, propertyId: property.id, expectedPropertyUpdatedAt: property.updatedAt, requestContestation: contest, forms, attachmentIds: attachments.filter((row) => row.requestKey === requestKey).map((row) => row.documentId) };
    startTransition(async () => {
      try {
        const result = await submitOnlineItbiAction(input);
        if ("error" in result) { setNotice(result.error); return; }
        router.push(`/portal/tributario/itbi?id=${encodeURIComponent(result.declarationId)}`);
      } catch { setNotice("Não foi possível protocolar a declaração. Os dados preenchidos foram preservados para nova tentativa."); }
    });
  }

  return <main className="mx-auto max-w-5xl space-y-4 p-6">
    <Link href="/portal/tributario/itbi" className="text-emerald-700 underline">Meus processos ITBI</Link><h1 className="text-2xl font-bold">Incluir declaração de ITBI on-line</h1>
    {notice && <p role="status" className="rounded border bg-amber-50 p-3">{notice}</p>}{!notaries.length && <p>Sua conta precisa estar vinculada a um tabelionato autorizado pela municipalidade.</p>}
    <form onChange={() => setProperty(null)} action={(form) => startTransition(async () => { const result = await previewOnlineItbiAction({ notaryId, inscription: String(form.get("inscription") ?? "") }); setNotice(result.error ?? "Cadastro localizado."); setProperty(result.property ?? null); if (result.property) setRequestKey(crypto.randomUUID()); })} className="grid gap-3 rounded border bg-white p-4 sm:grid-cols-3">
      <label className="text-sm">Tabelionato<select value={notaryId} onChange={(event) => setNotaryId(event.target.value)} required className={field}><option value="">Selecione</option>{notaries.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
      <label className="text-sm">Inscrição imobiliária<input name="inscription" required className={field} /></label><button disabled={pending} className="self-end rounded border p-2 text-sm">Consultar imóvel</button>
    </form>
    {property && <>
      <section className="rounded border bg-white p-4"><h2 className="font-semibold">Imóvel {property.inscription}</h2><p>{property.address}</p><p>Terreno: {property.landArea ?? "—"} m² · Área edificada: {property.builtArea ?? "—"} m²</p>{property.latitude !== null && property.longitude !== null && <a href={`https://www.openstreetmap.org/?mlat=${property.latitude}&mlon=${property.longitude}#map=18/${property.latitude}/${property.longitude}`} target="_blank" rel="noreferrer" className="text-emerald-700 underline">Abrir localização no mapa</a>}<p className="mt-2 text-sm">Liberação: {property.releaseMode === "AUTOMATIC" ? "Automática conforme configuração municipal" : "Mediante análise municipal"}.</p></section>
      <form onSubmit={submit} className="space-y-4 rounded border bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">Modalidade<select name="type" required className={field}><option value="">Selecione</option>{property.types.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.rate}%</option>)}</select></label><label className="text-sm">Valor declarado do imóvel (R$)<input name="value" type="number" min="0.01" step="0.01" required className={field} /></label><label className="text-sm">Fração transmitida (%)<input name="fraction" type="number" min="0.000001" max="100" step="0.000001" defaultValue="100" required className={field} /></label></div>
        <input type="hidden" name="sellers" value={JSON.stringify(itbiPartiesPayload(sellers))} />
        <input type="hidden" name="buyers" value={JSON.stringify(itbiPartiesPayload(buyers))} />
        {partyEditor("Transmitentes — total de 100% da fração", sellers, setSellers)}
        {partyEditor("Adquirentes — total de 100% da fração", buyers, setBuyers)}
        <label className="block text-sm">CPF/CNPJ do devedor, entre as partes<input name="debtor" required className={field} /></label>
        <label className="block text-sm">Descrição da transmissão<textarea name="description" required maxLength={4000} className={field} /></label>
        <OnlineItbiForms forms={property.forms} />
        <OnlineItbiAttachments notaryId={notaryId} requestKey={requestKey} propertyId={property.id} attachments={attachments.filter((row) => row.requestKey === requestKey)} pending={pending} onAdd={(attachment) => setAttachments((rows) => [...rows.filter((row) => row.documentId !== attachment.documentId), { ...attachment, requestKey }])} onRemove={(id) => setAttachments((rows) => rows.filter((row) => row.documentId !== id))} onUpload={(work) => startTransition(async () => { try { await work(); setNotice("Documento preparado para o protocolo."); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível enviar o anexo."); } })} />
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={contest} onChange={(event) => setContest(event.target.checked)} />Solicitar impugnação quando a avaliação municipal superar o valor declarado</label>
        {contest && <><label className="block text-sm">Justificativa da impugnação<textarea name="contestation" required maxLength={8000} className={field} /></label><p className="text-sm">Inclua ao menos um documento comprobatório acima. A impugnação e seus anexos serão protocolados juntos para análise fiscal.</p></>}
        <button disabled={pending} className="rounded bg-emerald-700 p-3 text-white">Protocolar declaração de ITBI</button>
      </form>
    </>}
  </main>;
}
