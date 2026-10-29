"use client";

import { useState } from "react";
import { FileText, Plus, FileEdit, Trash2, X, Check, ToggleLeft, ToggleRight } from "lucide-react";
import { updateModelo, deleteModelo, createModelo } from "./actions";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

const columns: OperationalColumn[] = [
  { key: "title", label: "Nome do modelo", type: "text", initialWidth: 260, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "notes", label: "Notas / Descrição", type: "text", initialWidth: 320, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 110, minWidth: 75, resizable: true, sortable: false, details: "overflow" },
  { key: "date", label: "Atualizado em", type: "text", initialWidth: 130, minWidth: 105, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 110, minWidth: 100, maxWidth: 125, resizable: false, sortable: false, details: "none" },
];

type Modelo = {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  updatedAt: Date | string;
};

export default function ModelosClient({ initialModelos }: { initialModelos: Modelo[] }) {
  const [modelos, setModelos] = useState<Modelo[]>(initialModelos);
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", notes: "" });
  const [newForm, setNewForm] = useState({ title: "", notes: "" });
  const [loading, setLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredModels = modelos.filter((modelo) => [modelo.title, modelo.notes, modelo.status].some((value) => value?.toLowerCase().includes(normalizedSearch)));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredModels.length / PAGE_SIZE)));
  const pageModels = filteredModels.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const openEdit = (m: Modelo) => {
    setEditingId(m.id);
    setEditForm({ title: m.title, notes: m.notes || "" });
  };

  const handleSaveEdit = async (id: string) => {
    if (!editForm.title.trim()) return;
    setLoading(id);
    try {
      await updateModelo(id, { title: editForm.title.trim(), notes: editForm.notes || null });
      setModelos((prev) =>
        prev.map((m) => (m.id === id ? { ...m, title: editForm.title.trim(), notes: editForm.notes || null, updatedAt: new Date() } : m))
      );
      setEditingId(null);
    } catch {
      alert("Erro ao salvar");
    } finally {
      setLoading(null);
    }
  };

  const handleToggleStatus = async (m: Modelo) => {
    const newStatus = m.status === "Ativo" ? "Inativo" : "Ativo";
    setLoading(m.id);
    try {
      await updateModelo(m.id, { status: newStatus });
      setModelos((prev) => prev.map((item) => (item.id === m.id ? { ...item, status: newStatus } : item)));
    } catch {
      alert("Erro ao alterar status");
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Excluir o modelo "${title}"?`)) return;
    setLoading(id);
    try {
      await deleteModelo(id);
      setModelos((prev) => prev.filter((m) => m.id !== id));
    } catch {
      alert("Erro ao excluir");
    } finally {
      setLoading(null);
    }
  };

  const handleCreateNew = async () => {
    if (!newForm.title.trim()) return;
    setLoading("new");
    try {
      await createModelo(newForm.title, newForm.notes);
      setNewForm({ title: "", notes: "" });
      setShowNewModal(false);
      // Reload from server (revalidatePath will handle)
    } catch {
      alert("Erro ao criar modelo");
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <OperationalListFrame label="Modelos de documentos" actions={<button onClick={() => setShowNewModal(true)} className={styles.newButton}><Plus />Novo modelo</button>}
        toolbar={<input type="search" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} placeholder="Buscar por nome, descrição ou situação" aria-label="Buscar modelos" className={styles.searchInput} />}
        pagination={<OperationalPagination page={activePage} total={filteredModels.length} onPageChange={setPage} />}>
        <OperationalTable columns={columns} preferenceId="documentos-modelos" caption="Modelos de documentos" emptyMessage="Nenhum modelo encontrado." rows={pageModels.map((modelo) => ({
          id: modelo.id, label: modelo.title,
          values: { title: modelo.title, notes: modelo.notes || "—", status: modelo.status, date: new Date(modelo.updatedAt).toLocaleDateString("pt-BR") },
          cells: editingId === modelo.id ? {
            title: <input aria-label="Nome do modelo" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} className="h-6 w-full rounded border border-indigo-300 px-1" autoFocus />,
            notes: <input aria-label="Descrição do modelo" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Descrição (opcional)" className="h-6 w-full rounded border border-indigo-300 px-1" />,
          } : undefined,
          actions: <div className={styles.rowActions}>
                        {editingId === modelo.id ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(modelo.id)}
                              disabled={loading === modelo.id}
                              className={styles.iconButton} aria-label={`Salvar ${modelo.title}`}
                              title="Salvar"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className={styles.iconButton} aria-label="Cancelar edição"
                              title="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => openEdit(modelo)}
                              className={styles.iconButton} aria-label={`Editar ${modelo.title}`}
                              title="Editar"
                            >
                              <FileEdit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleToggleStatus(modelo)}
                              disabled={loading === modelo.id}
                              className={styles.iconButton} aria-label={`${modelo.status === "Ativo" ? "Inativar" : "Ativar"} ${modelo.title}`}
                              title={modelo.status === "Ativo" ? "Inativar" : "Ativar"}
                            >
                              {modelo.status === "Ativo" ? (
                                <ToggleRight className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <ToggleLeft className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleDelete(modelo.id, modelo.title)}
                              disabled={loading === modelo.id}
                              className={styles.iconButton} aria-label={`Excluir ${modelo.title}`}
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>,
        }))} />
      </OperationalListFrame>

      {/* New Modelo Modal */}
      {showNewModal && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setShowNewModal(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" /> Novo Modelo
              </h2>
              <button onClick={() => setShowNewModal(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Nome do Modelo *</label>
                <input
                  type="text"
                  placeholder="Ex: Ofício de Resposta"
                  value={newForm.title}
                  onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  placeholder="Descrição ou observações"
                  value={newForm.notes}
                  onChange={(e) => setNewForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowNewModal(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleCreateNew}
                disabled={!newForm.title.trim() || loading === "new"}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading === "new" ? "Criando..." : <><Check className="w-4 h-4" /> Criar Modelo</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
