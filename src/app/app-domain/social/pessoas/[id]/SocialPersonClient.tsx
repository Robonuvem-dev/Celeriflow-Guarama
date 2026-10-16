"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserRound, Plus } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { registerSocialFact, endSocialFact, registerSocialFinancialEntry, cancelSocialFinancialEntry, saveSocialPersonProfile } from "../actions";
import { socialAmountCents, socialCentsDisplay } from "@/lib/social/money";

type Profile = { nis: string; genderIdentity: string; sexualOrientation: string; workSituation: string; occupation: string; workplace: string; admittedAt: string };
type Person = { id: string; fullName: string; socialName: string | null; cpf: string | null; birthDate: string; gender: string | null; raceColor: string | null; motherName: string | null; fatherName: string | null; educationLevel: string | null; phonePrimary: string | null; status: string; socialProfile: Profile | null };
type Fact = { id: string; kind: string; name: string; unit: string; identifiedAt: string; endedAt: string; observations: string; endingReason: string };
type Financial = { id: string; kind: string; name: string; unit: string; competence: string; value: string; observations: string; employmentDescription: string; cancelled: boolean; cancellationReason: string };
type Attendance = { id: string; date: string; type: string; description: string; secrecyLevel: string; unit: string };
type Props = { person: Person; facts: Fact[]; entries: Financial[]; attendances: Attendance[]; catalogs: { id: string; kind: string; name: string }[]; units: { id: string; name: string }[] };
const field = "h-8 w-full rounded border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const names: Record<string, string> = { VULNERABILITY: "Vulnerabilidade", POTENTIALITY: "Potencialidade", INCOME: "Renda", EXPENSE: "Despesa" };
const emptyProfile: Profile = { nis: "", genderIdentity: "", sexualOrientation: "", workSituation: "", occupation: "", workplace: "", admittedAt: "" };

