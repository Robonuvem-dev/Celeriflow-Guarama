"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
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
  const href = (target: number) => `?${new URLSearchParams({ tab, q, status, page: String(target) })}`;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const result = tab === "professionals" ? await saveConstructionProfessional(values) : await saveConstructionEmployer(values);
      if (result.error) { setMessage(result.error); return; }
      setValues(blank); setMessage("Registro salvo."); router.refresh();
    } catch { setMessage("Falha de comunicação. Tente novamente."); } finally { setPending(false); }
  }
  function select(label: string, key: "personId" | "professionalId" | "companyId", options: Option[]) {
    return <label className="text-xs">{label}<select required disabled={pending || Boolean(values.id)} className={field} value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })}><option value="">Selecione</option>{options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}{values[key] && !options.some((option) => option.id === values[key]) && <option value={values[key]}>Referência do registro histórico</option>}</select></label>;
  }
  return <div className="space-y-3"><div className="flex gap-3 text-xs"><Link href="?tab=professionals" className="text-blue-700 underline">Engenheiros, arquitetos e corretores</Link><Link href="?tab=companies" className="text-blue-700 underline">Vínculos de construtoras</Link></div>
    {message && <p role="status" className="rounded border p-2 text-sm">{message}</p>}
    {canManage && <form onSubmit={submit} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
      {tab === "professionals" ? <>{select("Pessoa cadastrada", "personId", people)}<label className="text-xs">Profissão<select disabled={pending || Boolean(values.id)} className={field} value={values.professionalType} onChange={(event) => setValues({ ...values, professionalType: event.target.value, council: ({ ENGINEER: "CREA", ARCHITECT: "CAU", BROKER: "CRECI" })[event.target.value as "ENGINEER" | "ARCHITECT" | "BROKER"] })}>{Object.entries(professionalTypes).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-xs">{values.council} — registro/UF<input required minLength={2} maxLength={60} disabled={pending || Boolean(values.id)} className={field} value={values.registration} onChange={(event) => setValues({ ...values, registration: event.target.value })} /></label></> : <>{select("Construtora cadastrada", "companyId", companies)}{select("Engenheiro / arquiteto", "professionalId", professionals)}</>}
      <label className="text-xs">Início<input required type="date" disabled={pending || Boolean(values.id)} className={field} value={values.startsAt} onChange={(event) => setValues({ ...values, startsAt: event.target.value })} /></label><label className="text-xs">Validade / fim<input type="date" disabled={pending} className={field} value={values.endsAt} onChange={(event) => setValues({ ...values, endsAt: event.target.value })} /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={pending} checked={values.isActive} onChange={(event) => setValues({ ...values, isActive: event.target.checked })} />Ativo</label>
      <div className="flex justify-end gap-2 sm:col-span-3">{values.id && <button type="button" disabled={pending} onClick={() => setValues(blank)} className="rounded border px-3 py-2 text-xs">Cancelar edição</button>}<button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Salvando..." : values.id ? "Salvar validade/situação" : "Cadastrar"}</button></div>
    </form>}
    <section className="rounded-lg border"><form className="flex gap-2 border-b p-2"><input type="hidden" name="tab" value={tab} /><input name="q" defaultValue={q} type="search" aria-label="Buscar nome" placeholder="Buscar nome..." className={`${field} min-w-0 flex-1`} /><select name="status" defaultValue={status} aria-label="Situação" className="rounded border px-2 text-xs"><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option></select><button className="rounded bg-blue-600 px-3 text-xs text-white">Filtrar</button></form>
      <table className="w-full table-fixed text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-2">{tab === "professionals" ? "Profissional" : "Construtora"}</th><th className="hidden p-2 sm:table-cell">{tab === "professionals" ? "Profissão / registro" : "Responsável técnico"}</th><th className="w-24 p-2">Vigência</th><th className="w-20 p-2">Situação</th><th className="w-16 p-2 text-right">Ação</th></tr></thead><tbody>{tab === "professionals" ? profiles.map((profile) => <tr key={profile.id} className="h-9 border-t"><td className="truncate p-2" title={profile.name}>{profile.name}</td><td className="hidden truncate p-2 sm:table-cell">{professionalTypes[profile.professionalType as keyof typeof professionalTypes]} / {profile.council} {profile.registration}</td><td className="p-2 text-[10px]">{profile.startsAt}<br />{profile.endsAt || "Sem término"}</td><td className="p-2">{profile.isActive ? "Ativo" : "Inativo"}</td><td className="p-2 text-right">{canManage && <button disabled={pending} onClick={() => setValues({ ...blank, ...profile })} className="text-blue-700 underline">Editar</button>}</td></tr>) : employers.map((employer) => <tr key={employer.id} className="h-9 border-t"><td className="truncate p-2" title={employer.name}>{employer.name}</td><td className="hidden truncate p-2 sm:table-cell">{employer.professionalName}</td><td className="p-2 text-[10px]">{employer.startsAt}<br />{employer.endsAt || "Sem término"}</td><td className="p-2">{employer.isActive ? "Ativo" : "Inativo"}</td><td className="p-2 text-right">{canManage && <button disabled={pending} onClick={() => setValues({ ...blank, ...employer })} className="text-blue-700 underline">Editar</button>}</td></tr>)}</tbody></table>{!total && <p className="p-5 text-center text-xs text-slate-500">Nenhum registro encontrado.</p>}<div className="border-t p-2"><ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="registros" /></div>
    </section>
  </div>;
}
