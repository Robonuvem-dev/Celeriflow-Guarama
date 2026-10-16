"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserRoundCog, Plus } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { saveSocialProfessionalLink } from "./actions";

type Link = { id: string; employeeId: string; unitId: string; jobTitle: string; specialty: string | null; startsAt: string; endsAt: string; isActive: boolean; individualScope: string; familyScope: string; workStart: string; workEnd: string; workingDays: number[]; includeInRma: boolean; employee: { name: string }; unit: { name: string } };
type Option = { id: string; name: string };
const defaults = { id: undefined as string | undefined, employeeId: "", unitId: "", jobTitle: "", specialty: "", startsAt: "", endsAt: "", isActive: true, individualScope: "UNIT", familyScope: "UNIT", workStart: "08:00", workEnd: "17:00", workingDays: [1, 2, 3, 4, 5], includeInRma: true };
const field = "h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const scopes = { OWN: "Somente próprios registros", UNIT: "Registros do equipamento", MUNICIPAL: "Registros municipais não sigilosos" };

export default function SocialProfessionalsClient({ links, employees, units }: { links: Link[]; employees: Option[]; units: Option[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Todos");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaults);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const rows = links.filter((link) => [link.employee.name, link.unit.name, link.jobTitle].some((value) => value.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))) && (status === "Todos" || link.isActive === (status === "Ativos")));
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / 20)));
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    try {
      const result = await saveSocialProfessionalLink(form);
      if (result.error) { setError(result.error); return; }
      setOpen(false); router.refresh();
    } catch { setError("Falha de comunicação. Tente novamente."); } finally { setPending(false); }
  }
  return <PageFrame className="space-y-2 p-3">
    <PageHeader title="Profissionais e vínculos SUAS" icon={<UserRoundCog className="size-4" />} action={<button onClick={() => { setForm(defaults); setError(""); setOpen(true); }} className="inline-flex h-8 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white"><Plus className="size-4" />Novo vínculo</button>} />
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="grid gap-2 border-b p-2 sm:grid-cols-[1fr_10rem]"><input aria-label="Buscar profissional, equipamento ou cargo" type="search" className={field} placeholder="Buscar profissional, equipamento ou cargo..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Situação" className={field} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option>Todos</option><option>Ativos</option><option>Inativos</option></select></div>
      <table className="w-full table-fixed text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-2">Profissional</th><th className="p-2">Equipamento</th><th className="hidden p-2 md:table-cell">Cargo</th><th className="hidden p-2 lg:table-cell">Expediente</th><th className="w-20 p-2">Situação</th><th className="w-16 p-2 text-right">Ação</th></tr></thead><tbody>{rows.slice((activePage - 1) * 20, activePage * 20).map((link) => <tr key={link.id} className="h-9 border-t hover:bg-slate-50 dark:hover:bg-slate-800"><td className="truncate p-2" title={link.employee.name}>{link.employee.name}</td><td className="truncate p-2" title={link.unit.name}>{link.unit.name}</td><td className="hidden truncate p-2 md:table-cell" title={link.jobTitle}>{link.jobTitle}</td><td className="hidden p-2 lg:table-cell">{link.workStart}–{link.workEnd}</td><td className="p-2">{link.isActive ? "Ativo" : "Inativo"}</td><td className="p-2 text-right"><button className="text-blue-700 underline" onClick={() => { setForm({ ...link, specialty: link.specialty || "" }); setError(""); setOpen(true); }}>Editar</button></td></tr>)}</tbody></table>
      {!rows.length && <p className="p-6 text-center text-xs text-slate-500">Nenhum vínculo encontrado.</p>}
      <div className="border-t px-3 py-2"><ErpPagination page={activePage} total={rows.length} pageSize={20} previousHref="#" nextHref="#" onPageChange={setPage} label="vínculos" /></div>
    </section>
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{form.id ? "Editar vínculo profissional" : "Novo vínculo profissional"}</DialogTitle><DialogDescription>Controle de acesso ao prontuário, vínculo e expediente. Registro restrito à administração do sistema.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs">Profissional<select required disabled={pending} className={field} value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">Selecione</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-xs">Equipamento<select required disabled={pending} className={field} value={form.unitId} onChange={(event) => setForm({ ...form, unitId: event.target.value })}><option value="">Selecione</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        {([['jobTitle','Cargo NOB-RH/SUAS','text'],['specialty','Especialidade','text'],['startsAt','Início do vínculo','date'],['endsAt','Fim do vínculo','date'],['workStart','Início do expediente','time'],['workEnd','Fim do expediente','time']] as const).map(([key,label,type]) => <label key={key} className="text-xs">{label}<input required={key !== "specialty" && key !== "endsAt"} disabled={pending} type={type} className={field} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}
        {([['individualScope','Prontuário individual'],['familyScope','Prontuário familiar']] as const).map(([key,label]) => <label key={key} className="text-xs">{label}<select disabled={pending} className={field} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}>{Object.entries(scopes).map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}
        <fieldset className="sm:col-span-2"><legend className="mb-1 text-xs">Dias de expediente</legend><div className="flex flex-wrap gap-3">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label, day) => <label key={day} className="flex items-center gap-1 text-xs"><input disabled={pending} type="checkbox" checked={form.workingDays.includes(day)} onChange={(event) => setForm({ ...form, workingDays: event.target.checked ? [...form.workingDays, day] : form.workingDays.filter((item) => item !== day) })} />{label}</label>)}</div></fieldset>
        <label className="flex items-center gap-2 text-xs"><input disabled={pending} type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />Vínculo ativo</label>
        <label className="flex items-center gap-2 text-xs"><input disabled={pending} type="checkbox" checked={form.includeInRma} onChange={(event) => setForm({ ...form, includeInRma: event.target.checked })} />Contabilizar no RMA</label>
        {error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 border-t pt-3 sm:col-span-2"><button disabled={pending} type="button" onClick={() => setOpen(false)} className="rounded border px-3 py-2 text-xs">Cancelar</button><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Salvando..." : "Salvar vínculo"}</button></div>
      </form>
    </DialogContent></Dialog>
  </PageFrame>;
}