export default function SocialPersonClient({ person, facts, entries, attendances, catalogs, units }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("facts");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [competence, setCompetence] = useState(new Date().toISOString().slice(0, 7));
  const [modal, setModal] = useState<"fact" | "financial" | "end" | "cancel" | "profile" | "detail" | null>(null);
  const [recordId, setRecordId] = useState("");
  const [detail, setDetail] = useState("");
  const [kind, setKind] = useState("VULNERABILITY");
  const [unitId, setUnitId] = useState(units[0]?.id || "");
  const [catalogId, setCatalogId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [value, setValue] = useState("");
  const [observations, setObservations] = useState("");
  const [employmentDescription, setEmploymentDescription] = useState("");
  const [profile, setProfile] = useState(person.socialProfile || emptyProfile);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const filteredFacts = facts.filter((item) => `${item.name} ${item.unit}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const filteredEntries = entries.filter((item) => (!competence || item.competence === competence) && `${item.name} ${item.unit}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const filteredAttendances = attendances.filter((item) => `${item.type} ${item.unit}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const total = tab === "facts" ? filteredFacts.length : tab === "financial" ? filteredEntries.length : filteredAttendances.length;
  const activePage = Math.min(page, Math.max(1, Math.ceil(total / 20)));
  const start = (activePage - 1) * 20;
  const income = filteredEntries.filter((entry) => !entry.cancelled && entry.kind === "INCOME").reduce((sum, entry) => sum + socialAmountCents(entry.value), BigInt(0));
  const expenses = filteredEntries.filter((entry) => !entry.cancelled && entry.kind === "EXPENSE").reduce((sum, entry) => sum + socialAmountCents(entry.value), BigInt(0));
  function open(type: typeof modal) { setModal(type); setError(""); setObservations(""); setCatalogId(""); setValue(""); setEmploymentDescription(""); setDate(new Date().toISOString().slice(0, 10)); setKind(type === "financial" ? "INCOME" : "VULNERABILITY"); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const result = modal === "fact" ? await registerSocialFact({ personId: person.id, unitId, catalogId, kind, identifiedAt: date, observations })
        : modal === "financial" ? await registerSocialFinancialEntry({ personId: person.id, unitId, catalogId, kind, competence, value, observations, employmentDescription })
          : modal === "end" ? await endSocialFact({ id: recordId, endedAt: date, reason: observations })
            : modal === "cancel" ? await cancelSocialFinancialEntry({ id: recordId, reason: observations })
              : await saveSocialPersonProfile({ personId: person.id, ...profile });
      if (result.error) { setError(result.error); return; }
      setModal(null); router.refresh();
    } catch { setError("Falha de comunicação. Tente novamente."); } finally { setPending(false); }
  }
  return <PageFrame className="space-y-2 p-3">
    <PageHeader title={`Prontuário — ${person.socialName || person.fullName}`} icon={<UserRound className="size-4" />} action={<button className="rounded border px-3 py-1.5 text-xs" onClick={() => { setProfile(person.socialProfile || emptyProfile); open("profile"); }}>Dados sociais</button>} />
    <Link href="/social/pessoas" className="text-xs text-blue-700 underline">Voltar aos prontuários</Link>
    <section className="grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-3"><p><strong>Nome civil:</strong> {person.fullName}</p><p><strong>CPF:</strong> {person.cpf}</p><p><strong>NIS:</strong> {person.socialProfile?.nis || "—"}</p><p><strong>Nascimento:</strong> {person.birthDate.split("-").reverse().join("/") || "—"}</p><p><strong>Filiação:</strong> {[person.motherName, person.fatherName].filter(Boolean).join(" / ") || "—"}</p><p><strong>Escolaridade:</strong> {person.educationLevel || "—"}</p></section>
    <div role="tablist" aria-label="Seções do prontuário" className="flex flex-wrap gap-2">{[['facts','Vulnerabilidades e potencialidades'],['financial','Rendas e despesas'],['attendances','Atendimentos']] .map(([key,label]) => <button role="tab" aria-selected={tab === key} key={key} onClick={() => { setTab(key); setPage(1); setSearch(""); }} className={`rounded-md border px-3 py-2 text-xs ${tab === key ? "bg-blue-600 text-white" : "bg-white text-slate-700"}`}>{label}</button>)}</div>
    <section className="min-w-0 rounded-lg border">
      <div className="flex flex-wrap items-end gap-2 border-b p-2"><input aria-label="Buscar registros" type="search" className={`${field} min-w-0 flex-1`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar classificação ou equipamento..." />{tab === "financial" && <label className="text-xs">Competência<input type="month" className={field} value={competence} onChange={(event) => { setCompetence(event.target.value); setPage(1); }} /></label>}{tab !== "attendances" && <button onClick={() => open(tab === "facts" ? "fact" : "financial")} className="inline-flex h-8 items-center gap-1 rounded bg-blue-600 px-3 text-xs text-white"><Plus className="size-3" />Registrar</button>}</div>
      {tab === "financial" && <div className="flex flex-wrap gap-4 border-b bg-slate-50 p-2 text-xs text-slate-700"><span>Rendas: {socialCentsDisplay(income)}</span><span>Despesas: {socialCentsDisplay(expenses)}</span><span>Saldo: {socialCentsDisplay(income - expenses)}</span><span>Totais dos registros filtrados e não cancelados.</span></div>}
      <table className="w-full table-fixed text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="w-24 p-2">Data</th><th className="p-2">Registro</th><th className="hidden p-2 md:table-cell">Equipamento</th><th className="w-24 p-2">Situação / valor</th><th className="w-28 p-2 text-right">Ações</th></tr></thead><tbody>
        {tab === "facts" && filteredFacts.slice(start, start + 20).map((item) => <tr key={item.id} className="h-9 border-t"><td className="p-2">{item.identifiedAt.split("-").reverse().join("/")}</td><td className="truncate p-2" title={item.name}>{item.name}</td><td className="hidden truncate p-2 md:table-cell" title={item.unit}>{item.unit}</td><td className="p-2">{item.endedAt ? "Encerrado" : "Ativo"}</td><td className="p-2 text-right"><button className="text-blue-700 underline" onClick={() => { setDetail(`${names[item.kind]}: ${item.name}\n${item.observations}\n${item.endedAt ? `Encerrado em ${item.endedAt}: ${item.endingReason}` : ""}`); setModal("detail"); }}>Detalhes</button>{!item.endedAt && <button className="ml-2 text-blue-700 underline" onClick={() => { setRecordId(item.id); open("end"); }}>Encerrar</button>}</td></tr>)}
        {tab === "financial" && filteredEntries.slice(start, start + 20).map((item) => <tr key={item.id} className="h-9 border-t"><td className="p-2">{item.competence.split("-").reverse().join("/")}</td><td className="truncate p-2" title={`${names[item.kind]}: ${item.name}`}>{names[item.kind]}: {item.name}</td><td className="hidden truncate p-2 md:table-cell">{item.unit}</td><td className="truncate p-2" title={socialCentsDisplay(socialAmountCents(item.value))}>{item.cancelled ? "Cancelado" : socialCentsDisplay(socialAmountCents(item.value))}</td><td className="p-2 text-right"><button className="text-blue-700 underline" onClick={() => { setDetail(`${item.name}\n${item.employmentDescription}\n${item.observations}\n${item.cancelled ? `Cancelamento: ${item.cancellationReason}` : ""}`); setModal("detail"); }}>Detalhes</button>{!item.cancelled && <button className="ml-2 text-red-700 underline" onClick={() => { setRecordId(item.id); open("cancel"); }}>Cancelar</button>}</td></tr>)}
        {tab === "attendances" && filteredAttendances.slice(start, start + 20).map((item) => <tr key={item.id} className="h-9 border-t"><td className="p-2">{new Date(item.date).toLocaleDateString("pt-BR")}</td><td className="truncate p-2">{item.type}</td><td className="hidden truncate p-2 md:table-cell">{item.unit}</td><td className="p-2">{item.secrecyLevel}</td><td className="p-2 text-right"><button className="text-blue-700 underline" onClick={() => { setDetail(item.description); setModal("detail"); }}>Detalhes</button></td></tr>)}
      </tbody></table>{!total && <p className="p-6 text-center text-xs text-slate-500">Nenhum registro disponível no seu escopo de acesso.</p>}
      <div className="border-t px-3 py-2"><ErpPagination page={activePage} total={total} pageSize={20} previousHref="#" nextHref="#" label="registros" onPageChange={setPage} /></div>
    </section>
    <Dialog open={Boolean(modal)} onOpenChange={(isOpen) => { if (!isOpen && !pending) setModal(null); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{modal === "profile" ? "Dados sociais e trabalhistas" : modal === "detail" ? "Detalhes do registro" : modal === "end" ? "Superação / encerramento" : modal === "cancel" ? "Cancelar lançamento" : "Novo registro socioassistencial"}</DialogTitle><DialogDescription>Os registros históricos são preservados. Correções e encerramentos são auditados.</DialogDescription></DialogHeader>
      {modal === "detail" ? <p className="whitespace-pre-wrap break-words text-sm">{detail}</p> : <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {modal === "profile" ? (Object.entries({ nis: "NIS (11 dígitos)", genderIdentity: "Identidade de gênero", sexualOrientation: "Orientação sexual", workSituation: "Situação de trabalho", occupation: "Ocupação", workplace: "Local de trabalho", admittedAt: "Admissão" }) as [keyof Profile, string][]).map(([key,label]) => <label key={key} className="text-xs">{label}<input disabled={pending} type={key === "admittedAt" ? "date" : "text"} className={field} value={profile[key]} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} /></label>) : <>
          {(modal === "fact" || modal === "financial") && <><label className="text-xs">Tipo<select disabled={pending} className={field} value={kind} onChange={(event) => { setKind(event.target.value); setCatalogId(""); }}>{(modal === "fact" ? ["VULNERABILITY", "POTENTIALITY"] : ["INCOME", "EXPENSE"]).map((key) => <option key={key} value={key}>{names[key]}</option>)}</select></label><label className="text-xs">Classificação<select disabled={pending} required className={field} value={catalogId} onChange={(event) => setCatalogId(event.target.value)}><option value="">Selecione</option>{catalogs.filter((item) => item.kind === kind).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs sm:col-span-2">Equipamento<select disabled={pending} required className={field} value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="">Selecione</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></>}
          {(modal === "fact" || modal === "end") && <label className="text-xs">Data<input disabled={pending} required type="date" className={field} value={date} onChange={(event) => setDate(event.target.value)} /></label>}
          {modal === "financial" && <><label className="text-xs">Competência<input disabled={pending} required type="month" className={field} value={competence} onChange={(event) => setCompetence(event.target.value)} /></label><label className="text-xs">Valor (R$)<input disabled={pending} required type="number" min="0.01" step="0.01" className={field} value={value} onChange={(event) => setValue(event.target.value)} /></label><label className="text-xs sm:col-span-2">Vínculo de trabalho que gerou a renda<input disabled={pending} className={field} value={employmentDescription} onChange={(event) => setEmploymentDescription(event.target.value)} /></label></>}
          <label className="text-xs sm:col-span-2">{modal === "end" || modal === "cancel" ? "Motivo (obrigatório)" : "Observações"}<textarea disabled={pending} required={modal === "end" || modal === "cancel"} minLength={modal === "end" || modal === "cancel" ? 3 : undefined} className="w-full rounded border p-2 text-sm" rows={3} value={observations} onChange={(event) => setObservations(event.target.value)} /></label>
        </>}
        {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}<div className="flex justify-end gap-2 border-t pt-3 sm:col-span-2"><button type="button" disabled={pending} onClick={() => setModal(null)} className="rounded border px-3 py-2 text-xs">Cancelar</button><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Salvando..." : "Salvar"}</button></div>
      </form>}
    </DialogContent></Dialog>
  </PageFrame>;
}
