"use client";

import { useState } from "react";
import { Pencil, Trash2, CheckCircle, XCircle, Plus, AlertCircle } from "lucide-react";
import { createHealthTeam, updateHealthTeam, toggleHealthTeamStatus, deleteHealthTeam } from "./actions";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { healthColumn } from "../operational-columns";

type HealthUnit = {
  id: string;
  name: string;
};

type HealthTeam = {
  id: string;
  name: string;
  code: string | null;
  microarea: string | null;
  unitId: string;
  unit: HealthUnit;
  isActive: boolean;
};

type HealthTeamFormData = {
  name: string;
  code: string;
  microarea: string;
  unitId: string;
};

export default function EquipesClient({ teams, units }: { teams: HealthTeam[], units: HealthUnit[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<HealthTeamFormData>({
    name: "", code: "", microarea: "", unitId: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [page, setPage] = useState(1);

  const filteredTeams = teams.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (t.code && t.code.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredTeams.length / PAGE_SIZE)));
  const visibleTeams = filteredTeams.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ name: "", code: "", microarea: "", unitId: units[0]?.id || "" });
    setErrorMsg("");
    setIsModalOpen(true);
  };

  const openEditModal = (team: HealthTeam) => {
    setEditingId(team.id);
    setFormData({
      name: team.name,
      code: team.code ?? "",
      microarea: team.microarea || "",
      unitId: team.unitId
    });
    setErrorMsg("");
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg("");

    let res;
    if (editingId) {
      res = await updateHealthTeam(editingId, formData);
    } else {
      res = await createHealthTeam(formData);
    }

    setIsSaving(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setIsModalOpen(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    if (confirm(`Deseja realmente ${currentStatus ? 'inativar' : 'reativar'} esta equipe?`)) {
      const res = await toggleHealthTeamStatus(id, !currentStatus);
      if (res.error) alert(res.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja EXCLUIR definitivamente esta equipe?")) {
      const res = await deleteHealthTeam(id);
      if (res.error) alert(res.error);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <OperationalListFrame label="Equipes ESF" toolbar={<input aria-label="Buscar equipes" className={styles.searchInput} placeholder="Pesquisar por nome ou código..." value={searchTerm} onChange={event => { setSearchTerm(event.target.value); setPage(1); }} />} actions={<button type="button" onClick={openCreateModal} className={styles.newButton} aria-label="Nova Equipe" title="Nova Equipe"><Plus aria-hidden="true" /><span className={styles.newLabel}>Nova Equipe</span></button>} pagination={<OperationalPagination page={activePage} total={filteredTeams.length} onPageChange={setPage} />}>
        <OperationalTable preferenceId="saude-equipes" caption="Equipes ESF" columns={[healthColumn("name", "Nome da equipe", 260, 130), healthColumn("code", "Código", 120, 80, "identifier"), healthColumn("microarea", "Microárea", 150, 90), healthColumn("unit", "Unidade", 240, 110), healthColumn("status", "Status", 100, 80, "status"), healthColumn("actions", "Ações", 84, 84, "actions", "right", 100)]} rows={visibleTeams.map(item => ({ id: item.id, label: item.name, values: { name: item.name, code: item.code || "—", microarea: item.microarea || "—", unit: item.unit?.name || "—", status: item.isActive ? "Ativa" : "Inativa" }, actions: <div className={styles.rowActions}>
                    <button onClick={() => openEditModal(item)} className="text-gray-400 hover:text-emerald-600 p-1 rounded hover:bg-emerald-50" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    {item.isActive ? (
                      <button onClick={() => handleToggleStatus(item.id, true)} className="text-gray-400 hover:text-orange-600 p-1 rounded hover:bg-orange-50" title="Inativar">
                        <XCircle className="h-4 w-4" />
                      </button>
                    ) : (
                      <button onClick={() => handleToggleStatus(item.id, false)} className="text-gray-400 hover:text-green-600 p-1 rounded hover:bg-green-50" title="Reativar">
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => handleDelete(item.id)} className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50" title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div> }))} />
      </OperationalListFrame>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50 p-4">
          <div className="my-4 w-full max-w-md overflow-hidden rounded-md bg-white shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">
                {editingId ? "Editar Equipe" : "Nova Equipe ESF"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <span className="sr-only">Fechar</span>
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6">
              {errorMsg && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md flex items-center gap-2 text-sm">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <p>{errorMsg}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Unidade Vinculada *</label>
                  <select
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-white"
                    value={formData.unitId}
                    onChange={e => setFormData({...formData, unitId: e.target.value})}
                  >
                    <option value="" disabled>Selecione uma unidade</option>
                    {units.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Nome da Equipe *</label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Código *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: ESF-01"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                      value={formData.code || ''}
                      onChange={e => setFormData({...formData, code: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Microárea</label>
                    <input
                      type="text"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                      value={formData.microarea || ''}
                      onChange={e => setFormData({...formData, microarea: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none disabled:opacity-50"
                >
                  {isSaving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
