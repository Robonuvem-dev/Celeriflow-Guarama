"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { deleteUsuario, upsertUsuario, toggleUsuarioStatus } from "../actions";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

const columns: OperationalColumn[] = [
  { key: "name", label: "Nome", type: "text", initialWidth: 220, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "email", label: "E-mail", type: "text", initialWidth: 240, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "profile", label: "Perfil", type: "text", initialWidth: 180, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "unit", label: "Unidade/Setor", type: "text", initialWidth: 210, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 100, minWidth: 75, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 80, minWidth: 72, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];

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
    <>
      <OperationalListFrame label="Gestão de usuários"
        actions={<button onClick={openNewModal} disabled={!perfis.length} className={styles.newButton}><Plus />Novo usuário</button>}
        toolbar={<input type="search" aria-label="Buscar usuários por nome ou e-mail" placeholder="Buscar por nome ou e-mail..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} className={styles.searchInput} />}
        pagination={<OperationalPagination page={activePage} total={filteredUsuarios.length} onPageChange={setPage} />}>
        <OperationalTable columns={columns} preferenceId="configuracoes-usuarios" caption="Usuários" emptyMessage="Nenhum usuário encontrado." rows={pageUsuarios.map((u) => ({
          id: u.id, label: u.nome,
          values: { name: u.nome, email: u.email, profile: u.perfil.nome, unit: u.employee?.secretariat?.name || u.employee?.department?.name || "—", status: u.ativo ? "Ativo" : "Inativo" },
          cells: { status: <button onClick={() => handleToggleStatus(u.id, !u.ativo)} aria-label={`Alterar status de ${u.nome}`} className="h-6 max-w-full rounded px-1 font-medium">{u.ativo ? "Ativo" : "Inativo"}</button> },
          actions: <div className={styles.rowActions}><button onClick={() => openEditModal(u)} className={styles.iconButton} aria-label={`Editar ${u.nome}`} title="Editar usuário"><Pencil /></button><button onClick={() => handleDelete(u)} disabled={deletingId === u.id} className={styles.iconButton} aria-label={`Excluir ${u.nome}`} title="Excluir usuário"><Trash2 /></button></div>,
        }))} />
      </OperationalListFrame>

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
    </>
  );
}
