"use client";

import { useState } from "react";
import { Pencil, Trash2, CheckCircle, XCircle, Plus, AlertCircle } from "lucide-react";
import { createHealthUnit, updateHealthUnit, toggleHealthUnitStatus, deleteHealthUnit } from "./actions";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { healthColumn } from "../operational-columns";

type HealthUnit = {
  id: string;
  name: string;
  type: string;
  cnes: string | null;
  phone: string | null;
  isActive: boolean;
};

type HealthUnitFormData = {
  name: string;
  type: string;
  cnes: string;
  phone: string;
};

const UNIT_TYPES = [
  "UBS",
  "UPA",
  "Hospital",
  "Farmácia",
  "CAPS",
  "Centro de Especialidades",
  "Maternidade",
  "Outros"
];

export default function UnidadesClient({ units }: { units: HealthUnit[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<HealthUnitFormData>({
    name: "", type: "UBS", cnes: "", phone: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [page, setPage] = useState(1);

  const filteredUnits = units.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.cnes && u.cnes.includes(searchTerm))
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredUnits.length / PAGE_SIZE)));
  const visibleUnits = filteredUnits.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ name: "", type: "UBS", cnes: "", phone: "" });
    setErrorMsg("");
    setIsModalOpen(true);
  };

  const openEditModal = (unit: HealthUnit) => {
    setEditingId(unit.id);
    setFormData({
      name: unit.name,
      type: unit.type,
      cnes: unit.cnes || "",
      phone: unit.phone || ""
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
      res = await updateHealthUnit(editingId, formData);
    } else {
      res = await createHealthUnit(formData);
    }

    setIsSaving(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setIsModalOpen(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    if (confirm(`Deseja realmente ${currentStatus ? 'inativar' : 'reativar'} esta unidade?`)) {
      const res = await toggleHealthUnitStatus(id, !currentStatus);
      if (res.error) alert(res.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja EXCLUIR definitivamente esta unidade?")) {
      const res = await deleteHealthUnit(id);
      if (res.error) alert(res.error);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <OperationalListFrame label="Unidades de saúde" toolbar={<input aria-label="Buscar unidades" className={styles.searchInput} placeholder="Pesquisar por nome ou CNES..." value={searchTerm} onChange={event => { setSearchTerm(event.target.value); setPage(1); }} />} actions={<button type="button" onClick={openCreateModal} className={styles.newButton} aria-label="Nova Unidade" title="Nova Unidade"><Plus aria-hidden="true" /><span className={styles.newLabel}>Nova Unidade</span></button>} pagination={<OperationalPagination page={activePage} total={filteredUnits.length} onPageChange={setPage} />}>
        <OperationalTable preferenceId="saude-unidades" caption="Unidades de saúde" columns={[healthColumn("name", "Nome", 280, 130), healthColumn("type", "Tipo", 180, 100), healthColumn("cnes", "CNES", 120, 80, "identifier"), healthColumn("phone", "Telefone", 150, 100), healthColumn("status", "Status", 100, 80, "status"), healthColumn("actions", "Ações", 84, 84, "actions", "right", 100)]} rows={visibleUnits.map(item => ({ id: item.id, label: item.name, values: { name: item.name, type: item.type, cnes: item.cnes || "—", phone: item.phone || "—", status: item.isActive ? "Ativa" : "Inativa" }, actions: <div className={styles.rowActions}>
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
                {editingId ? "Editar Unidade" : "Nova Unidade de Saúde"}
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
                  <label className="block text-sm font-medium text-gray-700">Nome da Unidade *</label>
                  <input
                    type="text"
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tipo de Unidade *</label>
                  <select
                    required
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-white"
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                  >
                    {UNIT_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">CNES</label>
                    <input
                      type="text"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                      value={formData.cnes || ''}
                      onChange={e => setFormData({...formData, cnes: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Telefone</label>
                    <input
                      type="text"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                      value={formData.phone || ''}
                      onChange={e => setFormData({...formData, phone: e.target.value})}
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
