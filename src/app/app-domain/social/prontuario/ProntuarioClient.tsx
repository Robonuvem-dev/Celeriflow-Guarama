"use client";

import { useState } from "react";
import { FileText, Search, ClipboardList, SearchCode, HeartHandshake } from "lucide-react";
import { createAttendance, updateAttendance, toggleAttendanceStatus } from "../actions";
import { searchCadUnicoAction, saveRmaRecordAction } from "./cadunico-actions";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { SocialOperationalList } from "../OperationalList";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Family = { id: string; familyCode: string | null; nis: string | null };
type Person = { id: string; fullName: string };
type Professional = { id: string; name: string };
type SocialUnit = { id: string; name: string };
type Attendance = {
  id: string;
  date: Date;
  familyId: string;
  personId: string | null;
  unitId: string;
  professionalId: string;
  type: string;
  description: string;
  secrecyLevel: string;
  isActive: boolean;
  family: Family;
  person: Person | null;
  unit: SocialUnit;
};
type AttendanceFormData = {
  familyId: string;
  personId: string;
  unitId: string;
  professionalId: string;
  type: string;
  description: string;
  secrecyLevel: string;
};

export default function ProntuarioClient({ atendimentosInicial, familias, persons, professionals, units }: {
  atendimentosInicial: Attendance[];
  familias: Family[];
  persons: Person[];
  professionals: Professional[];
  units: SocialUnit[];
}) {
  const [atendimentos, setAtendimentos] = useState<Attendance[]>(atendimentosInicial);
  const [search, setSearch] = useState("");
  const [secrecyFilter, setSecrecyFilter] = useState("Todos");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAtendimento, setEditingAtendimento] = useState<Attendance | null>(null);

  // Estados para consulta CadÚnico
  const [searchNis, setSearchNis] = useState("");
  const [cadUnicoResult, setCadUnicoResult] = useState<Awaited<ReturnType<typeof searchCadUnicoAction>>["data"] | null>(null);
  const [cadLoading, setCadLoading] = useState(false);
  const [rmaSuccessMsg, setRmaSuccessMsg] = useState<string | null>(null);
  const [cadOpen, setCadOpen] = useState(false);
  
  const [formData, setFormData] = useState<AttendanceFormData>({
    familyId: "",
    personId: "",
    unitId: "",
    professionalId: "",
    type: "Acolhimento",
    description: "",
    secrecyLevel: "Normal"
  });

  async function handleSearchCadUnico(e: React.FormEvent) {
    e.preventDefault();
    setCadLoading(true);
    setCadUnicoResult(null);
    setRmaSuccessMsg(null);

    const res = await searchCadUnicoAction(searchNis);
    setCadLoading(false);

    if (res.data) {
      setCadUnicoResult(res.data);
    } else {
      alert(res.error || "Não foi possível encontrar o registro no CadÚnico.");
    }
  }

  async function handleRegisterRma() {
    if (!cadUnicoResult) return;
    if (!units.length) { alert("Não há equipamento disponível para registrar a consulta."); return; }
    setCadLoading(true);

    const res = await saveRmaRecordAction({
      nis: cadUnicoResult.nis,
      nomeCidadao: cadUnicoResult.nomeCompleto,
      unidadeAtendimento: units[0].name,
      tipoAtendimento: "Consulta cadastral local",
      detalhesRma: `Consulta ao cadastro local. Renda per capita registrada: R$ ${cadUnicoResult.rendaPerCapita.toFixed(2)}.`,
    });

    setCadLoading(false);

    if (res.data) {
      setRmaSuccessMsg(`Consulta local registrada (ID: ${res.data.id}). Este registro não representa emissão do RMA oficial.`);
    }
    else { alert(res.error || "Não foi possível registrar a consulta."); }
  }

  const filtered = atendimentos.filter((a) =>
    (a.family?.familyCode || "").includes(search) || 
    (a.person?.fullName || "").toLowerCase().includes(search.toLowerCase()) ||
    (a.description || "").toLowerCase().includes(search.toLowerCase())
  ).filter((attendance) => secrecyFilter === "Todos" || attendance.secrecyLevel === secrecyFilter);
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visibleAttendances = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const handleOpenModal = (atendimento?: Attendance) => {
    if (atendimento) {
      setEditingAtendimento(atendimento);
      setFormData({
        familyId: atendimento.familyId || "",
        personId: atendimento.personId || "",
        unitId: atendimento.unitId || "",
        professionalId: atendimento.professionalId || "",
        type: atendimento.type || "Acolhimento",
        description: atendimento.description || "",
        secrecyLevel: atendimento.secrecyLevel || "Normal"
      });
    } else {
      setEditingAtendimento(null);
      setFormData({ familyId: "", personId: "", unitId: "", professionalId: "", type: "Acolhimento", description: "", secrecyLevel: "Normal" });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingAtendimento) {
      const res = await updateAttendance(editingAtendimento.id, formData);
      if (!res.success) { alert(res.error); return; }
      if (res.success && res.data) {
        setAtendimentos(atendimentos.map((a) => a.id === editingAtendimento.id ? res.data : a));
      }
    } else {
      const res = await createAttendance(formData);
      if (!res.success) { alert(res.error); return; }
      if (res.success && res.data) {
        setAtendimentos([res.data, ...atendimentos]);
      }
    }
    setIsModalOpen(false);
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    const res = await toggleAttendanceStatus(id, !currentStatus);
    if (res.success && res.data) {
      setAtendimentos(atendimentos.map((a) => a.id === id ? res.data : a));
    }
  };

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-2 sm:p-3">
      <Dialog open={cadOpen} onOpenChange={setCadOpen}><DialogContent className="sm:max-w-3xl">
        <DialogHeader><DialogTitle>Consulta ao cadastro local do CadÚnico</DialogTitle><DialogDescription>Dados municipais e registro da consulta local.</DialogDescription></DialogHeader>
        <section className="space-y-3 border-t border-blue-900 p-3">
        <div className="flex flex-col gap-3 border-b border-blue-900 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span className="bg-blue-500/30 text-blue-200 text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Base municipal — CadÚnico
            </span>
            <h2 className="mt-2 flex items-center gap-2 text-base font-bold">
              <SearchCode className="size-5 text-blue-400" />
              Consulta cadastral local
            </h2>
          </div>
          <span className="w-fit shrink-0 rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-300">
            Dados locais
          </span>
        </div>

        <form onSubmit={handleSearchCadUnico} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Digite o NIS ou CPF do cidadão para consulta CadÚnico..."
            value={searchNis}
            onChange={(e) => setSearchNis(e.target.value)}
            className="h-9 flex-1 rounded-md border border-blue-700/80 bg-slate-900 px-3 font-mono text-sm text-white placeholder-blue-300/60 focus:ring-2 focus:ring-blue-400"
            required
          />
          <button
            type="submit"
            disabled={cadLoading}
            className="inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {cadLoading ? "Consultando..." : "Consultar CadÚnico"}
          </button>
        </form>

        {cadUnicoResult && (
          <div className="space-y-3 rounded-lg border border-blue-700/80 bg-slate-900 p-3 text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="font-bold text-blue-300 text-sm">{cadUnicoResult.nomeCompleto}</span>
              <span className="bg-emerald-600 text-white px-2 py-0.5 rounded font-mono font-bold">
                NIS: {cadUnicoResult.nis}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-300">
              <div>
                <span className="text-slate-500 block">CPF</span>
                <span className="font-mono font-bold text-white">{cadUnicoResult.cpf}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Renda per Capita</span>
                <span className="font-bold text-emerald-400">R$ {cadUnicoResult.rendaPerCapita.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Composição Familiar</span>
                <span className="font-bold text-white">{cadUnicoResult.composicaoFamiliar} Pessoas</span>
              </div>
              <div>
                <span className="text-slate-500 block">Status Cadastral</span>
                <span className="font-bold text-blue-400">{cadUnicoResult.statusCadastral}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-2 border-t border-slate-800">
              <p className="text-xs text-slate-400">A consulta não determina concessão de BPC ou Bolsa Família.</p>

              <button
                onClick={handleRegisterRma}
                disabled={cadLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-1.5 rounded flex items-center gap-1 shadow text-xs"
              >
                <HeartHandshake className="w-4 h-4" /> Registrar consulta local
              </button>
            </div>
            {rmaSuccessMsg && <div className="text-emerald-400 font-bold p-2 bg-emerald-950/60 rounded border border-emerald-800">{rmaSuccessMsg}</div>}
          </div>
        )}
        </section>
      </DialogContent></Dialog>

      <PageHeader
        title="Prontuário Eletrônico SUAS"
        icon={<FileText className="size-4 shrink-0 text-blue-600" />}
        action={<button onClick={() => handleOpenModal()} className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-blue-700"><ClipboardList className="size-3.5" />Novo atendimento</button>}
      />
      <SocialOperationalList id="prontuario" page={activePage} total={filtered.length} onPageChange={setPage}
        actions={<button type="button" onClick={() => setCadOpen(true)}>Consultar CadÚnico</button>}
        columns={[["date", "Atualização", 150, 120], ["unit", "Unidade", 180, 100], ["subject", "Pessoa/Família", 200, 110, "identifier"], ["type", "Tipo", 140, 80], ["secrecy", "Sigilo", 100, 80, "status"], ["status", "Status", 90, 70, "status"], ["actions", "Ações", 140, 140, "actions"]]}
        rows={visibleAttendances.map((atendimento) => ({ id: atendimento.id, label: atendimento.person?.fullName || atendimento.family.familyCode || atendimento.id, values: { date: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(atendimento.date)), unit: atendimento.unit.name, subject: atendimento.person?.fullName || `Família ${atendimento.family.familyCode || "—"}`, type: atendimento.type, secrecy: atendimento.secrecyLevel, status: atendimento.isActive !== false ? "Ativo" : "Inativo" }, actions: <div className="flex gap-2"><button onClick={() => handleOpenModal(atendimento)}>Editar</button><button onClick={() => handleToggleStatus(atendimento.id, atendimento.isActive !== false)}>{atendimento.isActive !== false ? "Inativar" : "Ativar"}</button></div> }))}
        toolbar={<div className="flex w-full min-w-0 gap-2"><div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="Buscar prontuário por código da família ou nome"
            placeholder="Buscar por código da família ou nome..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="h-7 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div><select aria-label="Nível de sigilo" value={secrecyFilter} onChange={(event) => { setSecrecyFilter(event.target.value); setPage(1); }} className="h-7 min-w-0 rounded border border-slate-200 px-2 text-sm"><option>Todos</option>{Array.from(new Set(atendimentos.map((item) => item.secrecyLevel))).map((item) => <option key={item}>{item}</option>)}</select></div>}
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800">
                {editingAtendimento ? "Editar Atendimento" : "Novo Atendimento"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Família</label>
                  <select required value={formData.familyId} onChange={e => setFormData({...formData, familyId: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">Selecione a Família</option>
                    {familias.map((f) => (
                      <option key={f.id} value={f.id}>{f.familyCode} - NIS: {f.nis}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Cidadão (Opcional)</label>
                  <select value={formData.personId} onChange={e => setFormData({...formData, personId: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">Geral da Família</option>
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>{p.fullName}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Unidade</label>
                  <select required value={formData.unitId} onChange={e => setFormData({...formData, unitId: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">Selecione a Unidade</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Técnico Responsável</label>
                  <select required value={formData.professionalId} onChange={e => setFormData({...formData, professionalId: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">Selecione o Técnico</option>
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Tipo de Atendimento</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="Acolhimento">Acolhimento</option>
                    <option value="PAIF">PAIF</option>
                    <option value="PAEFI">PAEFI</option>
                    <option value="Visita Domiciliar">Visita Domiciliar</option>
                    <option value="Benefício">Concessão de Benefício</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Nível de Sigilo</label>
                  <select value={formData.secrecyLevel} onChange={e => setFormData({...formData, secrecyLevel: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="Normal">Normal</option>
                    <option value="Restrito">Restrito (Apenas Equipe Técnica)</option>
                  </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">Relato / Descrição</label>
                  <textarea required rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                  {editingAtendimento ? "Salvar Alterações" : "Salvar Atendimento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
