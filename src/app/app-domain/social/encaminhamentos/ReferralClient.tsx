"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { SocialOperationalList } from "../OperationalList";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { registerSocialReferral, returnSocialReferral, saveSocialNetworkOrganization } from "./actions";

type Option = { id: string; name: string };
type Organization = Option & { taxId: string; organizationType: string; address: string; phone: string; email: string; usesCounterReference: boolean; isActive: boolean };
type Row = { id: string; subject: string; unit: string; destination: string; date: string; status: string; objective: string; observations: string; referenceProfessional: string; counterReferenceAt: string; counterReferenceProfessional: string; counterReferenceDescription: string; canReturn: boolean };
type Props = { rows: Row[]; organizations: Organization[]; units: Option[]; people: Option[]; families: Option[]; catalogs: (Option & { kind: string })[] };
const field = "h-7 w-full min-w-0 rounded border bg-white px-2 text-sm dark:bg-slate-900";
const organizationDefault = { id: undefined as string | undefined, name: "", taxId: "", organizationType: "", address: "", phone: "", email: "", usesCounterReference: true, isActive: true };

export default function ReferralClient({ rows, organizations, units, people, families, catalogs }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("referrals");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"referral" | "organization" | "return" | "detail" | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [organization, setOrganization] = useState(organizationDefault);
  const [unitId, setUnitId] = useState(units[0]?.id || "");
  const [subjectType, setSubjectType] = useState("person");
  const [subjectId, setSubjectId] = useState("");
  const [destination, setDestination] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [priorityId, setPriorityId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [professional, setProfessional] = useState("");
  const [description, setDescription] = useState("");
  const [observations, setObservations] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const term = search.toLocaleLowerCase("pt-BR");
  const filteredRows = rows.filter((item) => `${item.subject} ${item.destination} ${item.unit}`.toLocaleLowerCase("pt-BR").includes(term));
  const filteredOrganizations = organizations.filter((item) => `${item.name} ${item.organizationType}`.toLocaleLowerCase("pt-BR").includes(term));
  const total = tab === "referrals" ? filteredRows.length : filteredOrganizations.length;
  const activePage = Math.min(page, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const start = (activePage - 1) * OPERATIONAL_PAGE_SIZE;
  function open(type: typeof modal, row?: Row) { setModal(type); setSelected(row || null); setError(""); setDescription(""); setProfessional(""); setObservations(""); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const result = modal === "organization" ? await saveSocialNetworkOrganization(organization)
        : modal === "return" ? await returnSocialReferral({ id: selected?.id, attendedAt: date, professional, description })
          : await registerSocialReferral({ unitId, personId: subjectType === "person" ? subjectId : "", familyId: subjectType === "family" ? subjectId : "", destinationOrganizationId: destination, reasonId, priorityTypeId: priorityId, referredAt: date, referenceProfessional: professional, objective: description, observations });
      if (result.error) { setError(result.error); return; }
      setModal(null); router.refresh();
    } catch { setError("Falha de comunicação. Tente novamente."); } finally { setPending(false); }
  }
  return <PageFrame className="flex h-full min-h-0 flex-col gap-1"><PageHeader title="Encaminhamentos e rede intersetorial" icon={<Send className="size-4" />} action={<button onClick={() => { if (tab === "organizations") setOrganization(organizationDefault); open(tab === "referrals" ? "referral" : "organization"); }} className="rounded bg-blue-600 px-3 py-1 text-xs text-white">{tab === "referrals" ? "Novo encaminhamento" : "Novo órgão"}</button>} />
    <SocialOperationalList id={`encaminhamentos-${tab}`} page={activePage} total={total} onPageChange={setPage}
      toolbar={<div className="flex w-full gap-2"><select aria-label="Visão" className={field} value={tab} onChange={(event) => { setTab(event.target.value); setPage(1); setSearch(""); }}><option value="referrals">Encaminhamentos</option><option value="organizations">Rede intersetorial</option></select><input aria-label="Buscar registros" type="search" className={field} placeholder="Buscar pessoa, família, equipamento ou órgão..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>}
      columns={[["subject", tab === "referrals" ? "Pessoa / família" : "Órgão", 220, 120, "identifier"], ["destination", tab === "referrals" ? "Destino" : "Tipo", 220, 110], ["unit", tab === "referrals" ? "Equipamento" : "Telefone", 180, 100], ["status", "Situação", 110, 90, "status"], ["actions", "Ação", 150, 150, "actions"]]}
      rows={tab === "referrals" ? filteredRows.slice(start, start + OPERATIONAL_PAGE_SIZE).map((item) => ({ id: item.id, label: item.subject, values: { subject: item.subject, destination: item.destination, unit: item.unit, status: item.status === "OPEN" ? "Em aberto" : "Retornado" }, actions: <div className="flex gap-2"><button onClick={() => open("detail", item)}>Detalhes</button>{item.canReturn && <button onClick={() => open("return", item)}>Retorno</button>}</div> })) : filteredOrganizations.slice(start, start + OPERATIONAL_PAGE_SIZE).map((item) => ({ id: item.id, label: item.name, values: { subject: item.name, destination: item.organizationType, unit: item.phone || "—", status: item.isActive ? "Ativo" : "Inativo" }, actions: <button onClick={() => { setOrganization(item); open("organization"); }}>Editar</button> }))} />
    <Dialog open={Boolean(modal)} onOpenChange={(value) => { if (!value && !pending) setModal(null); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{modal === "organization" ? "Órgão da rede intersetorial" : modal === "return" ? "Contrarreferência" : modal === "detail" ? "Detalhes do encaminhamento" : "Novo encaminhamento"}</DialogTitle><DialogDescription>Registro vinculado ao equipamento de origem. O retorno mantém os dados do encaminhamento original.</DialogDescription></DialogHeader>
      {modal === "detail" && selected ? <div className="space-y-3 text-sm"><p>Data: {selected.date.split("-").reverse().join("/")}</p><p>Pessoa / família: {selected.subject}</p><p>Destino: {selected.destination}</p><p>Referência: {selected.referenceProfessional || "—"}</p><p className="whitespace-pre-wrap">Objetivo: {selected.objective}</p><p className="whitespace-pre-wrap">Observações: {selected.observations || "—"}</p>{selected.counterReferenceAt && <><p>Retorno: {selected.counterReferenceAt} — {selected.counterReferenceProfessional}</p><p className="whitespace-pre-wrap">{selected.counterReferenceDescription}</p></>}<Link target="_blank" href={`/social/encaminhamentos/${selected.id}/comprovante`} className="text-blue-700 underline">Imprimir comprovante</Link></div> : <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {modal === "organization" ? <>{(Object.entries({ name: "Nome", taxId: "CPF/CNPJ (opcional)", organizationType: "Tipo de órgão", address: "Endereço", phone: "Telefone", email: "E-mail" }) as ["name" | "taxId" | "organizationType" | "address" | "phone" | "email", string][]).map(([key,label]) => <label key={key} className="text-xs">{label}<input disabled={pending} required={key === "name" || key === "organizationType"} type={key === "email" ? "email" : "text"} className={field} value={organization[key]} onChange={(event) => setOrganization({ ...organization, [key]: event.target.value })} /></label>)}<label className="flex items-center gap-2 text-xs"><input disabled={pending} type="checkbox" checked={organization.isActive} onChange={(event) => setOrganization({ ...organization, isActive: event.target.checked })} />Ativo</label><label className="flex items-center gap-2 text-xs"><input disabled={pending} type="checkbox" checked={organization.usesCounterReference} onChange={(event) => setOrganization({ ...organization, usesCounterReference: event.target.checked })} />Utiliza contrarreferência</label></> : <>
          {modal === "referral" && <><label className="text-xs">Equipamento de origem<select required disabled={pending} className={field} value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="">Selecione</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs">Tipo de destinatário<select disabled={pending} className={field} value={subjectType} onChange={(event) => { setSubjectType(event.target.value); setSubjectId(""); }}><option value="person">Pessoa</option><option value="family">Família</option></select></label><label className="text-xs">Pessoa / família<select required disabled={pending} className={field} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Selecione</option>{(subjectType === "person" ? people : families).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs">Destino<select required disabled={pending} className={field} value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Selecione</option>{organizations.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs">Motivo<select required disabled={pending} className={field} value={reasonId} onChange={(event) => setReasonId(event.target.value)}><option value="">Selecione</option>{catalogs.filter((item) => item.kind === "REFERRAL_REASON").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs">Público prioritário<select disabled={pending} className={field} value={priorityId} onChange={(event) => setPriorityId(event.target.value)}><option value="">Não informado</option>{catalogs.filter((item) => item.kind === "PRIORITY").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
          <label className="text-xs">{modal === "return" ? "Data do atendimento no destino" : "Data do encaminhamento"}<input required disabled={pending} type="date" className={field} value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="text-xs">Profissional {modal === "return" ? "que realizou o atendimento" : "de referência no destino"}<input required={modal === "return"} disabled={pending} className={field} value={professional} onChange={(event) => setProfessional(event.target.value)} /></label><label className="text-xs sm:col-span-2">{modal === "return" ? "Descrição do atendimento" : "Objetivo / dificuldades identificadas"}<textarea required minLength={3} disabled={pending} rows={3} className="w-full rounded border p-2 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} /></label>{modal === "referral" && <label className="text-xs sm:col-span-2">Observações<textarea disabled={pending} rows={2} className="w-full rounded border p-2 text-sm" value={observations} onChange={(event) => setObservations(event.target.value)} /></label>}
        </>}
        {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}<div className="flex justify-end gap-2 border-t pt-3 sm:col-span-2"><button disabled={pending} type="button" onClick={() => setModal(null)} className="rounded border px-3 py-2 text-xs">Cancelar</button><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Salvando..." : "Salvar"}</button></div>
      </form>}
    </DialogContent></Dialog>
  </PageFrame>;
}
