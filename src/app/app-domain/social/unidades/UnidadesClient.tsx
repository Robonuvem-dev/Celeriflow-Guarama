"use client";

import { useState } from "react";
import { Building2, Search, Plus } from "lucide-react";
import { createSocialUnit, updateSocialUnit, toggleSocialUnitStatus } from "../actions";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { SocialOperationalList } from "../OperationalList";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";

type SocialUnit = {
  id: string;
  isConfidential: boolean;
  identificationCode: string | null;
  implementationDate: Date | null;
  streetAddress: string | null;
  municipality: string | null;
  latitude: number | null;
  longitude: number | null;
  name: string;
  type: string;
  phone: string | null;
  email: string | null;
  realEstateId: string | null;
  managerId: string | null;
  isActive: boolean;
  realEstate: { streetName: string | null; number: string | null } | null;
  manager: { name: string } | null;
};
type RealEstate = { id: string; streetName: string | null; number: string | null; propertyType: string | null };
type Employee = { id: string; name: string };
type SocialUnitFormData = { name: string; type: string; phone: string; email: string; realEstateId: string; managerId: string; identificationCode: string; implementationDate: string; streetAddress: string; municipality: string; latitude: string; longitude: string; isConfidential: boolean };
const emptyDetails = { identificationCode: "", implementationDate: "", streetAddress: "", municipality: "", latitude: "", longitude: "", isConfidential: false };

