"use client";

import { useState } from "react";
import { Building2, Search, Plus, Phone, CheckCircle2, XCircle } from "lucide-react";
import { createSocialUnit, updateSocialUnit, toggleSocialUnitStatus } from "../actions";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

const PAGE_SIZE = 20;

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
      <ErpListFrame
        toolbar={<div className="grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_10rem]"><div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Buscar unidade..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-8 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div><select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} className="h-8 rounded border border-slate-200 px-2 text-xs"><option>Todos</option>{Array.from(new Set(unidades.map((item) => item.type))).map((item) => <option key={item}>{item}</option>)}</select></div>}
        summary={<p className="text-[11px] text-slate-500">{filtered.length} unidades encontradas</p>}
        pagination={<ErpPagination page={activePage} total={filtered.length} pageSize={PAGE_SIZE} previousHref="#" nextHref="#" label="unidades" onPageChange={setPage} />}
      >
          <table className="w-full table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="p-2 font-semibold">Unidade</th>
                <th className="p-2 font-semibold">Tipo</th>
                <th className="hidden p-2 font-semibold md:table-cell">Telefone</th>
                <th className="hidden p-2 font-semibold lg:table-cell">Local</th>
                <th className="hidden p-2 font-semibold xl:table-cell">Responsável</th>
                <th className="hidden p-2 text-center font-semibold sm:table-cell">Status</th>
                <th className="p-2 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length > 0 ? (
                visibleUnits.map((unidade) => (
                  <tr key={unidade.id} className="h-9 hover:bg-slate-50/50">
                    <td className="truncate p-2 font-semibold text-slate-800" title={unidade.name}>{unidade.name}</td>
                    <td className="p-2">
                      <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium">
                        {unidade.type}
                      </span>
                    </td>
                    <td className="hidden p-2 text-slate-600 md:table-cell">
                      {unidade.phone ? (
                        <p className="flex items-center gap-1 text-xs"><Phone className="w-3 h-3" /> {unidade.phone}</p>
                      ) : '-'}
                    </td>
                    <td className="hidden truncate p-2 text-slate-600 lg:table-cell" title={unidade.realEstate?.streetName || undefined}>
                      {unidade.realEstate?.streetName || '-'}
                    </td>
                    <td className="hidden truncate p-2 text-slate-600 xl:table-cell" title={unidade.manager?.name || undefined}>
                      {unidade.manager?.name || '-'}
                    </td>
                    <td className="hidden p-2 text-center sm:table-cell">
                      {unidade.isActive ? (
                         <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md text-xs font-medium border border-emerald-200">
                           <CheckCircle2 className="w-3 h-3" /> Ativo
                         </span>
                      ) : (
                         <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-50 text-rose-700 rounded-md text-xs font-medium border border-rose-200">
                           <XCircle className="w-3 h-3" /> Inativo
                         </span>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <button 
                          onClick={() => handleOpenModal(unidade)}
                          className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition-colors text-xs font-medium"
                        >
                          Editar
                        </button>
                        <button 
                          onClick={() => handleToggleStatus(unidade.id, unidade.isActive)}
                          className={unidade.isActive ? 'text-amber-600 hover:bg-amber-50 p-1.5 rounded-lg transition-colors text-xs font-medium' : 'text-emerald-600 hover:bg-emerald-50 p-1.5 rounded-lg transition-colors text-xs font-medium'}
                        >
                          {unidade.isActive ? 'Inativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    Nenhuma unidade encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </ErpListFrame>

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
