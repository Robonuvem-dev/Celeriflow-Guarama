"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Crown, Edit, Plus, Trash2, Users } from "lucide-react";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { saveConsorcio, deleteConsorcio } from "./actions";

export type SupplierChoice = {
  id: string;
  name: string;
  document: string;
};

export type ConsorcioItem = {
  id: string;
  code: string;
  name: string;
  exercicio: string;
  numeroConsorcio: string;
  cnpj: string;
  dataCadastro: string;
  dataEncerramento: string;
  ramo: string;
  liderConsorcioId: string;
  liderNome: string;
  percentualLider: string;
  fornecedoresIds: string[];
  fornecedoresNomes: string[];
  emailTelefone: string;
  registroOrgao: string;
};

const columns: OperationalColumn[] = [
  { key: "code", label: "Número/Código", initialWidth: 140, minWidth: 100, maxWidth: 180, type: "identifier", resizable: true, sortable: false, details: "none" },
  { key: "name", label: "Consórcio", initialWidth: 240, minWidth: 160, maxWidth: 360, type: "text", resizable: true, sortable: false, details: "overflow" },
  { key: "exercicio", label: "Exercício", initialWidth: 90, minWidth: 80, maxWidth: 110, type: "text", resizable: true, sortable: false, details: "none" },
  { key: "ramo", label: "Ramo de Atividade", initialWidth: 160, minWidth: 120, maxWidth: 220, type: "text", resizable: true, sortable: false, details: "none" },
  { key: "lider", label: "Empresa Líder", initialWidth: 200, minWidth: 140, maxWidth: 280, type: "text", resizable: true, sortable: false, details: "overflow" },
  { key: "membersCount", label: "Integrantes", initialWidth: 100, minWidth: 85, maxWidth: 120, type: "text", resizable: true, sortable: false, details: "none" },
  { key: "vigencia", label: "Cadastro / Encerramento", initialWidth: 180, minWidth: 140, maxWidth: 220, type: "text", resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", initialWidth: 100, minWidth: 90, maxWidth: 120, type: "actions", resizable: false, sortable: false, details: "none", align: "right" },
];

export function ConsorciosClient({
  consorcios,
  suppliers,
  canManage,
}: {
  consorcios: ConsorcioItem[];
  suppliers: SupplierChoice[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [exercicioFilter, setExercicioFilter] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ConsorcioItem | null>(null);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [liderId, setLiderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const exercicios = Array.from(new Set(consorcios.map((c) => c.exercicio).filter(Boolean))).sort().reverse();

  const term = search.trim().toLowerCase();
  const filtered = consorcios.filter((item) => {
    if (term) {
      const match =
        item.code.toLowerCase().includes(term) ||
        item.name.toLowerCase().includes(term) ||
        item.ramo.toLowerCase().includes(term) ||
        item.liderNome.toLowerCase().includes(term) ||
        item.fornecedoresNomes.some((n) => n.toLowerCase().includes(term));
      if (!match) return false;
    }
    if (exercicioFilter && item.exercicio !== exercicioFilter) return false;
    return true;
  });

  const total = filtered.length;
  const activePage = Math.min(page, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const pageRows = filtered.slice(
    (activePage - 1) * OPERATIONAL_PAGE_SIZE,
    activePage * OPERATIONAL_PAGE_SIZE
  );

  function openCreate() {
    setEditingItem(null);
    setSelectedSupplierIds([]);
    setLiderId("");
    setErrorMsg("");
    setModalOpen(true);
  }

  function openEdit(item: ConsorcioItem) {
    setEditingItem(item);
    setSelectedSupplierIds(item.fornecedoresIds);
    setLiderId(item.liderConsorcioId);
    setErrorMsg("");
    setModalOpen(true);
  }

  function toggleSupplier(supplierId: string) {
    setSelectedSupplierIds((prev) => {
      const exists = prev.includes(supplierId);
      const updated = exists ? prev.filter((id) => id !== supplierId) : [...prev, supplierId];
      if (exists && liderId === supplierId) {
        setLiderId(updated[0] || "");
      } else if (!exists && updated.length === 1) {
        setLiderId(supplierId);
      }
      return updated;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrorMsg("");
    const formData = new FormData(e.currentTarget);
    formData.set("fornecedores", selectedSupplierIds.join(","));
    formData.set("liderConsorcioId", liderId);

    const res = await saveConsorcio(formData);
    setBusy(false);
    if (!res.success) {
      setErrorMsg(res.error || "Erro ao salvar consórcio");
      return;
    }
    setModalOpen(false);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja remover este consórcio?")) return;
    setBusy(true);
    const res = await deleteConsorcio(id);
    setBusy(false);
    if (!res.success) {
      alert(res.error || "Erro ao excluir consórcio");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <OperationalListFrame
        label="Consórcios entre Empresas (CF16 — 16.32)"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/compras/contratos" className={styles.dialogButton}>
              ← Voltar aos Contratos
            </Link>
            {canManage && (
              <Button size="sm" onClick={openCreate} className="bg-sky-900 text-white hover:bg-sky-800">
                <Plus className="size-3.5 mr-1" />
                Novo Consórcio
              </Button>
            )}
          </div>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Buscar consórcio"
              className={styles.searchInput}
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por número, nome, ramo ou fornecedor integrante…"
            />
            <select
              aria-label="Filtrar por exercício"
              value={exercicioFilter}
              onChange={(e) => {
                setExercicioFilter(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded border border-slate-300 px-2 text-xs"
            >
              <option value="">Todos os exercícios</option>
              {exercicios.map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
          </div>
        }
        pagination={<OperationalPagination page={activePage} total={total} onPageChange={setPage} />}
      >
        <OperationalTable
          columns={columns}
          preferenceId="compras.contratos.consorcios"
          caption="Cadastro oficial de consórcios entre empresas participantes de licitações e contratos"
          emptyMessage="Nenhum consórcio cadastrado até o momento."
          rows={pageRows.map((row) => ({
            id: row.id,
            label: row.name,
            values: {
              code: row.code,
              name: row.name,
              exercicio: row.exercicio,
              ramo: row.ramo || "Geral",
              lider: row.liderNome
                ? `${row.liderNome}${row.percentualLider ? ` (${row.percentualLider}%)` : ""}`
                : "Não definido",
              membersCount: `${row.fornecedoresIds.length} empresa(s)`,
              vigencia: `${row.dataCadastro || "—"} a ${row.dataEncerramento || "Vigente"}`,
            },
            actions: (
              <div className={styles.rowActions}>
                {canManage && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(row)}
                      title="Editar consórcio"
                      className="size-7"
                    >
                      <Edit className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(row.id)}
                      title="Excluir consórcio"
                      className="size-7 text-rose-600 hover:text-rose-800"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ),
          }))}
        />
      </OperationalListFrame>

      {/* Modal de Criação / Edição do Consórcio */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Building2 className="size-5 text-sky-800" />
              {editingItem ? "Editar Consórcio de Empresas" : "Cadastrar Consórcio de Empresas (CF16 — 16.32)"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Informe os dados do consórcio, selecione as empresas integrantes e defina formalmente a líder do consórcio.
            </DialogDescription>
          </DialogHeader>

          {errorMsg && (
            <div className="rounded border border-rose-300 bg-rose-50 p-2 text-xs font-semibold text-rose-800">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 pt-1 text-xs">
            {editingItem && <input type="hidden" name="id" value={editingItem.id} />}

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="font-semibold block mb-1">Exercício (Ano)*</label>
                <input
                  required
                  type="number"
                  name="exercicio"
                  defaultValue={editingItem?.exercicio || new Date().getFullYear()}
                  className="w-full rounded border p-2"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Número do Consórcio*</label>
                <input
                  required
                  name="numeroConsorcio"
                  defaultValue={editingItem?.numeroConsorcio || ""}
                  placeholder="Ex.: CONS-01/2026"
                  className="w-full rounded border p-2"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">CNPJ do Consórcio</label>
                <input
                  name="cnpj"
                  defaultValue={editingItem?.cnpj || ""}
                  placeholder="00.000.000/0001-00"
                  className="w-full rounded border p-2"
                />
              </div>
            </div>

            <div>
              <label className="font-semibold block mb-1">Nome / Designação do Consórcio*</label>
              <input
                required
                name="name"
                defaultValue={editingItem?.name || ""}
                placeholder="Ex.: Consórcio Construtor Guaramá"
                className="w-full rounded border p-2 text-sm"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="font-semibold block mb-1">Data de Cadastro*</label>
                <input
                  required
                  type="date"
                  name="dataCadastro"
                  defaultValue={editingItem?.dataCadastro || new Date().toISOString().slice(0, 10)}
                  className="w-full rounded border p-2"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Data de Encerramento</label>
                <input
                  type="date"
                  name="dataEncerramento"
                  defaultValue={editingItem?.dataEncerramento || ""}
                  className="w-full rounded border p-2"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Ramo de Atividade</label>
                <input
                  name="ramo"
                  defaultValue={editingItem?.ramo || ""}
                  placeholder="Ex.: Engenharia Civil / TI"
                  className="w-full rounded border p-2"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="font-semibold block mb-1">E-mail e Telefone de Contato</label>
                <input
                  name="emailTelefone"
                  defaultValue={editingItem?.emailTelefone || ""}
                  placeholder="contato@consorcio.com.br · (45) 3000-0000"
                  className="w-full rounded border p-2"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Registro no Órgão Competente (Junta/Cartório)</label>
                <input
                  name="registroOrgao"
                  defaultValue={editingItem?.registroOrgao || ""}
                  placeholder="Ex.: Junta Comercial PR - Reg. 123456"
                  className="w-full rounded border p-2"
                />
              </div>
            </div>

            {/* Seleção de Fornecedores Integrantes */}
            <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Users className="size-4 text-sky-800" />
                  Empresas / Fornecedores Consorciados ({selectedSupplierIds.length} selecionados)
                </span>
                <span className="text-[11px] text-slate-500">Selecione as consorciadas abaixo</span>
              </div>

              <div className="max-h-48 overflow-y-auto rounded border bg-white p-2 divide-y">
                {suppliers.map((s) => {
                  const checked = selectedSupplierIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-50 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSupplier(s.id)}
                          className="rounded text-sky-900"
                        />
                        <span className="font-medium text-slate-800">{s.name}</span>
                        <span className="text-slate-400 text-[11px]">{s.document}</span>
                      </div>
                      {checked && liderId === s.id && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          <Crown className="size-3 text-amber-600" />
                          Líder
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Definição do Líder */}
              <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t">
                <div>
                  <label className="font-semibold block mb-1 text-slate-800">
                    Definir Líder do Consórcio* (CF16 — 16.32)
                  </label>
                  <select
                    value={liderId}
                    onChange={(e) => setLiderId(e.target.value)}
                    className="w-full rounded border p-2 bg-white"
                  >
                    <option value="">Selecione a empresa líder...</option>
                    {selectedSupplierIds.map((id) => {
                      const sup = suppliers.find((s) => s.id === id);
                      return (
                        <option key={id} value={id}>
                          👑 {sup?.name || id}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-slate-800">
                    Percentual de Participação da Líder (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    name="percentualLider"
                    defaultValue={editingItem?.percentualLider || "51"}
                    placeholder="Ex.: 51.00"
                    className="w-full rounded border p-2 bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy} className="bg-sky-900 text-white hover:bg-sky-800">
                {busy ? "Salvando..." : "Salvar Consórcio"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