export default function UnidadesClient({ unidadesInicial, realEstates, employees }: {
  unidadesInicial: SocialUnit[];
  realEstates: RealEstate[];
  employees: Employee[];
}) {
  const [unidades, setUnidades] = useState<SocialUnit[]>(unidadesInicial);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUnidade, setEditingUnidade] = useState<SocialUnit | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<SocialUnitFormData>({
    name: "", type: "CRAS", phone: "", email: "", realEstateId: "", managerId: "", ...emptyDetails
  });

  const filtered = unidades.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) || 
    u.type.toLowerCase().includes(search.toLowerCase())
  ).filter((unit) => typeFilter === "Todos" || unit.type === typeFilter);
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visibleUnits = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const handleOpenModal = (unidade?: SocialUnit) => {
    setError("");
    if (unidade) {
      setEditingUnidade(unidade);
      setFormData({
        name: unidade.name,
        type: unidade.type,
        phone: unidade.phone || "",
        email: unidade.email || "",
        realEstateId: unidade.realEstateId || "",
        managerId: unidade.managerId || "",
        identificationCode: unidade.identificationCode || "",
        isConfidential: unidade.isConfidential,
        implementationDate: unidade.implementationDate ? new Date(unidade.implementationDate).toISOString().slice(0, 10) : "",
        streetAddress: unidade.streetAddress || "", municipality: unidade.municipality || "",
        latitude: unidade.latitude?.toString() ?? "", longitude: unidade.longitude?.toString() ?? ""
      });
    } else {
      setEditingUnidade(null);
      setFormData({ name: "", type: "CRAS", phone: "", email: "", realEstateId: "", managerId: "", ...emptyDetails });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
    if (editingUnidade) {
      const res = await updateSocialUnit(editingUnidade.id, formData);
      if (!res.success) { setError(res.error || "Falha ao salvar unidade."); return; }
      if (res.success && res.data) {
        setUnidades(unidades.map((u) => u.id === editingUnidade.id ? res.data : u));
      }
    } else {
      const res = await createSocialUnit(formData);
      if (!res.success) { setError(res.error || "Falha ao salvar unidade."); return; }
      if (res.success && res.data) {
        setUnidades([...unidades, res.data]);
      }
    }
    setIsModalOpen(false);
    } catch { setError("Não foi possível salvar a unidade. Tente novamente."); }
    finally { setSaving(false); }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    const res = await toggleSocialUnitStatus(id, !currentStatus);
    if (res.success && res.data) {
      setUnidades(unidades.map((u) => u.id === id ? res.data : u));
    }
  };

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-2 sm:p-3">
      <PageHeader
        title="Unidades SUAS"
        icon={<Building2 className="size-4 shrink-0 text-blue-600" />}
        action={<button onClick={() => handleOpenModal()} className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-blue-700"><Plus className="size-3.5" />Nova unidade</button>}
      />
      <SocialOperationalList id="unidades" page={activePage} total={filtered.length} onPageChange={setPage}
        columns={[["name", "Unidade", 200, 110, "identifier"], ["type", "Tipo", 100, 70], ["phone", "Telefone", 140, 100], ["address", "Local", 180, 100], ["manager", "Responsável", 180, 100], ["status", "Status", 90, 70, "status"], ["actions", "Ações", 140, 140, "actions"]]}
        rows={visibleUnits.map((unidade) => ({ id: unidade.id, label: unidade.name, values: { name: unidade.name, type: unidade.type, phone: unidade.phone || "—", address: unidade.realEstate?.streetName || "—", manager: unidade.manager?.name || "—", status: unidade.isActive ? "Ativo" : "Inativo" }, actions: <div className="flex justify-end gap-2"><button onClick={() => handleOpenModal(unidade)}>Editar</button><button onClick={() => handleToggleStatus(unidade.id, unidade.isActive)}>{unidade.isActive ? "Inativar" : "Ativar"}</button></div> }))}
        toolbar={<div className="flex w-full min-w-0 gap-2"><div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="Buscar unidade"
            placeholder="Buscar unidade..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-7 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div><select aria-label="Tipo de unidade" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} className="h-7 min-w-0 rounded border border-slate-200 px-2 text-sm"><option>Todos</option>{Array.from(new Set(unidades.map((item) => item.type))).map((item) => <option key={item}>{item}</option>)}</select></div>}
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800">
                {editingUnidade ? "Editar Unidade" : "Nova Unidade"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={formData.isConfidential} onChange={(event) => setFormData({ ...formData, isConfidential: event.target.checked })} />Equipamento sigiloso (configuração administrativa)</label>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Nome da Unidade</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Tipo</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="Secretaria">Secretaria</option>
                    <option value="Centro DIA">Centro DIA</option>
                    <option value="Saúde">Saúde</option>
                    <option value="Judiciário">Judiciário</option>
                    <option value="Outros">Outros</option>
                    <option value="CRAS">CRAS</option>
                    <option value="CREAS">CREAS</option>
                    <option value="Centro POP">Centro POP</option>
                    <option value="Acolhimento">Acolhimento</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Telefone</label>
                  <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                {([
                  ["identificationCode", "Código de identificação", "text"],
                  ["implementationDate", "Data de implantação", "date"],
                  ["streetAddress", "Endereço completo", "text"],
                  ["municipality", "Município / UF", "text"],
                  ["latitude", "Latitude (-90 a 90)", "number"],
                  ["longitude", "Longitude (-180 a 180)", "number"],
                ] as const).map(([key, label, type]) => <label key={key} className="flex flex-col gap-1 text-sm font-medium text-slate-700">{label}<input type={type} step={type === "number" ? "any" : undefined} value={formData[key]} onChange={(event) => setFormData({ ...formData, [key]: event.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" /></label>)}
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Imóvel Vinculado (Patrimônio)</label>
                  <select value={formData.realEstateId} onChange={e => setFormData({...formData, realEstateId: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">Nenhum</option>
                    {realEstates.map((re) => (
                      <option key={re.id} value={re.id}>{re.streetName}, {re.number} - {re.propertyType}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Servidor Responsável (Gestor)</label>
                  <select value={formData.managerId} onChange={e => setFormData({...formData, managerId: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">Nenhum</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t">
                {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
                  {editingUnidade ? "Salvar Alterações" : "Criar Unidade"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
