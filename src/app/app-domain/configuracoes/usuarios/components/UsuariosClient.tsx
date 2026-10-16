"use client";

import { useState } from "react";
import { UserCog, Plus, Search, Shield, Trash2, X } from "lucide-react";
import { deleteUsuario, upsertUsuario, toggleUsuarioStatus } from "../actions";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpCompactListFrame } from "@/components/app-ui/erp/ErpCompactListFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

const PAGE_SIZE = 20;

type Perfil = { id: string; nome: string; codigo: string };
type Usuario = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfilId: string;
  perfil: { nome: string };
  employeeId: string | null;
  employee?: { department: { name: string } | null; secretariat: { name: string } | null } | null;
};
type Servidor = {
  id: string;
  name: string;
  department: { name: string } | null;
  secretariat: { name: string } | null;
};

export default function UsuariosClient({
  usuarios,
  perfis,
  servidores
}: {
  usuarios: Usuario[];
  perfis: Perfil[];
  servidores: Servidor[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<{
    id?: string;
    nome: string;
    email: string;
    perfilId: string;
    employeeId: string;
    ativo: boolean;
  }>({
    nome: "",
    email: "",
    perfilId: perfis[0]?.id || "",
    employeeId: "",
    ativo: true,
  });

  const filteredUsuarios = usuarios.filter(u => 
    u.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(filteredUsuarios.length / PAGE_SIZE)));
  const pageUsuarios = filteredUsuarios.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  function openNewModal() {
    setFormData({
      nome: "",
      email: "",
      perfilId: perfis[0]?.id || "",
      employeeId: "",
      ativo: true,
    });
    setIsModalOpen(true);
  }

  function openEditModal(usuario: Usuario) {
    setFormData({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfilId: usuario.perfilId,
      employeeId: usuario.employeeId || "",
      ativo: usuario.ativo
    });
    setIsModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    const result = await upsertUsuario({
      id: formData.id,
      nome: formData.nome,
      email: formData.email,
      perfilId: formData.perfilId,
      employeeId: formData.employeeId || undefined,
      ativo: formData.ativo
    });

    if (result.error) {
      alert(result.error);
    } else {
      setIsModalOpen(false);
    }
    setIsSubmitting(false);
  }

  async function handleToggleStatus(id: string, ativo: boolean) {
    const result = await toggleUsuarioStatus(id, ativo);
    if (result.error) alert(result.error);
  }

  async function handleDelete(usuario: Usuario) {
    if (!window.confirm(`Excluir o usuário "${usuario.nome}"? Esta ação não pode ser desfeita.`)) return;

    setDeletingId(usuario.id);
    const result = await deleteUsuario(usuario.id);
    if (result.error) alert(result.error);
    setDeletingId(null);
  }

  return (
    <PageFrame className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Gestão de Usuários"
        icon={<UserCog className="size-4 shrink-0 text-slate-700 dark:text-slate-300" />}
        action={<button onClick={openNewModal} disabled={!perfis.length} className="flex h-8 items-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-slate-900"><Plus className="h-4 w-4" />Novo Usuário</button>}
        className="dark:border-slate-700 dark:bg-slate-800 dark:[&>h1]:text-white"
      />
      <ErpCompactListFrame toolbar={
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Buscar por nome ou e-mail..." 
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900/20 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />
          </div>
        } pagination={<ErpPagination page={activePage} total={filteredUsuarios.length} pageSize={PAGE_SIZE} previousHref="#" nextHref="#" label="usuários" onPageChange={setPage} />}>
          <table className="w-full table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase text-slate-500 dark:bg-slate-800/95">
              <tr>
                <th className="w-[22%] px-2.5 py-2">Nome</th>
                <th className="w-[24%] px-2.5 py-2">E-mail</th>
                <th className="w-[18%] px-2.5 py-2">Perfil</th>
                <th className="hidden w-[18%] px-2.5 py-2 md:table-cell">Unidade/Setor</th>
                <th className="w-[9%] px-2.5 py-2">Status</th>
                <th className="w-[9%] px-2.5 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pageUsuarios.map((u) => (
                <tr key={u.id} className="h-[38px] border-b border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50">
                  <td className="max-w-0 truncate px-2.5 py-1.5 font-bold text-slate-900 dark:text-white" title={u.nome}>{u.nome}</td>
                  <td className="max-w-0 truncate px-2.5 py-1.5 text-slate-500 dark:text-slate-400" title={u.email}>{u.email}</td>
                  <td className="max-w-0 px-2.5 py-1.5">
                    <span title={u.perfil.nome} className="inline-flex h-[18px] max-w-full items-center gap-1 rounded-full bg-blue-50 px-1.5 text-[10px] font-medium text-blue-700">
                      <Shield className="h-3 w-3 shrink-0" />
                      <span className="truncate">{u.perfil.nome}</span>
                    </span>
                  </td>
                  <td className="hidden max-w-0 truncate px-2.5 py-1.5 text-slate-600 md:table-cell" title={u.employee?.secretariat?.name || u.employee?.department?.name || undefined}>{u.employee?.secretariat?.name || u.employee?.department?.name || "-"}</td>
                  <td className="px-2.5 py-1.5">
                    <button
                      onClick={() => handleToggleStatus(u.id, !u.ativo)}
                      className={`inline-flex items-center px-1.5 rounded-full text-[10px] font-medium transition-colors ${
                        u.ativo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                    >
                      {u.ativo ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-2.5 py-1.5 text-right">
                    <div className="inline-flex items-center gap-2 whitespace-nowrap">
                      <button title="Editar usuário"
                        onClick={() => openEditModal(u)}
                         className="text-gray-600 hover:text-gray-900 font-medium text-[11px] dark:text-gray-300 dark:hover:text-white"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        disabled={deletingId === u.id}
                        className="inline-flex items-center gap-1 text-rose-700 hover:text-rose-900 disabled:cursor-not-allowed disabled:opacity-70 font-medium text-sm dark:text-rose-300 dark:hover:text-rose-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">{deletingId === u.id ? "Excluindo" : "Excluir"}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsuarios.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </ErpCompactListFrame>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-y-auto rounded-xl bg-white shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {formData.id ? "Editar Usuário" : "Novo Usuário"}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4">
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                  <input 
                    required 
                    type="text" 
                    value={formData.nome}
                    onChange={e => setFormData({...formData, nome: e.target.value})}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail Institucional</label>
                  <input 
                    required 
                    type="email" 
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Perfil de Acesso</label>
                  <select
                    required
                    value={formData.perfilId}
                    onChange={e => setFormData({...formData, perfilId: e.target.value})}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  >
                    {!perfis.length && <option value="">Crie um perfil antes de cadastrar usuários</option>}
                    {perfis.filter(p => p.codigo !== "SYSTEM_ADMINISTRATOR").map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Servidor vinculado</label>
                  <select
                    value={formData.employeeId}
                    onChange={e => setFormData({...formData, employeeId: e.target.value})}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 outline-none"
                  >
                      <option value="">Sem vinculo operacional</option>
                      {servidores.map(servidor => (
                        <option key={servidor.id} value={servidor.id}>
                          {servidor.name}{servidor.secretariat ? ` - ${servidor.secretariat.name}` : ""}{servidor.department ? ` / ${servidor.department.name}` : ""}
                        </option>
                      ))}
                    </select>
                  <p className="mt-1 text-xs text-gray-500">Obrigatório para perfis por área/secretaria e para operar Protocolos e Processos.</p>
                </div>
                <div className="flex items-center mt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={formData.ativo}
                      onChange={e => setFormData({...formData, ativo: e.target.checked})}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    />
                    <span className="text-sm font-medium text-gray-700">Usuário Ativo</span>
                  </label>
                </div>
              </div>

              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                Os acessos a módulos e operações são definidos exclusivamente pelas permissões do perfil selecionado.
              </div>
            </form>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-70 flex items-center gap-2"
              >
                {isSubmitting && <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                Salvar Usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
