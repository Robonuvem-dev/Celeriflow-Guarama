"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserRound, Plus } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { SocialOperationalList } from "../../OperationalList";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { registerSocialFact, endSocialFact, registerSocialFinancialEntry, cancelSocialFinancialEntry, saveSocialPersonProfile } from "../actions";
import { socialAmountCents, socialCentsDisplay } from "@/lib/social/money";

type Profile = { nis: string; genderIdentity: string; sexualOrientation: string; workSituation: string; occupation: string; workplace: string; admittedAt: string };
type Person = { id: string; fullName: string; socialName: string | null; cpf: string | null; birthDate: string; gender: string | null; raceColor: string | null; motherName: string | null; fatherName: string | null; educationLevel: string | null; phonePrimary: string | null; status: string; socialProfile: Profile | null };
type Fact = { id: string; kind: string; name: string; unit: string; identifiedAt: string; endedAt: string; observations: string; endingReason: string };
type Financial = { id: string; kind: string; name: string; unit: string; competence: string; value: string; observations: string; employmentDescription: string; cancelled: boolean; cancellationReason: string };
type Attendance = { id: string; date: string; type: string; description: string; secrecyLevel: string; unit: string };
type Props = { person: Person; facts: Fact[]; entries: Financial[]; attendances: Attendance[]; catalogs: { id: string; kind: string; name: string }[]; units: { id: string; name: string }[] };
const field = "h-7 w-full rounded border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900";
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
  const activePage = Math.min(page, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const start = (activePage - 1) * OPERATIONAL_PAGE_SIZE;
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
  return <PageFrame className="flex h-full min-h-0 flex-col gap-1">
    <PageHeader title={`Prontuário — ${person.socialName || person.fullName}`} icon={<UserRound className="size-4" />} action={<button className="rounded border px-3 py-1.5 text-xs" onClick={() => { setProfile(person.socialProfile || emptyProfile); open("profile"); }}>Dados sociais</button>} />
    <SocialOperationalList id={`pessoa-${tab}`} page={activePage} total={total} onPageChange={setPage}
      actions={<><Link href="/social/pessoas">Voltar aos prontuários</Link>{tab !== "attendances" && <button onClick={() => open(tab === "facts" ? "fact" : "financial")}><Plus className="inline size-3" />Registrar</button>}</>}
      toolbar={<div className="flex w-full min-w-0 gap-2"><select aria-label="Seção do prontuário" className="h-8 min-w-0 rounded border" value={tab} onChange={(event) => { setTab(event.target.value); setPage(1); setSearch(""); }}><option value="facts">Vulnerabilidades e potencialidades</option><option value="financial">Rendas e despesas</option><option value="attendances">Atendimentos</option></select><input aria-label="Buscar registros" type="search" className={`${field} min-w-0 flex-1`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar classificação ou equipamento..." /><OperationalFilters label="Dados e filtros"><div className="space-y-2 text-sm"><p>Nome civil: {person.fullName}</p><p>CPF: {person.cpf}</p><p>NIS: {person.socialProfile?.nis || "—"}</p><p>Nascimento: {person.birthDate.split("-").reverse().join("/") || "—"}</p><p>Filiação: {[person.motherName, person.fatherName].filter(Boolean).join(" / ") || "—"}</p><p>Escolaridade: {person.educationLevel || "—"}</p>{tab === "financial" && <><label>Competência<input aria-label="Competência" type="month" className={field} value={competence} onChange={(event) => { setCompetence(event.target.value); setPage(1); }} /></label><p>Rendas: {socialCentsDisplay(income)}</p><p>Despesas: {socialCentsDisplay(expenses)}</p><p>Saldo: {socialCentsDisplay(income - expenses)}</p><p>Totais dos registros filtrados e não cancelados.</p></>}</div></OperationalFilters></div>}
      columns={[["date", "Data", 120, 90], ["name", "Registro", 240, 120, "identifier"], ["unit", "Equipamento", 200, 110], ["status", tab === "attendances" ? "Sigilo" : "Situação", 130, 90, "status"], ...(tab === "financial" ? [["value", "Valor", 130, 100, "text", "right"] as import("../../OperationalList").SocialColumn] : []), ["actions", "Ações", 170, 170, "actions"]]}
      rows={tab === "facts" ? filteredFacts.slice(start, start + OPERATIONAL_PAGE_SIZE).map((item) => ({ id: item.id, label: item.name, values: { date: item.identifiedAt.split("-").reverse().join("/"), name: item.name, unit: item.unit, status: item.endedAt ? "Encerrado" : "Ativo" }, actions: <div className="flex gap-2"><button onClick={() => { setDetail(`${names[item.kind]}: ${item.name}\n${item.observations}\n${item.endedAt ? `Encerrado em ${item.endedAt}: ${item.endingReason}` : ""}`); setModal("detail"); }}>Detalhes</button>{!item.endedAt && <button onClick={() => { setRecordId(item.id); open("end"); }}>Encerrar</button>}</div> })) : tab === "financial" ? filteredEntries.slice(start, start + OPERATIONAL_PAGE_SIZE).map((item) => ({ id: item.id, label: item.name, values: { date: item.competence.split("-").reverse().join("/"), name: `${names[item.kind]}: ${item.name}`, unit: item.unit, status: item.cancelled ? "Cancelado" : "Ativo", value: socialCentsDisplay(socialAmountCents(item.value)) }, actions: <div className="flex gap-2"><button onClick={() => { setDetail(`${item.name}\n${item.employmentDescription}\n${item.observations}\n${item.cancelled ? `Cancelamento: ${item.cancellationReason}` : ""}`); setModal("detail"); }}>Detalhes</button>{!item.cancelled && <button onClick={() => { setRecordId(item.id); open("cancel"); }}>Cancelar</button>}</div> })) : filteredAttendances.slice(start, start + OPERATIONAL_PAGE_SIZE).map((item) => ({ id: item.id, label: item.type, values: { date: new Date(item.date).toLocaleDateString("pt-BR"), name: item.type, unit: item.unit, status: item.secrecyLevel }, actions: <button onClick={() => { setDetail(item.description); setModal("detail"); }}>Detalhes</button> }))} />
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
