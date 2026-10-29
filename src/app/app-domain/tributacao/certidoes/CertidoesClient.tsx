"use client";

import { useState } from "react";
import { Search, Plus, Trash2, XCircle } from "lucide-react";
import { createCertificate, cancelCertificate } from "./actions";
import { TaxOperationalTable } from "../TaxOperationalTable";

type Certificate = {
  id: string;
  certificateType: string;
  createdAt: Date;
  validUntil: Date;
  authCode: string;
  status: string;
  taxpayer: {
    id: string;
    person: { fullName: string; cpf: string | null } | null;
    company: { corporateName: string; cnpj: string } | null;
  };
};

type Taxpayer = {
  id: string;
  name: string;
};

export default function CertidoesClient({
  certificates,
  taxpayers
}: {
  certificates: Certificate[];
  taxpayers: Taxpayer[];
}) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [createForm, setCreateForm] = useState({
    certificateType: "Negativa",
    taxpayerId: taxpayers[0]?.id || "",
    validUntil: ""
  });

  const filtered = certificates.filter((cert) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const code = cert.authCode.toLowerCase();
    const type = cert.certificateType.toLowerCase();
    const name = (cert.taxpayer?.company?.corporateName || cert.taxpayer?.person?.fullName || "").toLowerCase();
    return code.includes(term) || type.includes(term) || name.includes(term);
  });

  const handleCancel = async (id: string) => {
    if (confirm("Deseja revogar esta certidão?")) {
      await cancelCertificate(id);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.taxpayerId) {
      alert("Selecione um contribuinte válido.");
      return;
    }
    if (!createForm.validUntil) {
      alert("Informe a data de validade.");
      return;
    }
    try {
      const result = await createCertificate(createForm);
      if (result.error) { alert(result.error); return; }
      setIsCreateModalOpen(false);
      setCreateForm({
        certificateType: "Negativa",
        taxpayerId: taxpayers[0]?.id || "",
        validUntil: ""
      });
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar rascunho interno.");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2 p-2 sm:p-2.5 overflow-hidden">
      <TaxOperationalTable resetKey={searchTerm} id="certidoes" emptyMessage="Nenhum registro de certidão encontrado."
        columns={[["code", "Autenticação", 120, 170, "identifier"], ["name", "Contribuinte", 140, 260], ["type", "Tipo", 100, 160], ["issued", "Emissão", 95, 105], ["valid", "Validade", 95, 105], ["status", "Status", 85, 100, "status"], ["actions", "Ação", 48, 48, "actions"]]}
        rows={filtered.map(cert => ({ id: cert.id, label: cert.authCode, values: { code: cert.authCode, name: cert.taxpayer?.company?.corporateName || cert.taxpayer?.person?.fullName || "Não Informado", type: cert.certificateType, issued: new Date(cert.createdAt).toLocaleDateString("pt-BR"), valid: new Date(cert.validUntil).toLocaleDateString("pt-BR"), status: cert.status }, actions: cert.status === "Ativa" ? <button onClick={() => handleCancel(cert.id)} title="Revogar certidão" aria-label={`Revogar certidão ${cert.authCode}`}><Trash2 className="size-4" /></button> : null }))}
        actions={
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-500 px-3 text-xs font-bold text-slate-950 shadow-xs transition-colors hover:bg-amber-600"
          >
            <Plus className="size-3.5" />
            Nova Certidão
          </button>
        }
        toolbar={
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <label className="relative min-w-0 flex-1 basis-full sm:basis-auto">
              <span className="sr-only">Buscar certidão</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por código de autenticação, tipo ou contribuinte"
                className="h-8 w-full rounded-md border border-slate-200 bg-white py-1 pl-8 pr-2.5 text-xs outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800"
              />
            </label>
          </div>
        }
      />

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-base font-bold text-slate-800">Registrar Certidão</h2>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="size-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contribuinte</label>
                <select
                  required
                  value={createForm.taxpayerId}
                  onChange={(e) => setCreateForm({...createForm, taxpayerId: e.target.value})}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                >
                  <option value="">Selecione um contribuinte...</option>
                  {taxpayers.map(tp => (
                    <option key={tp.id} value={tp.id}>{tp.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Certidão</label>
                  <select
                    value={createForm.certificateType}
                    onChange={(e) => setCreateForm({...createForm, certificateType: e.target.value})}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                  >
                    <option value="Negativa">Negativa</option>
                    <option value="Positiva com Efeito de Negativa">Positiva com Efeito</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Validade</label>
                  <input
                    type="date"
                    required
                    value={createForm.validUntil}
                    onChange={(e) => setCreateForm({...createForm, validUntil: e.target.value})}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-600 transition-colors shadow-xs"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
