"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Send } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { registerSocialReferral, returnSocialReferral, saveSocialNetworkOrganization } from "./actions";

type Option = { id: string; name: string };
type Organization = Option & { taxId: string; organizationType: string; address: string; phone: string; email: string; usesCounterReference: boolean; isActive: boolean };
type Row = { id: string; subject: string; unit: string; destination: string; date: string; status: string; objective: string; observations: string; referenceProfessional: string; counterReferenceAt: string; counterReferenceProfessional: string; counterReferenceDescription: string; canReturn: boolean };
type Props = { rows: Row[]; organizations: Organization[]; units: Option[]; people: Option[]; families: Option[]; catalogs: (Option & { kind: string })[] };
const field = "h-8 w-full rounded border bg-white px-2 text-sm dark:bg-slate-900";
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
  const activePage = Math.min(page, Math.max(1, Math.ceil(total / 20)));
  const start = (activePage - 1) * 20;
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
  return <PageFrame className="space-y-2 p-3"><PageHeader title="Encaminhamentos e rede intersetorial" icon={<Send className="size-4" />} action={<button onClick={() => { if (tab === "organizations") setOrganization(organizationDefault); open(tab === "referrals" ? "referral" : "organization"); }} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">{tab === "referrals" ? "Novo encaminhamento" : "Novo órgão"}</button>} />
    <div className="flex gap-2">{[['referrals','Encaminhamentos'],['organizations','Rede intersetorial']] .map(([key,label]) => <button key={key} onClick={() => { setTab(key); setPage(1); setSearch(""); }} className={`rounded border px-3 py-2 text-xs ${tab === key ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{label}</button>)}</div>
    <section className="min-w-0 rounded-lg border"><div className="border-b p-2"><input aria-label="Buscar registros" type="search" className={field} placeholder="Buscar pessoa, família, equipamento ou órgão..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div>
      <table className="w-full table-fixed text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-2">{tab === "referrals" ? "Pessoa / família" : "Órgão"}</th><th className="p-2">{tab === "referrals" ? "Destino" : "Tipo"}</th><th className="hidden p-2 md:table-cell">{tab === "referrals" ? "Equipamento" : "Telefone"}</th><th className="w-20 p-2">Situação</th><th className="w-28 p-2 text-right">Ação</th></tr></thead><tbody>
        {tab === "referrals" ? filteredRows.slice(start, start + 20).map((item) => <tr key={item.id} className="h-9 border-t"><td className="truncate p-2" title={item.subject}>{item.subject}</td><td className="truncate p-2" title={item.destination}>{item.destination}</td><td className="hidden truncate p-2 md:table-cell">{item.unit}</td><td className="p-2">{item.status === "OPEN" ? "Em aberto" : "Retornado"}</td><td className="p-2 text-right"><button className="text-blue-700 underline" onClick={() => open("detail", item)}>Detalhes</button>{item.canReturn && <button className="ml-2 text-blue-700 underline" onClick={() => open("return", item)}>Retorno</button>}</td></tr>) : filteredOrganizations.slice(start, start + 20).map((item) => <tr key={item.id} className="h-9 border-t"><td className="truncate p-2" title={item.name}>{item.name}</td><td className="truncate p-2">{item.organizationType}</td><td className="hidden truncate p-2 md:table-cell">{item.phone || "—"}</td><td className="p-2">{item.isActive ? "Ativo" : "Inativo"}</td><td className="p-2 text-right"><button className="text-blue-700 underline" onClick={() => { setOrganization(item); open("organization"); }}>Editar</button></td></tr>)}
      </tbody></table>{!total && <p className="p-6 text-center text-xs text-slate-500">Nenhum registro encontrado.</p>}<div className="border-t px-3 py-2"><ErpPagination page={activePage} total={total} pageSize={20} previousHref="#" nextHref="#" onPageChange={setPage} label="registros" /></div>
    </section>
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
