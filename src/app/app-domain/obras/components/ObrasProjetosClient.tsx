"use client";

import { FormEvent, useState } from "react";
import { Pencil, Plus, PowerOff, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createObra, inactivateObra, updateObra } from "../actions";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../../patrimonio/_components/operational-columns";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

type Obra = {
  id: string;
  numero: string;
  nome: string;
  descricao: string | null;
  local: string | null;
  tipo: string;
  valorEstimado: number | null;
  status: string;
  active: boolean;
};

const tipos = ["Construção", "Reforma", "Pavimentação", "Drenagem", "Iluminação"];
const statusOptions = ["Em Planejamento", "Em Execução", "Concluída", "Paralisada"];
const fieldClass = "w-full rounded-md border border-slate-200 bg-white p-2 text-sm text-slate-900 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-600/20 dark:border-slate-600 dark:bg-slate-700 dark:text-white";
const columns = operationalColumns([
  ["code", "Código", 140, 100, "identifier"], ["name", "Obra/projeto", 300, 160], ["location", "Local", 220, 120],
  ["type", "Tipo", 160, 100], ["status", "Situação", 180, 120, "status"], ["actions", "Ações", 80, 80, "actions", "right"],
]);

function ObraSheet({ obra, open, onOpenChange }: { obra?: Obra; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.currentTarget);
    const valorEstimadoValue = String(formData.get("valorEstimado") ?? "");
    const valorEstimado = Number(valorEstimadoValue);
    if (!valorEstimadoValue || !Number.isFinite(valorEstimado) || valorEstimado < 0) {
      setError("Informe um valor estimado válido.");
      return;
    }

    setSaving(true);
    const data = {
      numero: String(formData.get("numero") ?? ""),
      nome: String(formData.get("nome") ?? ""),
      descricao: String(formData.get("descricao") ?? ""),
      local: String(formData.get("local") ?? ""),
      tipo: String(formData.get("tipo") ?? ""),
      valorEstimado,
    };
    const result = obra
      ? await updateObra(obra.id, { ...data, status: String(formData.get("status") ?? "") })
      : await createObra(data);

    if (result.error) {
      setError(result.error);
    } else {
      onOpenChange(false);
      router.refresh();
    }
    setSaving(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setError("");
    onOpenChange(nextOpen);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-[calc(100vw-1rem)] overflow-y-auto sm:w-[34rem]">
        <SheetHeader>
          <SheetTitle>{obra ? "Editar obra" : "Nova obra"}</SheetTitle>
          <SheetDescription>{obra ? "Atualize os dados e o status da obra." : "Cadastre uma nova obra ou projeto."}</SheetDescription>
        </SheetHeader>
        <form key={`${obra?.id ?? "new"}-${open}`} onSubmit={handleSubmit} className="mt-4 space-y-3 pb-2">
          {error && <div className="rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Número"><input name="numero" required defaultValue={obra?.numero} className={fieldClass} /></Field>
            <Field label="Tipo"><select name="tipo" required defaultValue={obra?.tipo ?? ""} className={fieldClass}><option value="">Selecione...</option>{tipos.map((tipo) => <option key={tipo}>{tipo}</option>)}</select></Field>
          </div>
          <Field label="Nome"><input name="nome" required defaultValue={obra?.nome} className={fieldClass} /></Field>
          <Field label="Local"><input name="local" defaultValue={obra?.local ?? ""} className={fieldClass} /></Field>
          <Field label="Descrição"><textarea name="descricao" defaultValue={obra?.descricao ?? ""} rows={3} className={`${fieldClass} resize-none`} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor estimado (R$)"><input name="valorEstimado" type="number" min="0" step="0.01" required defaultValue={obra?.valorEstimado ?? ""} className={fieldClass} /></Field>
            {obra && <Field label="Status"><select name="status" required defaultValue={obra.status} className={fieldClass}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></Field>}
          </div>
          <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => handleOpenChange(false)} className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{saving ? "Salvando..." : "Salvar"}</button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200"><span>{label}</span>{children}</label>;
}

export function ObrasProjetosClient({ obras }: { obras: Obra[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [active, setActive] = useState("Todos");
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Obra | null>(null);
  const [actionError, setActionError] = useState("");
  const [inactivatingId, setInactivatingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const query = search.trim().toLocaleLowerCase("pt-BR");
  const filteredObras = obras.filter((obra) => {
    const matchesSearch = !query || [obra.numero, obra.nome, obra.descricao, obra.local].some((value) => value?.toLocaleLowerCase("pt-BR").includes(query));
    return matchesSearch && (tipo === "Todos" || obra.tipo === tipo) && (status === "Todos" || obra.status === status) && (active === "Todos" || obra.active === (active === "Ativas"));
  });
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredObras.length / PAGE_SIZE)));
  const visibleObras = filteredObras.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const resetPage = (callback: () => void) => { callback(); setPage(1); };

  async function handleInactivate(obra: Obra) {
    if (!confirm(`Inativar a obra ${obra.numero}?`)) return;
    setActionError("");
    setInactivatingId(obra.id);
    const result = await inactivateObra(obra.id);
    if (result.error) {
      setActionError(result.error);
    } else {
      router.refresh();
    }
    setInactivatingId(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <OperationalListFrame actions={<><button type="button" onClick={() => setNewOpen(true)} className={styles.newButton}><Plus />Nova obra</button>{actionError && <OperationalFilters label="Erro na operação"><p role="alert">{actionError}</p></OperationalFilters>}</>} toolbar={<>
          <div className={styles.searchForm}><Search aria-hidden="true" /><input aria-label="Buscar número, obra ou local" value={search} onChange={(event) => resetPage(() => setSearch(event.target.value))} placeholder="Buscar número, obra ou local..." className={styles.searchInput} /></div>
          <OperationalFilters activeCount={[tipo, status, active].filter(value => value !== "Todos").length}><div className={styles.filterFields}>
          <Filter value={tipo} onChange={(value) => resetPage(() => setTipo(value))} options={["Todos", ...tipos]} label="Tipo" /><Filter value={status} onChange={(value) => resetPage(() => setStatus(value))} options={["Todos", ...statusOptions]} label="Status" /><Filter value={active} onChange={(value) => resetPage(() => setActive(value))} options={["Todos", "Ativas", "Inativas"]} label="Situação" />
        </div></OperationalFilters></>} pagination={<OperationalPagination page={activePage} total={filteredObras.length} onPageChange={setPage} />}>
        <OperationalTable columns={columns} preferenceId="obras-projetos" caption="Obras e projetos" emptyMessage="Nenhuma obra encontrada." rows={visibleObras.map(obra => ({ id: obra.id, label: obra.nome, values: { code: obra.numero, name: obra.nome, location: obra.local || "—", type: obra.tipo, status: obra.active ? obra.status : "Inativa" }, actions: <div className={styles.rowActions}><button type="button" onClick={() => setEditing(obra)} className={styles.iconButton} aria-label={`Editar e ver detalhes de ${obra.numero}`}><Pencil /></button><button type="button" onClick={() => handleInactivate(obra)} disabled={!obra.active || inactivatingId === obra.id} className={styles.iconButton} aria-label={`Inativar ${obra.numero}`}>{inactivatingId === obra.id ? "..." : <PowerOff />}</button></div> }))} />
      </OperationalListFrame>
      <ObraSheet open={newOpen} onOpenChange={setNewOpen} />
      {editing && <ObraSheet obra={editing} open onOpenChange={(open) => { if (!open) setEditing(null); }} />}
    </div>
  );
}

function Filter({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: string[]; label: string }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none">{options.map((option) => <option key={option}>{option}</option>)}</select>;
}
