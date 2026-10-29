"use client";

import { useState } from "react";
import { Users, Search, Plus } from "lucide-react";
import { createFamily, updateFamily, toggleFamilyStatus } from "../actions";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { SocialOperationalList } from "../OperationalList";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE } from "@/lib/operational-tables";

type Person = { id: string; fullName: string; cpf: string | null };
type Family = {
  id: string;
  representativeId: string;
  representative: Person;
  nis: string | null;
  familyCode: string | null;
  income: number | null;
  perCapitaIncome: number | null;
  vulnerabilities: string | null;
  status: string;
};
type FamilyFormData = {
  representativeId: string;
  nis: string;
  familyCode: string;
  income: string;
  perCapitaIncome: string;
  vulnerabilities: string;
};

export default function FamiliasClient({ familiasInicial, persons }: { familiasInicial: Family[]; persons: Person[] }) {
  const [familias, setFamilias] = useState<Family[]>(familiasInicial);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFamilia, setEditingFamilia] = useState<Family | null>(null);
  
  const [formData, setFormData] = useState<FamilyFormData>({
    representativeId: "",
    nis: "",
    familyCode: "",
    income: "",
    perCapitaIncome: "",
    vulnerabilities: ""
  });

  const filtered = familias.filter((f) =>
    (f.representative?.fullName || "").toLowerCase().includes(search.toLowerCase()) || 
    (f.nis || "").includes(search) ||
    (f.familyCode || "").includes(search)
  ).filter((family) => statusFilter === "Todos" || family.status === statusFilter);
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visibleFamilies = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const handleOpenModal = (familia?: Family) => {
    if (familia) {
      setEditingFamilia(familia);
      setFormData({
        representativeId: familia.representativeId || "",
        nis: familia.nis || "",
        familyCode: familia.familyCode || "",
        income: familia.income?.toString() || "",
        perCapitaIncome: familia.perCapitaIncome?.toString() || "",
        vulnerabilities: familia.vulnerabilities || ""
      });
    } else {
      setEditingFamilia(null);
      setFormData({ representativeId: "", nis: "", familyCode: "", income: "", perCapitaIncome: "", vulnerabilities: "" });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...formData,
      income: formData.income ? Number(formData.income) : undefined,
      perCapitaIncome: formData.perCapitaIncome ? Number(formData.perCapitaIncome) : undefined,
    };
    if (editingFamilia) {
      const res = await updateFamily(editingFamilia.id, data);
      if (res.success && res.data) {
        setFamilias(familias.map((f) => f.id === editingFamilia.id ? res.data : f));
      }
    } else {
      const res = await createFamily(data);
      if (res.success && res.data) {
        setFamilias([res.data, ...familias]);
      }
    }
    setIsModalOpen(false);
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "Ativo" ? "Inativo" : "Ativo";
    const res = await toggleFamilyStatus(id, newStatus);
    if (res.success && res.data) {
      setFamilias(familias.map((f) => f.id === id ? res.data : f));
    }
  };

  return (
    <PageFrame className="flex h-full min-h-0 flex-col gap-2 overflow-hidden p-2 sm:p-3">
      <PageHeader
        title="Famílias e Indivíduos"
        icon={<Users className="size-4 shrink-0 text-blue-600" />}
        action={<button onClick={() => handleOpenModal()} className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-blue-700"><Plus className="size-3.5" />Nova família</button>}
      />
      <SocialOperationalList id="familias" page={activePage} total={filtered.length} onPageChange={setPage}
        columns={[["name", "Responsável", 240, 120, "identifier"], ["nis", "NIS", 130, 100], ["code", "Código familiar", 140, 100], ["income", "Renda", 130, 100, "text", "right"], ["status", "Status", 100, 80, "status"], ["actions", "Ações", 140, 140, "actions"]]}
        rows={visibleFamilies.map((familia) => ({ id: familia.id, label: familia.representative?.fullName || "Sem responsável", values: { name: familia.representative?.fullName || "Sem responsável", nis: familia.nis || "—", code: familia.familyCode || "—", income: familia.income === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(familia.income), status: familia.status }, actions: <div className="flex justify-end gap-2"><button onClick={() => handleOpenModal(familia)}>Editar</button><button onClick={() => handleToggleStatus(familia.id, familia.status)}>{familia.status === "Ativo" ? "Inativar" : "Ativar"}</button></div> }))}
        toolbar={<div className="flex w-full min-w-0 gap-2"><div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="Buscar famílias por NIS, código ou responsável"
            placeholder="Buscar por NIS, código ou responsável..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="h-7 w-full rounded-md border border-slate-200 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div><select aria-label="Situação da família" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="h-7 min-w-0 rounded border border-slate-200 px-2 text-sm"><option>Todos</option>{Array.from(new Set(familias.map((item) => item.status))).map((item) => <option key={item}>{item}</option>)}</select></div>}
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-slate-800">
                {editingFamilia ? "Editar Família" : "Nova Família"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Responsável Familiar (Pessoa)</label>
                  <select required value={formData.representativeId} onChange={e => setFormData({...formData, representativeId: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">Selecione a Pessoa</option>
                    {persons.map((p) => (
                      <option key={p.id} value={p.id}>{p.fullName} {p.cpf ? `(CPF: ${p.cpf})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">NIS</label>
                  <input type="text" value={formData.nis} onChange={e => setFormData({...formData, nis: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Código Familiar</label>
                  <input type="text" value={formData.familyCode} onChange={e => setFormData({...formData, familyCode: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Renda Total</label>
                  <input type="number" step="0.01" value={formData.income} onChange={e => setFormData({...formData, income: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Renda Per Capita</label>
                  <input type="number" step="0.01" value={formData.perCapitaIncome} onChange={e => setFormData({...formData, perCapitaIncome: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">Vulnerabilidades</label>
                  <input type="text" value={formData.vulnerabilities} onChange={e => setFormData({...formData, vulnerabilities: e.target.value})} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                  {editingFamilia ? "Salvar Alterações" : "Criar Família"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
