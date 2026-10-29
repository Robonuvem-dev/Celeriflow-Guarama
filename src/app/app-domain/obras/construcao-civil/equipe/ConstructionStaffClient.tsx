"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { constructionRoles } from "@/lib/obras/construction-policy";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { operationalColumns } from "../../../patrimonio/_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { saveConstructionStaff } from "../actions";

type Row = { id: string; employeeId: string; employeeName: string; departmentId: string; departmentName: string; role: string; startsAt: string; endsAt: string; isActive: boolean };
const field = "h-8 w-full rounded border bg-white px-2 text-sm dark:bg-slate-900";
const blank = { id: undefined as string | undefined, employeeId: "", departmentId: "", role: "ANALYST", startsAt: "", endsAt: "", isActive: true };

export default function ConstructionStaffClient({ rows, employees, departments, q, status, page, total }: { rows: Row[]; employees: { id: string; name: string; departmentId: string | null }[]; departments: { id: string; name: string }[]; q: string; status: string; page: number; total: number }) {
  const router = useRouter();
  const [values, setValues] = useState(blank);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    try {
      const result = await saveConstructionStaff(values);
      if (result.error) { setMessage(result.error); return; }
      setValues(blank); setMessage("Vínculo salvo."); router.refresh();
    } catch { setMessage("Falha de comunicação. Tente novamente."); } finally { setPending(false); }
  }
  return <>
    <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent><DialogHeader><DialogTitle>{values.id ? "Editar vínculo" : "Cadastrar vínculo"}</DialogTitle><DialogDescription>Administração master. Acesso exige vínculo vigente e lotação ativa no setor. Encerrar ou inativar preserva o histórico.</DialogDescription></DialogHeader>
    {message && <p role="status">{message}</p>}
    <form onSubmit={submit} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
      <label className="text-xs">Servidor<select required disabled={pending || Boolean(values.id)} className={field} value={values.employeeId} onChange={(event) => { const employee = employees.find((item) => item.id === event.target.value); setValues({ ...values, employeeId: event.target.value, departmentId: employee?.departmentId || "" }); }}><option value="">Selecione</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}{values.id && !employees.some((employee) => employee.id === values.employeeId) && <option value={values.employeeId}>Servidor do vínculo histórico</option>}</select></label>
      <label className="text-xs">Setor<select required disabled={pending || Boolean(values.id)} className={field} value={values.departmentId} onChange={(event) => setValues({ ...values, departmentId: event.target.value })}><option value="">Selecione</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}{values.id && !departments.some((department) => department.id === values.departmentId) && <option value={values.departmentId}>Setor do vínculo histórico</option>}</select></label>
      <label className="text-xs">Papel<select disabled={pending || Boolean(values.id)} className={field} value={values.role} onChange={(event) => setValues({ ...values, role: event.target.value })}>{Object.entries(constructionRoles).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="text-xs">Início<input required type="date" disabled={pending || Boolean(values.id)} className={field} value={values.startsAt} onChange={(event) => setValues({ ...values, startsAt: event.target.value })} /></label>
      <label className="text-xs">Fim<input type="date" disabled={pending} className={field} value={values.endsAt} onChange={(event) => setValues({ ...values, endsAt: event.target.value })} /></label>
      <label className="flex items-center gap-2 text-xs"><input disabled={pending} type="checkbox" checked={values.isActive} onChange={(event) => setValues({ ...values, isActive: event.target.checked })} />Ativo</label>
      <div className="flex justify-end gap-2 sm:col-span-3">{values.id && <button type="button" disabled={pending} className="rounded border px-3 py-2 text-xs" onClick={() => setValues(blank)}>Cancelar edição</button>}<button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Salvando..." : values.id ? "Salvar vínculo" : "Cadastrar vínculo"}</button></div>
    </form>
    </DialogContent></Dialog>
    <OperationalListFrame actions={<button type="button" className={styles.newButton} onClick={() => setEditorOpen(true)}>{values.id ? "Continuar edição" : "Cadastrar vínculo"}</button>}
      toolbar={<form role="search" className={styles.searchForm}><input type="search" name="q" defaultValue={q} aria-label="Buscar servidor" className={styles.searchInput} placeholder="Buscar servidor..." /><select name="status" defaultValue={status} aria-label="Situação" className="h-7 rounded border px-2"><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option></select><button className={styles.dialogButton}>Filtrar</button></form>}
      pagination={<OperationalLinkPagination page={page} total={total} pathname="/obras/construcao-civil/equipe" values={{ q, status }} />}>
      <OperationalTable preferenceId="obras-equipe" caption="Equipe de Construção Civil" emptyMessage="Nenhum vínculo encontrado." columns={operationalColumns([
        ["employee", "Servidor", 250, 140, "identifier"], ["department", "Setor", 220, 120], ["role", "Papel", 130, 100], ["start", "Início", 110, 90], ["end", "Fim", 120, 100], ["status", "Situação", 100, 80, "status"], ["actions", "Ação", 80, 70, "actions"],
      ])} rows={rows.map(row => ({ id: row.id, label: row.employeeName, values: { employee: row.employeeName, department: row.departmentName, role: constructionRoles[row.role as keyof typeof constructionRoles], start: row.startsAt.split("-").reverse().join("/"), end: row.endsAt ? row.endsAt.split("-").reverse().join("/") : "Sem término", status: row.isActive ? "Ativo" : "Inativo" }, actions: <button disabled={pending} className={styles.iconButton} aria-label={`Editar vínculo de ${row.employeeName}`} onClick={() => { setValues(row); setEditorOpen(true); }}><Pencil /></button> }))} />
    </OperationalListFrame>
  </>;
}
