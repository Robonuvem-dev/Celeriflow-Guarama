"use client";

import { useState, type FormEvent } from "react";
import type { InfrastructureServiceRecord as ObrasServico } from "@/lib/contracts/infrastructure";
import { Pencil, Plus, Power, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createServico, inactivateServico, updateServico } from "../actions";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../../patrimonio/_components/operational-columns";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

type SheetMode = "create" | "edit" | null;

const serviceStatuses = ["Aberto", "Em Andamento", "Concluído", "Cancelado"];
const inputClassName = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition-colors focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 dark:border-slate-600 dark:bg-slate-700 dark:text-white";
const columns = operationalColumns([
  ["protocol", "Protocolo", 150, 110, "identifier"], ["service", "Serviço", 300, 160], ["location", "Local", 220, 120],
  ["type", "Tipo", 150, 100], ["status", "Situação", 150, 110, "status"], ["actions", "Ações", 80, 80, "actions", "right"],
]);

export function ServicosUrbanosClient({ servicos }: { servicos: ObrasServico[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);
  const [editingServico, setEditingServico] = useState<ObrasServico | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inactivatingId, setInactivatingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const types = Array.from(new Set(servicos.map((servico) => servico.tipo))).sort();
  const statuses = Array.from(new Set(servicos.map((servico) => servico.status))).sort();
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filteredServicos = servicos.filter((servico) => {
    const matchesQuery = !normalizedQuery || [servico.protocolo, servico.tipo, servico.descricao, servico.local]
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedQuery));
    const matchesType = typeFilter === "all" || servico.tipo === typeFilter;
    const matchesStatus = statusFilter === "all" || servico.status === statusFilter;
    const matchesActive = activeFilter === "all" || (activeFilter === "active" ? servico.active : !servico.active);

    return matchesQuery && matchesType && matchesStatus && matchesActive;
  });
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredServicos.length / PAGE_SIZE)));
  const visibleServicos = filteredServicos.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  function closeSheet() {
    setSheetMode(null);
    setEditingServico(null);
    setFormError(null);
  }

  function openCreateSheet() {
    setEditingServico(null);
    setFormError(null);
    setSheetMode("create");
  }

  function openEditSheet(servico: ObrasServico) {
    setEditingServico(servico);
    setFormError(null);
    setSheetMode("edit");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);

    const formData = new FormData(event.currentTarget);
    const data = {
      protocolo: formData.get("protocolo") as string,
      tipo: formData.get("tipo") as string,
      descricao: formData.get("descricao") as string,
      local: formData.get("local") as string,
    };

    try {
      const result = sheetMode === "edit" && editingServico
        ? await updateServico(editingServico.id, { ...data, status: formData.get("status") as string })
        : await createServico(data);

      if (result.error) {
        setFormError(result.error);
        return;
      }

      closeSheet();
      router.refresh();
    } catch {
      setFormError(sheetMode === "edit" ? "Não foi possível atualizar o serviço." : "Não foi possível cadastrar o serviço.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleInactivate(servico: ObrasServico) {
    if (!window.confirm(`Inativar o serviço ${servico.protocolo}?`)) return;

    setActionError(null);
    setInactivatingId(servico.id);
    try {
      const result = await inactivateServico(servico.id);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setActionError("Não foi possível inativar o serviço.");
    } finally {
      setInactivatingId(null);
    }
  }

  const isEditing = sheetMode === "edit" && editingServico !== null;
  const formStatuses = isEditing && !serviceStatuses.includes(editingServico.status)
    ? [...serviceStatuses, editingServico.status]
    : serviceStatuses;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <OperationalListFrame actions={<><button type="button" onClick={openCreateSheet} className={styles.newButton}><Plus />Novo serviço</button>{actionError && <OperationalFilters label="Erro na operação"><p role="alert">{actionError}</p></OperationalFilters>}</>} toolbar={<>
          <div className={styles.searchForm}>
            <Search aria-hidden="true" />
            <input aria-label="Buscar protocolo, serviço ou local" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} type="search" placeholder="Buscar protocolo, serviço ou local..." className={styles.searchInput} />
          </div>
          <OperationalFilters activeCount={[typeFilter, statusFilter, activeFilter].filter(value => value !== "all").length}><div className={styles.filterFields}>
            <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} aria-label="Filtrar por tipo" className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none">
              <option value="all">Todos os tipos</option>
              {types.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} aria-label="Filtrar por status" className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none">
              <option value="all">Todos os status</option>
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={activeFilter} onChange={(event) => { setActiveFilter(event.target.value); setPage(1); }} aria-label="Filtrar por situação" className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none">
              <option value="all">Ativos e inativos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </div></OperationalFilters>
        </>} pagination={<OperationalPagination page={activePage} total={filteredServicos.length} onPageChange={setPage} />}>
        <OperationalTable columns={columns} preferenceId="obras-servicos-urbanos" caption="Serviços urbanos" emptyMessage="Nenhum serviço encontrado para os filtros selecionados." rows={visibleServicos.map(servico => ({ id: servico.id, label: servico.protocolo, values: {
          protocol: servico.protocolo, service: servico.descricao, location: servico.local, type: servico.tipo, status: servico.active ? servico.status : "Inativo",
        }, actions: <div className={styles.rowActions}><button type="button" onClick={() => openEditSheet(servico)} className={styles.iconButton} aria-label={`Editar ${servico.protocolo}`}><Pencil /></button>{servico.active && <button type="button" onClick={() => handleInactivate(servico)} disabled={inactivatingId === servico.id} className={styles.iconButton} aria-label={`Inativar ${servico.protocolo}`}><Power /></button>}</div> }))} />
      </OperationalListFrame>

      <Sheet open={sheetMode !== null} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent side="right" className="w-[calc(100vw-1rem)] overflow-y-auto sm:w-[34rem]">
          <SheetHeader>
            <SheetTitle>{isEditing ? "Editar Serviço" : "Novo Serviço"}</SheetTitle>
            <SheetDescription>{isEditing ? "Atualize os dados do serviço urbano." : "Registre uma nova solicitação de serviço urbano."}</SheetDescription>
          </SheetHeader>
          <form key={editingServico?.id ?? "new"} onSubmit={handleSubmit} className="space-y-3 p-1 pb-2">
            <div className="space-y-2"><label htmlFor="protocolo" className="text-sm font-medium">Protocolo</label><input id="protocolo" name="protocolo" required defaultValue={editingServico?.protocolo} className={inputClassName} placeholder="Ex.: SU-2026-001" /></div>
            <div className="space-y-2"><label htmlFor="tipo" className="text-sm font-medium">Tipo</label><input id="tipo" name="tipo" required defaultValue={editingServico?.tipo} className={inputClassName} placeholder="Ex.: Limpeza, Pavimentação ou Poda" /></div>
            <div className="space-y-2"><label htmlFor="descricao" className="text-sm font-medium">Descrição</label><textarea id="descricao" name="descricao" required rows={4} defaultValue={editingServico?.descricao} className={inputClassName} placeholder="Descreva o serviço solicitado" /></div>
            <div className="space-y-2"><label htmlFor="local" className="text-sm font-medium">Local</label><input id="local" name="local" required defaultValue={editingServico?.local} className={inputClassName} placeholder="Rua, bairro ou ponto de referência" /></div>
            {isEditing && <div className="space-y-2"><label htmlFor="status" className="text-sm font-medium">Status</label><select id="status" name="status" required defaultValue={editingServico.status} className={inputClassName}>{formStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>}
            {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{formError}</p>}
            <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeSheet} disabled={submitting} className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">Cancelar</button>
              <button type="submit" disabled={submitting} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{submitting ? "Salvando..." : isEditing ? "Salvar alterações" : "Cadastrar serviço"}</button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
