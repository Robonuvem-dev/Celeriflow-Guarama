"use client";

import { useState } from "react";
import { Pencil, Trash2, CheckCircle, XCircle, Plus, AlertCircle } from "lucide-react";
import { createHealthProfessional, updateHealthProfessional, toggleHealthProfessionalStatus, deleteHealthProfessional } from "./actions";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { healthColumn } from "../operational-columns";

type Employee = {
  id: string;
  name: string;
  cpf: string | null;
  registration: string | null;
};

type HealthProfessional = {
  id: string;
  employeeId: string;
  employee: Employee;
  specialty: string | null;
  councilName: string | null;
  councilNumber: string | null;
  isActive: boolean;
};

type HealthProfessionalFormData = {
  employeeId: string;
  specialty: string;
  councilType: string;
  councilNumber: string;
};

const CONSELHOS = ["CRM", "COREN", "CRF", "CRO", "CRN", "CRP", "CREFITO", "CRAS", "Outro"];

export default function ProfissionaisClient({ 
  professionals, 
  employees 
}: { 
  professionals: HealthProfessional[], 
  employees: Employee[]
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<HealthProfessionalFormData>({
    employeeId: "", specialty: "", councilType: "", councilNumber: ""
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [page, setPage] = useState(1);

  const filteredProfs = professionals.filter(p => 
    p.employee?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.specialty && p.specialty.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.councilNumber && p.councilNumber.includes(searchTerm))
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredProfs.length / PAGE_SIZE)));
  const visibleProfs = filteredProfs.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const availableEmployees = employees.filter(e => !professionals.some(prof => prof.employeeId === e.id));

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({ 
      employeeId: availableEmployees[0]?.id || "", 
      specialty: "", 
      councilType: "", 
      councilNumber: "" 
    });
    setErrorMsg("");
    setIsModalOpen(true);
  };

  const openEditModal = (prof: HealthProfessional) => {
    setEditingId(prof.id);
    setFormData({
      employeeId: prof.employeeId,
      specialty: prof.specialty || "",
      councilType: prof.councilName || "",
      councilNumber: prof.councilNumber || ""
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
      res = await updateHealthProfessional(editingId, formData);
    } else {
      res = await createHealthProfessional(formData);
    }

    setIsSaving(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setIsModalOpen(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    if (confirm(`Deseja realmente ${currentStatus ? 'inativar' : 'reativar'} este profissional?`)) {
      const res = await toggleHealthProfessionalStatus(id, !currentStatus);
      if (res.error) alert(res.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja EXCLUIR definitivamente este registro profissional?")) {
      const res = await deleteHealthProfessional(id);
      if (res.error) alert(res.error);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <OperationalListFrame label="Profissionais de saúde" toolbar={<input aria-label="Buscar profissionais" className={styles.searchInput} placeholder="Pesquisar por nome, especialidade ou conselho..." value={searchTerm} onChange={event => { setSearchTerm(event.target.value); setPage(1); }} />} actions={<button type="button" onClick={openCreateModal} className={styles.newButton} aria-label="Novo Profissional" title="Novo Profissional"><Plus aria-hidden="true" /><span className={styles.newLabel}>Novo Profissional</span></button>} pagination={<OperationalPagination page={activePage} total={filteredProfs.length} onPageChange={setPage} />}>
        <OperationalTable preferenceId="saude-profissionais" caption="Profissionais de saúde" columns={[healthColumn("name", "Nome (Servidor)", 280, 130), healthColumn("specialty", "Especialidade", 240, 110), healthColumn("council", "Conselho", 120, 80), healthColumn("number", "Nº Conselho", 140, 90, "identifier"), healthColumn("status", "Status", 100, 80, "status"), healthColumn("actions", "Ações", 84, 84, "actions", "right", 100)]} rows={visibleProfs.map(item => ({ id: item.id, label: item.employee?.name || item.id, values: { name: item.employee?.name || "—", specialty: item.specialty || "—", council: item.councilName || "—", number: item.councilNumber || "—", status: item.isActive ? "Ativo" : "Inativo" }, actions: <div className={styles.rowActions}>
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
                {editingId ? "Editar Profissional" : "Novo Profissional de Saúde"}
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
                {!editingId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Vincular a um Servidor (RH) *</label>
                    <select
                      required
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-white"
                      value={formData.employeeId}
                      onChange={e => setFormData({...formData, employeeId: e.target.value})}
                    >
                      <option value="" disabled>Selecione um Servidor Ativo...</option>
                      {availableEmployees.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.name} {e.registration ? `(Mat: ${e.registration})` : ''}
                        </option>
                      ))}
                    </select>
                    {availableEmployees.length === 0 && (
                      <p className="mt-1 text-xs text-red-500">Não há servidores disponíveis no RH.</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">Especialidade / Cargo na Saúde</label>
                  <input
                    type="text"
                    placeholder="Ex: Médico Clínico Geral"
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                    value={formData.specialty || ''}
                    onChange={e => setFormData({...formData, specialty: e.target.value})}
                  />
                </div>
                
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Tipo Conselho</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-white"
                      value={formData.councilType || ''}
                      onChange={e => setFormData({...formData, councilType: e.target.value})}
                    >
                      <option value="">Nenhum</option>
                      {CONSELHOS.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Nº Conselho</label>
                    <input
                      type="text"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                      value={formData.councilNumber || ''}
                      onChange={e => setFormData({...formData, councilNumber: e.target.value})}
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
                  disabled={isSaving || (!editingId && (!availableEmployees || availableEmployees.length === 0))}
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
