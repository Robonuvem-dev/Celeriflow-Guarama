"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { constructionRoles } from "@/lib/obras/construction-policy";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { saveConstructionStaff } from "../actions";

type Row = { id: string; employeeId: string; employeeName: string; departmentId: string; departmentName: string; role: string; startsAt: string; endsAt: string; isActive: boolean };
const field = "h-8 w-full rounded border bg-white px-2 text-sm dark:bg-slate-900";
const blank = { id: undefined as string | undefined, employeeId: "", departmentId: "", role: "ANALYST", startsAt: "", endsAt: "", isActive: true };

export default function ConstructionStaffClient({ rows, employees, departments, q, status, page, total }: { rows: Row[]; employees: { id: string; name: string; departmentId: string | null }[]; departments: { id: string; name: string }[]; q: string; status: string; page: number; total: number }) {
  const router = useRouter();
  const [values, setValues] = useState(blank);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const href = (target: number) => `?${new URLSearchParams({ q, status, page: String(target) })}`;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const result = await saveConstructionStaff(values);
      if (result.error) { setMessage(result.error); return; }
      setValues(blank); setMessage("Vínculo salvo."); router.refresh();
    } catch { setMessage("Falha de comunicação. Tente novamente."); } finally { setPending(false); }
  }
  return <div className="space-y-3"><p className="text-xs text-slate-500">Administração master. Acesso exige vínculo vigente e lotação ativa no setor. Encerrar ou inativar preserva o histórico.</p>
    {message && <p role="status" className="rounded border p-2 text-sm">{message}</p>}
    <form onSubmit={submit} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
      <label className="text-xs">Servidor<select required disabled={pending || Boolean(values.id)} className={field} value={values.employeeId} onChange={(event) => { const employee = employees.find((item) => item.id === event.target.value); setValues({ ...values, employeeId: event.target.value, departmentId: employee?.departmentId || "" }); }}><option value="">Selecione</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}{values.id && !employees.some((employee) => employee.id === values.employeeId) && <option value={values.employeeId}>Servidor do vínculo histórico</option>}</select></label>
      <label className="text-xs">Setor<select required disabled={pending || Boolean(values.id)} className={field} value={values.departmentId} onChange={(event) => setValues({ ...values, departmentId: event.target.value })}><option value="">Selecione</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}{values.id && !departments.some((department) => department.id === values.departmentId) && <option value={values.departmentId}>Setor do vínculo histórico</option>}</select></label>
      <label className="text-xs">Papel<select disabled={pending || Boolean(values.id)} className={field} value={values.role} onChange={(event) => setValues({ ...values, role: event.target.value })}>{Object.entries(constructionRoles).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-xs">Início<input required type="date" disabled={pending || Boolean(values.id)} className={field} value={values.startsAt} onChange={(event) => setValues({ ...values, startsAt: event.target.value })} /></label>
      <label className="text-xs">Fim<input type="date" disabled={pending} className={field} value={values.endsAt} onChange={(event) => setValues({ ...values, endsAt: event.target.value })} /></label>
      <label className="flex items-center gap-2 text-xs"><input disabled={pending} type="checkbox" checked={values.isActive} onChange={(event) => setValues({ ...values, isActive: event.target.checked })} />Ativo</label>
      <div className="flex justify-end gap-2 sm:col-span-3">{values.id && <button type="button" disabled={pending} className="rounded border px-3 py-2 text-xs" onClick={() => setValues(blank)}>Cancelar edição</button>}<button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Salvando..." : values.id ? "Salvar vínculo" : "Cadastrar vínculo"}</button></div>
    </form>
    <section className="rounded-lg border"><form className="flex gap-2 border-b p-2"><input type="search" name="q" defaultValue={q} aria-label="Buscar servidor" className={`${field} min-w-0 flex-1`} placeholder="Buscar servidor..." /><select name="status" defaultValue={status} aria-label="Situação" className="rounded border px-2 text-xs"><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option></select><button className="rounded bg-blue-600 px-3 text-xs text-white">Filtrar</button></form>
      <table className="w-full table-fixed text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-2">Servidor</th><th className="hidden p-2 sm:table-cell">Setor</th><th className="w-20 p-2">Papel</th><th className="w-24 p-2">Vigência</th><th className="w-16 p-2">Situação</th><th className="w-16 p-2 text-right">Ação</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="h-9 border-t"><td className="truncate p-2" title={row.employeeName}>{row.employeeName}</td><td className="hidden truncate p-2 sm:table-cell" title={row.departmentName}>{row.departmentName}</td><td className="p-2">{constructionRoles[row.role as keyof typeof constructionRoles]}</td><td className="p-2 text-[10px]">{row.startsAt.split("-").reverse().join("/")}<br />{row.endsAt ? row.endsAt.split("-").reverse().join("/") : "Sem término"}</td><td className="p-2">{row.isActive ? "Ativo" : "Inativo"}</td><td className="p-2 text-right"><button disabled={pending} className="text-blue-700 underline" onClick={() => setValues(row)}>Editar</button></td></tr>)}</tbody></table>
      {!rows.length && <p className="p-5 text-center text-xs text-slate-500">Nenhum vínculo encontrado.</p>}<div className="border-t p-2"><ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="vínculos" /></div>
    </section>
  </div>;
}
