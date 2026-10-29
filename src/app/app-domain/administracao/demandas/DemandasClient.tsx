"use client";

import { useRef, useState } from "react";
import { CheckCircle, Pencil, XCircle } from "lucide-react";
import { updateInternalDemand } from "../actions";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { RegistryEditDialog, registryColumns } from "../../cadastros/operational-registry";
import styles from "@/components/app-ui/operational/operational.module.css";

type Demand = {
  id: string; title: string; description: string | null; status: string; priority: string;
  assigneeId: string | null; secretariatId: string | null; departmentId: string | null;
  assignee: { name: string } | null; creator: { name: string } | null;
  secretariat: { name: string } | null; department: { name: string } | null;
};
type Option = { id: string; name: string };
type Props = { demands: Demand[]; secretariats: Option[]; departments: Option[]; employees: Option[] };
type EditForm = { title: string; status: string; priority: string; assigneeId: string; secretariatId: string; departmentId: string };
const statuses = ["Aberta", "Em andamento", "Concluída", "Cancelada"];
const priorities = ["Baixa", "Normal", "Alta", "Urgente"];
const columns = registryColumns([
  ["title", "Título", 220, 120, "identifier"], ["description", "Descrição", 200, 85], ["status", "Status", 130, 80, "status"],
  ["priority", "Prioridade", 100, 65, "status"], ["assignee", "Responsável", 170, 90], ["creator", "Criador", 170, 90],
  ["secretariat", "Secretaria", 170, 90], ["department", "Departamento", 170, 90], ["actions", "Ações", 96, 96, "actions"],
]);

export default function DemandasClient({ demands, secretariats, departments, employees }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Demand | null>(null);
  const [form, setForm] = useState<EditForm>({ title: "", status: "", priority: "", assigneeId: "", secretariatId: "", departmentId: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = demands.filter(demand => (statusFilter === "Todos" || demand.status === statusFilter) && (!query || [demand.title, demand.description, demand.assignee?.name, demand.creator?.name].some(value => value?.toLocaleLowerCase("pt-BR").includes(query))));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));

  async function mutate(demand: Demand, values: EditForm, close = false) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      const result = await updateInternalDemand(demand.id, { ...values, assigneeId: values.assigneeId || null, secretariatId: values.secretariatId || null, departmentId: values.departmentId || null });
      if (result.error) setError(result.error); else if (close) setEditing(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a demanda."); }
    finally { busy.current = false; setPending(false); }
  }
  function changeStatus(demand: Demand, status: string) {
    if (!window.confirm(status === "Concluída" ? "Deseja concluir esta demanda?" : "Deseja inativar/cancelar esta demanda?")) return;
    void mutate(demand, { title: demand.title, status, priority: demand.priority, assigneeId: demand.assigneeId || "", secretariatId: demand.secretariatId || "", departmentId: demand.departmentId || "" });
  }
  const selections = [
    { key: "assigneeId" as const, label: "Responsável", options: employees },
    { key: "secretariatId" as const, label: "Secretaria", options: secretariats },
    { key: "departmentId" as const, label: "Departamento", options: departments },
  ];

  return <OperationalTablePanel title="Demandas internas" triggerLabel="Consultar demandas" description="Consulta e edição das demandas preservadas no componente legado.">
    <OperationalListFrame label="Demandas internas" toolbar={<>
      <input type="search" className={styles.searchInput} aria-label="Buscar demanda por título, descrição, responsável ou criador" placeholder="Buscar demanda" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} />
      <select className={styles.filterButton} aria-label="Filtrar demandas por status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }}><option value="Todos">Todos os status</option>{statuses.map(status => <option key={status}>{status}</option>)}</select>
      {error && !editing && <span role="alert" className="text-[13px] text-red-700">{error}</span>}
    </>} pagination={<OperationalPagination page={activePage} total={filtered.length} pending={pending} onPageChange={setPage} />}>
      <OperationalTable columns={columns} preferenceId="administracao-demandas-legado" caption="Demandas internas" emptyMessage="Nenhuma demanda encontrada."
        rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(demand => ({ id: demand.id, label: demand.title, values: { title: demand.title, description: demand.description || "—", status: demand.status, priority: demand.priority, assignee: demand.assignee?.name || "Sem responsável", creator: demand.creator?.name || "—", secretariat: demand.secretariat?.name || "—", department: demand.department?.name || "—" }, actions: <div className={styles.rowActions}>
          <button type="button" className={styles.iconButton} disabled={pending} aria-label={`Editar ${demand.title}`} onClick={event => { editTrigger.current = event.currentTarget; setEditing(demand); setError(""); setForm({ title: demand.title, status: demand.status, priority: demand.priority, assigneeId: demand.assigneeId || "", secretariatId: demand.secretariatId || "", departmentId: demand.departmentId || "" }); }}><Pencil /></button>
          {demand.status !== "Concluída" && <button type="button" className={styles.iconButton} disabled={pending} aria-label={`Concluir ${demand.title}`} onClick={() => changeStatus(demand, "Concluída")}><CheckCircle /></button>}
          {demand.status !== "Cancelada" && <button type="button" className={styles.iconButton} disabled={pending} aria-label={`Inativar ou cancelar ${demand.title}`} onClick={() => changeStatus(demand, "Cancelada")}><XCircle /></button>}
        </div> }))} />
    </OperationalListFrame>
    <RegistryEditDialog open={!!editing} returnFocus={() => editTrigger.current} onClose={() => setEditing(null)} title={`Editar ${editing?.title || "demanda"}`} pending={pending} error={error} onSave={() => { if (editing && window.confirm("Tem certeza que deseja salvar estas alterações?")) void mutate(editing, form, true); }}>
      <div className={styles.filterFields}>
        <label>Título<input className={styles.searchInput} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <label>Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>
        <label>Prioridade<select value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })}>{priorities.map(priority => <option key={priority}>{priority}</option>)}</select></label>
        {selections.map(selection => <label key={selection.key}>{selection.label}<select value={form[selection.key]} onChange={event => setForm({ ...form, [selection.key]: event.target.value })}><option value="">Sem {selection.label.toLocaleLowerCase("pt-BR")}</option>{selection.options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>)}
      </div>
    </RegistryEditDialog>
  </OperationalTablePanel>;
}
