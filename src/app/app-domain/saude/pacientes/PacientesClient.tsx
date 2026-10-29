"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, CheckCircle, XCircle, Plus, Search, AlertCircle } from "lucide-react";
import { createPatient, updatePatient, togglePatientStatus, deletePatient } from "./actions";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { healthColumn } from "../operational-columns";

type Person = {
  id: string;
  fullName: string;
  cpf: string | null;
  birthDate: Date | null;
  gender: string | null; raceColor: string | null; motherName: string | null; fatherName: string | null;
  phonePrimary: string | null; whatsapp: string | null; email: string | null; profession: string | null;
};

type HealthUnit = {
  id: string;
  name: string;
};

type HealthTeam = {
  id: string;
  name: string;
  unitId: string;
};

type Patient = {
  id: string;
  personId: string;
  person: Person;
  cns: string | null;
  bloodType: string | null;
  bloodDonor: boolean | null;
  referenceUnitId: string | null;
  teamId: string | null;
  status: string;
};

type PatientFormData = {
  registrationStage: "PRE" | "COMPLETE";
  motherUnknown: boolean;
  fatherUnknown: boolean;
  personId: string;
  cns: string;
  bloodType: string;
  bloodDonor: boolean | null;
  referenceUnitId: string;
  teamId: string;
  fullName: string;
  cpf: string;
  birthDate: string;
  gender: string; raceColor: string; motherName: string; fatherName: string;
  phonePrimary: string; whatsapp: string; email: string; profession: string;
};

const personalFields = [["gender", "Sexo"], ["raceColor", "Raça/cor"], ["motherName", "Nome da mãe"], ["fatherName", "Nome do pai"], ["phonePrimary", "Telefone"], ["whatsapp", "Celular"], ["email", "E-mail"], ["profession", "Ocupação"]] as const;
function personalValues(person?: Person) { return { gender: person?.gender || "", raceColor: person?.raceColor || "", motherName: person?.motherName || "", fatherName: person?.fatherName || "", phonePrimary: person?.phonePrimary || "", whatsapp: person?.whatsapp || "", email: person?.email || "", profession: person?.profession || "" }; }

