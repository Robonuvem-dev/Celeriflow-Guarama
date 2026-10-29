"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createMedicao, inactivateMedicao, updateMedicao } from "../actions";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../../patrimonio/_components/operational-columns";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

type Medicao = {
  id: string;
  numero: number;
  data: string;
  valorMedido: number;
  status: string;
  active: boolean;
  obra: {
    numero: string;
    nome: string;
  };
};

type ObraOption = {
  id: string;
  numero: string;
  nome: string;
  status: string;
};

type FormData = {
  numero: number;
  data: string;
  valorMedido: number;
  obraId: string;
  status: string;
};

const measurementStatuses = ["Em Análise", "Aprovada", "Rejeitada"];
const columns = operationalColumns([
  ["number", "Medição", 110, 85, "identifier"], ["workCode", "Código da obra", 140, 100], ["work", "Obra", 280, 150],
  ["date", "Período", 120, 100], ["value", "Valor", 160, 120, "text", "right"], ["status", "Situação", 150, 100, "status"],
  ["actions", "Ações", 80, 80, "actions", "right"],
]);

function defaultForm(obraId = ""): FormData {
  return {
    numero: 1,
    data: new Date().toISOString().slice(0, 10),
    valorMedido: 0,
    obraId,
    status: "Em Análise",
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string) {
  return value.split("-").reverse().join("/");
}

export default function MedicoesClient({ medicoes, obras }: { medicoes: Medicao[]; obras: ObraOption[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingMedicao, setEditingMedicao] = useState<Medicao | null>(null);
  const [formData, setFormData] = useState<FormData>(() => defaultForm(obras[0]?.id));
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [inactivatingId, setInactivatingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const filteredMedicoes = medicoes.filter((medicao) => {
    const matchesSearch = !normalizedSearch || [
      medicao.numero.toString(),
      medicao.obra.numero,
      medicao.obra.nome,
    ].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
    const matchesStatus = statusFilter === "Todos" || medicao.status === statusFilter;
    const matchesActive = activeFilter === "Todos" || (activeFilter === "Ativas" ? medicao.active : !medicao.active);

    return matchesSearch && matchesStatus && matchesActive;
  });
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredMedicoes.length / PAGE_SIZE)));
  const visibleMedicoes = filteredMedicoes.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  function openCreateSheet() {
    setEditingMedicao(null);
    setFormData(defaultForm(obras[0]?.id));
    setFormError("");
    setSheetOpen(true);
  }

  function openEditSheet(medicao: Medicao) {
    setEditingMedicao(medicao);
    setFormData({
      numero: medicao.numero,
      data: medicao.data,
      valorMedido: medicao.valorMedido,
      obraId: "",
      status: medicao.status,
    });
    setFormError("");
    setSheetOpen(true);
  }

  function handleSheetChange(open: boolean) {
    setSheetOpen(open);
    if (!open) {
      setFormError("");
      setEditingMedicao(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setIsSaving(true);

    try {
      const result = editingMedicao
        ? await updateMedicao(editingMedicao.id, {
            numero: formData.numero,
            data: formData.data,
            valorMedido: formData.valorMedido,
            status: formData.status,
          })
        : await createMedicao({
            numero: formData.numero,
            data: formData.data,
            valorMedido: formData.valorMedido,
            obraId: formData.obraId,
          });

      if (result.error) {
        setFormError(result.error);
        return;
      }

      setSheetOpen(false);
      router.refresh();
    } catch {
      setFormError("Não foi possível salvar a medição.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleInactivate(id: string) {
    if (!window.confirm("Deseja inativar esta medição?")) return;

    setActionError("");
    setInactivatingId(id);
    try {
      const result = await inactivateMedicao(id);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setActionError("Não foi possível inativar a medição.");
    } finally {
      setInactivatingId(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <OperationalListFrame actions={<>
        <button onClick={openCreateSheet} disabled={obras.length === 0} className={styles.newButton}><Plus />Nova medição</button>
        {(actionError || !obras.length) && <OperationalFilters label={actionError ? "Erro na operação" : "Cadastro de obras"}><p role={actionError ? "alert" : "status"}>{actionError || "Cadastre ou ative uma obra para registrar uma medição."}</p></OperationalFilters>}
      </>} toolbar={<>
          <div className={styles.searchForm}>
            <Search aria-hidden="true" />
            <Input
              value={search}
              aria-label="Buscar por obra ou número"
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Buscar por obra ou número..."
              className={styles.searchInput}
            />
          </div>
          <OperationalFilters activeCount={[statusFilter, activeFilter].filter(value => value !== "Todos").length}><div className={styles.filterFields}>
            <select
              value={statusFilter}
              onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
              aria-label="Filtrar por status da medição"
              className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none"
            >
              <option value="Todos">Todos os status</option>
              {measurementStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
            <select
              value={activeFilter}
              onChange={(event) => { setActiveFilter(event.target.value); setPage(1); }}
              aria-label="Filtrar por situação da medição"
              className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none"
            >
              <option value="Todos">Ativas e inativas</option>
              <option value="Ativas">Ativas</option>
              <option value="Inativas">Inativas</option>
            </select>
          </div></OperationalFilters>
        </>} pagination={<OperationalPagination page={activePage} total={filteredMedicoes.length} onPageChange={setPage} />}>
        <OperationalTable columns={columns} preferenceId="obras-medicoes" caption="Medições de obras" emptyMessage="Nenhuma medição encontrada." rows={visibleMedicoes.map(medicao => ({ id: medicao.id, label: `Medição ${medicao.numero}`, values: {
          number: `Nº ${medicao.numero}`, workCode: medicao.obra.numero, work: medicao.obra.nome, date: formatDate(medicao.data), value: formatCurrency(medicao.valorMedido), status: medicao.active ? medicao.status : "Inativa",
        }, actions: <div className={styles.rowActions}><button type="button" className={styles.iconButton} onClick={() => openEditSheet(medicao)} aria-label={`Editar medição ${medicao.numero}`}><Pencil /></button><button type="button" className={styles.iconButton} onClick={() => handleInactivate(medicao.id)} disabled={!medicao.active || inactivatingId === medicao.id} aria-label={`Inativar medição ${medicao.numero}`}><Ban /></button></div> }))} />
      </OperationalListFrame>

      <Sheet open={sheetOpen} onOpenChange={handleSheetChange}>
        <SheetContent className="w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-[34rem]">
          <SheetHeader>
            <SheetTitle>{editingMedicao ? "Editar medição" : "Nova medição"}</SheetTitle>
            <SheetDescription>
              {editingMedicao ? "Atualize os dados da medição selecionada." : "Registre uma medição para uma obra ativa."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3 px-1 pb-2">
            {formError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{formError}</p>}
            {!editingMedicao && (
              <div className="space-y-2">
                <Label htmlFor="obraId">Obra</Label>
                <select
                  id="obraId"
                  value={formData.obraId}
                  onChange={(event) => setFormData({ ...formData, obraId: event.target.value })}
                  required
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                >
                  <option value="" disabled>Selecione uma obra</option>
                  {obras.map((obra) => <option key={obra.id} value={obra.id}>{obra.numero} - {obra.nome} ({obra.status})</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numero">Número</Label>
                <Input id="numero" type="number" min="1" required value={formData.numero} onChange={(event) => setFormData({ ...formData, numero: Number(event.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="data">Data</Label>
                <Input id="data" type="date" required value={formData.data} onChange={(event) => setFormData({ ...formData, data: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorMedido">Valor medido (R$)</Label>
              <Input id="valorMedido" type="number" min="0" step="0.01" required value={formData.valorMedido} onChange={(event) => setFormData({ ...formData, valorMedido: Number(event.target.value) })} />
            </div>
            {editingMedicao && (
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(event) => setFormData({ ...formData, status: event.target.value })}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                >
                  {measurementStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            )}
            <SheetFooter className="mt-auto px-0">
              <Button type="button" variant="outline" onClick={() => handleSheetChange(false)} disabled={isSaving}>Cancelar</Button>
              <Button type="submit" disabled={isSaving}>{isSaving ? "Salvando..." : editingMedicao ? "Salvar alterações" : "Cadastrar medição"}</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
