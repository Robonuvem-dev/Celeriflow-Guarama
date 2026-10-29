"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { operationalColumns } from "../../../patrimonio/_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { professionalTypes } from "@/lib/obras/construction-rules";
import { saveConstructionProfessional, saveConstructionEmployer } from "../rules-actions";

type Option = { id: string; name: string };
type Profile = { id: string; personId: string; name: string; professionalType: string; council: string; registration: string; startsAt: string; endsAt: string; isActive: boolean };
type Employer = { id: string; professionalId: string; companyId: string; name: string; professionalName: string; startsAt: string; endsAt: string; isActive: boolean };
const field = "h-8 w-full rounded border bg-white px-2 text-sm dark:bg-slate-900";
const blank = { id: undefined as string | undefined, personId: "", professionalType: "ENGINEER", council: "CREA", registration: "", professionalId: "", companyId: "", startsAt: "", endsAt: "", isActive: true };

export default function ConstructionProfessionalsClient({ tab, q, status, page, total, canManage, profiles, employers, people, companies, professionals }: { tab: string; q: string; status: string; page: number; total: number; canManage: boolean; profiles: Profile[]; employers: Employer[]; people: Option[]; companies: Option[]; professionals: Option[] }) {
  const router = useRouter();
  const [values, setValues] = useState(blank);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const result = tab === "professionals" ? await saveConstructionProfessional(values) : await saveConstructionEmployer(values);
      if (result.error) { setMessage(result.error); return; }
      setValues(blank); setMessage("Registro salvo."); router.refresh();
    } catch { setMessage("Falha de comunicação. Tente novamente."); } finally { setPending(false); }
  }
  function select(label: string, key: "personId" | "professionalId" | "companyId", options: Option[]) {
    return <label>{label}<select required disabled={pending || Boolean(values.id)} className={field} value={values[key]} onChange={event => setValues({ ...values, [key]: event.target.value })}><option value="">Selecione</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}{values[key] && !options.some(option => option.id === values[key]) && <option value={values[key]}>Referência do registro histórico</option>}</select></label>;
  }
  const rows: OperationalRow[] = tab === "professionals" ? profiles.map(profile => ({ id: profile.id, label: profile.name, values: {
    name: profile.name, profession: professionalTypes[profile.professionalType as keyof typeof professionalTypes], council: profile.council, registration: profile.registration,
    start: profile.startsAt, end: profile.endsAt || "Sem término", status: profile.isActive ? "Ativo" : "Inativo",
  }, actions: canManage && <button disabled={pending} className={styles.iconButton} aria-label={`Editar ${profile.name}`} onClick={() => { setValues({ ...blank, ...profile }); setEditorOpen(true); }}><Pencil /></button> })) : employers.map(employer => ({ id: employer.id, label: employer.name, values: {
    name: employer.name, professional: employer.professionalName, start: employer.startsAt, end: employer.endsAt || "Sem término", status: employer.isActive ? "Ativo" : "Inativo",
  }, actions: canManage && <button disabled={pending} className={styles.iconButton} aria-label={`Editar vínculo de ${employer.name}`} onClick={() => { setValues({ ...blank, ...employer }); setEditorOpen(true); }}><Pencil /></button> }));
  const columns = tab === "professionals" ? operationalColumns([
    ["name", "Profissional", 260, 140, "identifier"], ["profession", "Profissão", 150, 100], ["council", "Conselho", 100, 80], ["registration", "Registro", 130, 90], ["start", "Início", 110, 90], ["end", "Fim", 120, 100], ["status", "Situação", 100, 80, "status"], ["actions", "Ação", 80, 70, "actions"],
  ]) : operationalColumns([
    ["name", "Construtora", 300, 160, "identifier"], ["professional", "Responsável técnico", 260, 140], ["start", "Início", 110, 90], ["end", "Fim", 120, 100], ["status", "Situação", 100, 80, "status"], ["actions", "Ação", 80, 70, "actions"],
  ]);
  return <>
    <OperationalListFrame actions={<><Link href="?tab=professionals" className={styles.dialogButton}>Profissionais</Link><Link href="?tab=companies" className={styles.dialogButton}>Vínculos de construtoras</Link>{canManage && <button type="button" onClick={() => setEditorOpen(true)} className={styles.newButton}>{values.id ? "Continuar edição" : "Cadastrar"}</button>}</>}
      toolbar={<form role="search" className={styles.searchForm}><input type="hidden" name="tab" value={tab} /><input name="q" defaultValue={q} type="search" aria-label="Buscar nome" placeholder="Buscar nome..." className={styles.searchInput} /><select name="status" defaultValue={status} aria-label="Situação" className="h-7 rounded border"><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option></select><button className={styles.dialogButton}>Filtrar</button></form>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname="/obras/construcao-civil/profissionais" values={{ tab, q, status }} />}>
      <OperationalTable columns={columns} rows={rows} preferenceId={`obras-profissionais-${tab}`} caption="Profissionais e vínculos com construtoras" emptyMessage="Nenhum registro encontrado." />
    </OperationalListFrame>
    {canManage && <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent><DialogHeader><DialogTitle>{values.id ? "Editar validade/situação" : "Cadastrar"}</DialogTitle><DialogDescription>Profissionais e vínculos com construtoras. O histórico é preservado.</DialogDescription></DialogHeader>
      {message && <p role="status">{message}</p>}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        {tab === "professionals" ? <>{select("Pessoa cadastrada", "personId", people)}<label>Profissão<select disabled={pending || Boolean(values.id)} className={field} value={values.professionalType} onChange={event => setValues({ ...values, professionalType: event.target.value, council: ({ ENGINEER: "CREA", ARCHITECT: "CAU", BROKER: "CRECI" })[event.target.value as "ENGINEER" | "ARCHITECT" | "BROKER"] })}>{Object.entries(professionalTypes).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>{values.council} — registro/UF<input required minLength={2} maxLength={60} disabled={pending || Boolean(values.id)} className={field} value={values.registration} onChange={event => setValues({ ...values, registration: event.target.value })} /></label></> : <>{select("Construtora cadastrada", "companyId", companies)}{select("Engenheiro / arquiteto", "professionalId", professionals)}</>}
        <label>Início<input required type="date" disabled={pending || Boolean(values.id)} className={field} value={values.startsAt} onChange={event => setValues({ ...values, startsAt: event.target.value })} /></label>
        <label>Validade / fim<input type="date" disabled={pending} className={field} value={values.endsAt} onChange={event => setValues({ ...values, endsAt: event.target.value })} /></label>
        <label><input type="checkbox" disabled={pending} checked={values.isActive} onChange={event => setValues({ ...values, isActive: event.target.checked })} /> Ativo</label>
        <div className="flex justify-end gap-2 sm:col-span-2">{values.id && <button type="button" disabled={pending} onClick={() => setValues(blank)} className={styles.dialogButton}>Cancelar edição</button>}<button disabled={pending} className={styles.primaryButton}>{pending ? "Salvando..." : values.id ? "Salvar validade/situação" : "Cadastrar"}</button></div>
      </form>
    </DialogContent></Dialog>}
  </>;
}