function formatCPF(cpf: string | null | undefined) {
  if (!cpf) return '-';
  let clean = cpf.replace(/\D/g, '');
  if (clean.length > 0 && clean.length <= 11) {
    clean = clean.padStart(11, '0');
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf;
}

function formatCNS(cns: string | null | undefined) {
  if (!cns) return '-';
  let clean = cns.replace(/\D/g, '');
  if (clean.length > 0 && clean.length <= 15) {
    clean = clean.padStart(15, '0');
    return clean.replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4');
  }
  return cns;
}

export default function PacientesClient({ 
  patients, 
  people, 
  units, 
  teams 
}: { 
  patients: Patient[], 
  people: Person[], 
  units: HealthUnit[], 
  teams: HealthTeam[] 
}) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [birthFilter, setBirthFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNewPerson, setIsNewPerson] = useState(false);
  const [formData, setFormData] = useState<PatientFormData>({
    registrationStage: "PRE", motherUnknown: false, fatherUnknown: false, personId: "", cns: "", bloodType: "", bloodDonor: null, referenceUnitId: "", teamId: "", fullName: "", cpf: "", birthDate: "", ...personalValues()
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [page, setPage] = useState(1);

  const filteredPatients = patients.filter(p => (!birthFilter || p.person.birthDate?.toISOString().slice(0, 10) === birthFilter) && (!genderFilter || p.person.gender === genderFilter) && (
    p.person?.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.person?.cpf && p.person.cpf.includes(searchTerm)) ||
    (p.cns && p.cns.includes(searchTerm))
  ));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredPatients.length / PAGE_SIZE)));
  const visiblePatients = filteredPatients.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const availablePeople = people.filter(p => !patients.some(pat => pat.personId === p.id));

  // Filtra as equipes baseadas na unidade selecionada no form
  const availableTeams = formData.referenceUnitId 
    ? teams.filter(t => t.unitId === formData.referenceUnitId)
    : teams;

  const openCreateModal = () => {
    setEditingId(null);
    setIsNewPerson(false);
    setFormData({
      registrationStage: "PRE", motherUnknown: false, fatherUnknown: false,
      personId: availablePeople[0]?.id || "",
      cns: "",
      bloodType: "",
      bloodDonor: null,
      referenceUnitId: "",
      teamId: "",
      fullName: "",
      cpf: "",
      birthDate: "", ...personalValues()
    });
    setErrorMsg("");
    setIsModalOpen(true);
  };

  const openEditModal = (patient: Patient) => {
    router.push(`/saude/pacientes/${encodeURIComponent(patient.id)}`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg("");

    let res;
    if (editingId) {
      res = await updatePatient(editingId, formData);
    } else {
      const dataToSubmit = { ...formData };
      if (isNewPerson) {
        dataToSubmit.personId = "";
      }
      res = await createPatient(dataToSubmit);
    }

    setIsSaving(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setIsModalOpen(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    if (confirm(`Deseja realmente alterar o status deste paciente?`)) {
      const res = await togglePatientStatus(id, currentStatus);
      if (res.error) alert(res.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Deseja EXCLUIR definitivamente este registro de paciente?")) {
      const res = await deletePatient(id);
      if (res.error) alert(res.error);
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Barra de Ações e Busca */}
      <OperationalListFrame label="Pacientes" toolbar={<>
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            aria-label="Buscar pacientes"
            className={`${styles.searchInput} block w-full pl-10!`}
            placeholder="Pesquisar por nome, CPF ou CNS..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
          />
        </div>
        <OperationalHeaderActions><button
          onClick={openCreateModal}
          className="inline-flex h-9 items-center justify-center rounded-md border border-transparent bg-emerald-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Paciente
        </button></OperationalHeaderActions>

      <OperationalFilters activeCount={Number(Boolean(birthFilter)) + Number(Boolean(genderFilter))}><div className={styles.filterFields}><label>Nascimento<input type="date" value={birthFilter} onChange={event => { setBirthFilter(event.target.value); setPage(1); }} /></label><label>Sexo<select value={genderFilter} onChange={event => { setGenderFilter(event.target.value); setPage(1); }}><option value="">Todos</option>{[...new Set(patients.flatMap(patient => patient.person.gender ? [patient.person.gender] : []))].sort().map(gender => <option key={gender}>{gender}</option>)}</select></label><button onClick={() => { setBirthFilter(""); setGenderFilter(""); setPage(1); }}>Limpar filtros</button></div></OperationalFilters>

      </>} pagination={<OperationalPagination page={activePage} total={filteredPatients.length} onPageChange={setPage} />}>
        <OperationalTable preferenceId="saude-pacientes" caption="Pacientes" columns={[healthColumn("name", "Nome", 300, 130), healthColumn("cpf", "CPF", 160, 120, "identifier"), healthColumn("cns", "CNS", 190, 140, "identifier"), healthColumn("birth", "Data Nasc.", 120, 92), healthColumn("status", "Status", 100, 80, "status"), healthColumn("actions", "Ações", 84, 84, "actions", "right", 100)]} rows={visiblePatients.map(item => ({ id: item.id, label: item.person.fullName, values: { name: item.person.fullName, cpf: formatCPF(item.person.cpf), cns: formatCNS(item.cns), birth: item.person.birthDate ? new Date(item.person.birthDate).toLocaleDateString("pt-BR") : "—", status: item.status }, actions: <div className={styles.rowActions}>
                    <button onClick={() => openEditModal(item)} className="text-gray-400 hover:text-emerald-600 p-1 rounded hover:bg-emerald-50" title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    {item.status === 'Ativo' ? (
                      <button onClick={() => handleToggleStatus(item.id, item.status)} className="text-gray-400 hover:text-orange-600 p-1 rounded hover:bg-orange-50" title="Inativar">
                        <XCircle className="h-4 w-4" />
                      </button>
                    ) : (
                      <button onClick={() => handleToggleStatus(item.id, item.status)} className="text-gray-400 hover:text-green-600 p-1 rounded hover:bg-green-50" title="Reativar">
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
          <div className="my-4 w-full max-w-2xl overflow-hidden rounded-md bg-white shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">
                {editingId ? "Editar Paciente" : "Novo Paciente"}
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
                <label className="grid gap-1 text-sm">Etapa cadastral<select value={formData.registrationStage} onChange={event => setFormData({ ...formData, registrationStage: event.target.value as "PRE" | "COMPLETE" })} className="h-9 rounded border bg-white px-3"><option value="PRE">Pré-cadastro</option><option value="COMPLETE">Cadastro completo</option></select></label>
                {/* Seleção de Pessoa (Somente na criação) */}
                {!editingId && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                      <span className="text-sm font-medium text-gray-700">Dados do Paciente</span>
                      <label className="flex items-center text-sm text-emerald-700 cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="mr-2 rounded text-emerald-600 focus:ring-emerald-500"
                          checked={isNewPerson}
                          onChange={(e) => setIsNewPerson(e.target.checked)}
                        />
                        Cadastrar nova Pessoa Física
                      </label>
                    </div>

                    {!isNewPerson ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Vincular a uma Pessoa Cadastrada *</label>
                        <select
                          required
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-white"
                          value={formData.personId}
                          onChange={e => setFormData({...formData, personId: e.target.value})}
                        >
                          <option value="" disabled>Selecione um Cidadão do Cadastro Base...</option>
                          {availablePeople.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.fullName} {p.cpf ? `(CPF: ${formatCPF(p.cpf)})` : ''}
                            </option>
                          ))}
                        </select>
                        {availablePeople.length === 0 && (
                          <p className="mt-1 text-xs text-red-500">Não há cidadãos disponíveis no cadastro que já não sejam pacientes.</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3 bg-gray-50 p-3 rounded-md border border-gray-200">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Nome Completo *</label>
                          <input
                            type="text"
                            required
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                            value={formData.fullName || ''}
                            onChange={e => setFormData({...formData, fullName: e.target.value})}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">CPF</label>
                            <input
                              type="text"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                              value={formData.cpf || ''}
                              onChange={e => setFormData({...formData, cpf: e.target.value})}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Data de Nascimento</label>
                            <input
                              type="date"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                              value={formData.birthDate || ''}
                              onChange={e => setFormData({...formData, birthDate: e.target.value})}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  {editingId && <fieldset className="grid gap-3 rounded border p-3 sm:col-span-2"><legend className="text-sm font-semibold">Dados do cadastro único</legend><label className="grid gap-1 text-sm">Nome completo<input required value={formData.fullName} onChange={event => setFormData({ ...formData, fullName: event.target.value })} className="h-9 rounded border px-3" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">CPF<input required value={formData.cpf} onChange={event => setFormData({ ...formData, cpf: event.target.value })} className="h-9 rounded border px-3" /></label><label className="grid gap-1 text-sm">Nascimento<input type="date" value={formData.birthDate} onChange={event => setFormData({ ...formData, birthDate: event.target.value })} className="h-9 rounded border px-3" /></label></div></fieldset>}
                  {(editingId || isNewPerson) && personalFields.map(([field, label]) => <label key={field} className="grid gap-1 text-sm font-medium">{label}<input type={field === "email" ? "email" : field === "phonePrimary" || field === "whatsapp" ? "tel" : "text"} value={formData[field]} onChange={event => setFormData({ ...formData, [field]: event.target.value })} className="h-9 rounded border px-3 font-normal" /></label>)}
                  {isNewPerson && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.motherUnknown} onChange={event => setFormData({ ...formData, motherUnknown: event.target.checked })} /> Filiação materna desconhecida</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.fatherUnknown} onChange={event => setFormData({ ...formData, fatherUnknown: event.target.checked })} /> Filiação paterna desconhecida</label></>}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">CNS (Cartão SUS)</label>
                    <input
                      type="text"
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                      value={formData.cns || ''}
                      onChange={e => setFormData({...formData, cns: e.target.value})}
                      placeholder="000 0000 0000 0000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Tipo Sanguíneo</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-white"
                      value={formData.bloodType || ''}
                      onChange={e => setFormData({...formData, bloodType: e.target.value})}
                    >
                      <option value="">Não informado</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.bloodDonor === true}
                      onChange={e => setFormData({ ...formData, bloodDonor: e.target.checked })}
                    />
                    Doador de sangue
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Unidade de Saúde Referência</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-white"
                      value={formData.referenceUnitId || ''}
                      onChange={e => {
                        setFormData({
                          ...formData, 
                          referenceUnitId: e.target.value,
                          teamId: "" // resetar equipe ao mudar unidade
                        })
                      }}
                    >
                      <option value="">Selecione...</option>
                      {units.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Equipe ESF Referência</label>
                    <select
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm bg-white"
                      value={formData.teamId || ''}
                      onChange={e => setFormData({...formData, teamId: e.target.value})}
                      disabled={!formData.referenceUnitId}
                    >
                      <option value="">Selecione...</option>
                      {availableTeams.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
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
                  disabled={isSaving || (!editingId && !isNewPerson && availablePeople.length === 0)}
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
