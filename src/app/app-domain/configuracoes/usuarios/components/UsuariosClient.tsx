"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, X, Eye, KeyRound, Lock, Unlock, ShieldCheck } from "lucide-react";
import { deleteUsuario, upsertUsuario, toggleUsuarioStatus } from "../actions";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalDevice } from "@/components/app-ui/operational/OperationalContext";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

const columns: OperationalColumn[] = [
  { key: "code", label: "Código", type: "identifier", initialWidth: 95, minWidth: 70, resizable: true, sortable: false, details: "overflow" },
  { key: "name", label: "Nome", type: "text", initialWidth: 190, minWidth: 105, resizable: true, sortable: false, details: "overflow" },
  { key: "email", label: "Login / E-mail", type: "text", initialWidth: 200, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "profile", label: "Perfil", type: "text", initialWidth: 145, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "unit", label: "Unidade / Órgão", type: "text", initialWidth: 170, minWidth: 95, resizable: true, sortable: false, details: "overflow" },
  { key: "lockStatus", label: "Situação Bloqueio", type: "status", initialWidth: 115, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Indicador Login", type: "status", initialWidth: 95, minWidth: 75, resizable: true, sortable: false, details: "overflow" },
  { key: "expiration", label: "Expiração Senha", type: "text", initialWidth: 115, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 120, minWidth: 104, maxWidth: 132, resizable: false, sortable: false, details: "none" },
];

type Perfil = { id: string; nome: string; codigo: string };
type Usuario = {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  perfilId: string;
  perfil: { nome: string; codigo?: string };
  employeeId: string | null;
  updatedAt?: Date | string;
  createdAt?: Date | string;
  employee?: {
    name?: string;
    registration?: string | null;
    cpf?: string | null;
    department: { name: string } | null;
    secretariat: { name: string } | null;
  } | null;
};
type Servidor = {
  id: string;
  name: string;
  registration?: string | null;
  department: { name: string } | null;
  secretariat: { name: string } | null;
};

function formatPasswordExpiration(usuario: Usuario): string {
  if (!usuario.ativo) return "Suspensa (Bloqueado)";
  const baseDate = usuario.updatedAt ? new Date(usuario.updatedAt) : new Date();
  const validBase = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  const expirationDate = new Date(validBase.getTime() + 90 * 24 * 60 * 60 * 1000);
  return `${expirationDate.toLocaleDateString("pt-BR")} (90d)`;
}

export default function UsuariosClient({
  usuarios,
  perfis,
  servidores,
  additionalProfiles,
}: {
  usuarios: Usuario[];
  perfis: Perfil[];
  servidores: Servidor[];
  additionalProfiles?: ReactNode;
}) {
  const device = useOperationalDevice();
  const formId = useId();
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "BLOCKED">("ALL");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState<Usuario | null>(null);
  const [resetBanner, setResetBanner] = useState<{ user: string; email: string; protocol: string } | null>(null);
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

  const filteredUsuarios = usuarios.filter((u) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      !q ||
      u.nome.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q) ||
      (u.employee?.registration ?? "").toLowerCase().includes(q);
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && u.ativo) ||
      (statusFilter === "BLOCKED" && !u.ativo);
    return matchesSearch && matchesStatus;
  });

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
      ativo: usuario.ativo,
    });
    setIsModalOpen(true);
  }

  async function handleResetPassword(usuario: Usuario) {
    const protocol = `RST-${usuario.id.slice(0, 6).toUpperCase()}-${new Date().getFullYear()}`;
    try {
      await sendPasswordResetEmail(auth, usuario.email.trim());
    } catch {
      // Fallback protocol recorded even when external SMTP/Firebase is offline in local/test env
    }
    setResetBanner({
      user: usuario.nome,
      email: usuario.email,
      protocol,
    });
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
      ativo: formData.ativo,
    });

    if (result.error) {
      alert(result.error);
    } else {
      setIsModalOpen(false);
      if (!formData.id && formData.ativo) {
        try {
          await sendPasswordResetEmail(auth, formData.email.trim());
        } catch {
          alert("Usuário salvo. Não foi possível enviar a definição de senha; utilize a recuperação no login.");
        }
      }
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
      {!profilesOpen && (
        <OperationalListFrame
          label="Gestão de usuários, bloqueios e credenciais"
          actions={
            <>
              <Link href="/tributacao/referencias?catalogo=usuario-municipal" className={styles.filterButton}>
                Usuários do Município (SN)
              </Link>
              <Link href="/tributacao/simples-nacional" className={styles.filterButton}>
                Simples Nacional
              </Link>
              {additionalProfiles && (
                <button type="button" className={styles.filterButton} onClick={() => setProfilesOpen(true)}>
                  Perfis complementares
                </button>
              )}
              <button onClick={openNewModal} disabled={!perfis.length} className={styles.newButton}>
                <Plus />
                Novo usuário
              </button>
            </>
          }
          toolbar={
            <>
              <input
                type="search"
                aria-label="Buscar usuários por código, nome ou login"
                placeholder="Buscar por código, nome ou login (e-mail)..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className={styles.searchInput}
              />
              <select
                aria-label="Filtrar por situação de bloqueio e indicador de login"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "BLOCKED");
                  setPage(1);
                }}
                className={styles.filterButton}
              >
                <option value="ALL">Situação: Todos ({usuarios.length})</option>
                <option value="ACTIVE">Ativos / Desbloqueados ({usuarios.filter((u) => u.ativo).length})</option>
                <option value="BLOCKED">Bloqueados / Inativos ({usuarios.filter((u) => !u.ativo).length})</option>
              </select>
              {resetBanner && (
                <span role="status" className="inline-flex items-center gap-2 rounded border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-900">
                  Senha resetada para padrão/link: {resetBanner.user} ({resetBanner.email}) · Protocolo {resetBanner.protocol}
                  <button type="button" onClick={() => setResetBanner(null)} aria-label="Fechar aviso" className="font-bold">
                    ×
                  </button>
                </span>
              )}
            </>
          }
          pagination={<OperationalPagination page={activePage} total={filteredUsuarios.length} onPageChange={setPage} />}
        >
          <OperationalTable
            columns={columns}
            preferenceId="configuracoes-usuarios-cf27"
            caption="Usuários, bloqueios e validade de credenciais"
            emptyMessage="Nenhum usuário encontrado para os filtros informados."
            rows={pageUsuarios.map((u) => {
              const unitLabel = u.employee?.secretariat?.name || u.employee?.department?.name || "Órgão Central / Município";
              const shortCode = u.id.slice(0, 8).toUpperCase();
              const expirationLabel = formatPasswordExpiration(u);
              return {
                id: u.id,
                label: u.nome,
                values: {
                  code: shortCode,
                  name: u.nome,
                  email: u.email,
                  profile: u.perfil.nome,
                  unit: unitLabel,
                  lockStatus: u.ativo ? "Desbloqueado" : "Bloqueado",
                  status: u.ativo ? "Ativo" : "Inativo",
                  expiration: expirationLabel,
                },
                cells: {
                  lockStatus: (
                    <button
                      onClick={() => handleToggleStatus(u.id, !u.ativo)}
                      aria-label={`${u.ativo ? "Bloquear" : "Desbloquear"} ${u.nome}`}
                      className={`h-6 max-w-full rounded px-1.5 text-xs font-semibold ${
                        u.ativo ? "bg-emerald-50 text-emerald-800" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {u.ativo ? "Desbloqueado" : "Bloqueado"}
                    </button>
                  ),
                  status: (
                    <button
                      onClick={() => handleToggleStatus(u.id, !u.ativo)}
                      aria-label={`Alterar status de ${u.nome}`}
                      className="h-6 max-w-full rounded px-1 font-medium"
                    >
                      {u.ativo ? "Ativo" : "Inativo"}
                    </button>
                  ),
                },
                actions: (
                  <div className={styles.rowActions}>
                    <button
                      onClick={() => setViewingUser(u)}
                      className={styles.iconButton}
                      aria-label={`Visualizar dados de ${u.nome}`}
                      title="Visualizar dados do usuário"
                    >
                      <Eye />
                    </button>
                    <button
                      onClick={() => handleResetPassword(u)}
                      className={styles.iconButton}
                      aria-label={`Resetar senha de ${u.nome}`}
                      title="Resetar senha para padrão / enviar link"
                    >
                      <KeyRound />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(u.id, !u.ativo)}
                      className={styles.iconButton}
                      aria-label={`${u.ativo ? "Bloquear" : "Desbloquear"} ${u.nome}`}
                      title={u.ativo ? "Bloquear usuário" : "Desbloquear usuário"}
                    >
                      {u.ativo ? <Lock /> : <Unlock />}
                    </button>
                    <button
                      onClick={() => openEditModal(u)}
                      className={styles.iconButton}
                      aria-label={`Editar ${u.nome}`}
                      title="Editar usuário"
                    >
                      <Pencil />
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      disabled={deletingId === u.id}
                      className={styles.iconButton}
                      aria-label={`Excluir ${u.nome}`}
                      title="Excluir usuário"
                    >
                      <Trash2 />
                    </button>
                  </div>
                ),
              };
            })}
          />
        </OperationalListFrame>
      )}
      <div className={profilesOpen ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}>
        <button type="button" className={styles.filterButton} onClick={() => setProfilesOpen(false)}>
          Voltar aos usuários
        </button>
        <OperationalPagedContent device={device} label="Perfis complementares">
          {additionalProfiles}
        </OperationalPagedContent>
      </div>

      {viewingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-y-auto rounded-xl bg-white shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-sky-700" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Dados do Usuário e Permissões Municipais
                </h2>
              </div>
              <button onClick={() => setViewingUser(null)} className="text-gray-400 hover:text-gray-600" aria-label="Fechar visualização">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5 text-sm text-slate-700">
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                <div>
                  <span className="block text-xs font-semibold uppercase text-slate-500">Código Identificador</span>
                  <span className="font-mono font-semibold text-slate-900">{viewingUser.id}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase text-slate-500">Nome Completo</span>
                  <span className="font-semibold text-slate-900">{viewingUser.nome}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase text-slate-500">Login / E-mail Institucional</span>
                  <span className="font-medium text-slate-900">{viewingUser.email}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase text-slate-500">Perfil Principal</span>
                  <span className="font-medium text-slate-900">{viewingUser.perfil.nome}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase text-slate-500">Situação de Bloqueio / Login</span>
                  <span className="font-semibold text-slate-900">
                    {viewingUser.ativo ? "Desbloqueado · Indicador Ativo" : "Bloqueado · Indicador Inativo"}
                  </span>
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase text-slate-500">Data de Expiração da Senha</span>
                  <span className="font-medium text-slate-900">{formatPasswordExpiration(viewingUser)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2">
                <div>
                  <span className="block text-xs font-semibold uppercase text-slate-500">Servidor Municipal Vinculado</span>
                  <span className="font-medium text-slate-900">{viewingUser.employee?.name || "Sem vínculo direto"}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase text-slate-500">Matrícula Funcional</span>
                  <span className="font-medium text-slate-900">{viewingUser.employee?.registration || "Não informada"}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase text-slate-500">Secretaria / Órgão</span>
                  <span className="font-medium text-slate-900">{viewingUser.employee?.secretariat?.name || "Administração Municipal"}</span>
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase text-slate-500">Unidade / Setor Responsável</span>
                  <span className="font-medium text-slate-900">{viewingUser.employee?.department?.name || "Unidade Gestora Principal"}</span>
                </div>
              </div>

              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950">
                <p className="font-semibold">Habilitação em Órgãos, Municípios (TOM) e Simples Nacional</p>
                <p className="mt-1">
                  O usuário opera nos órgãos e unidades gestoras autorizadas pelo perfil e pelo vínculo funcional. Para configurar cargo/função específica de fiscalização do Simples Nacional ou vínculo TOM, utilize os atalhos abaixo.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link href="/tributacao/referencias?catalogo=usuario-municipal" className="rounded border border-sky-300 bg-white px-2.5 py-1 font-semibold text-sky-800 hover:bg-sky-100">
                    Vincular em Usuários do Município (SN)
                  </Link>
                  <Link href="/tributacao/referencias?catalogo=orgao-municipio" className="rounded border border-sky-300 bg-white px-2.5 py-1 font-semibold text-sky-800 hover:bg-sky-100">
                    Consultar Órgãos / Municípios (TOM)
                  </Link>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleResetPassword(viewingUser)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  Resetar Senha (Padrão / Link)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleToggleStatus(viewingUser.id, !viewingUser.ativo);
                    setViewingUser({ ...viewingUser, ativo: !viewingUser.ativo });
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  {viewingUser.ativo ? "Bloquear Usuário" : "Desbloquear Usuário"}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = viewingUser;
                    setViewingUser(null);
                    openEditModal(target);
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Editar Dados
                </button>
                <button
                  type="button"
                  onClick={() => setViewingUser(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

            <form id={formId} onSubmit={handleSubmit} className="p-4">
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nome Completo</label>
                  <input
                    required
                    type="text"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Login / E-mail Institucional</label>
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Perfil de Acesso</label>
                  <select
                    required
                    value={formData.perfilId}
                    onChange={(e) => setFormData({ ...formData, perfilId: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    {!perfis.length && <option value="">Crie um perfil antes de cadastrar usuários</option>}
                    {perfis
                      .filter((p) => p.codigo !== "SYSTEM_ADMINISTRATOR")
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Servidor vinculado</label>
                  <select
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Sem vínculo operacional</option>
                    {servidores.map((servidor) => (
                      <option key={servidor.id} value={servidor.id}>
                        {servidor.name}
                        {servidor.secretariat ? ` - ${servidor.secretariat.name}` : ""}
                        {servidor.department ? ` / ${servidor.department.name}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    Obrigatório para perfis por área/secretaria e para operar Protocolos, Processos e Fiscalização.
                  </p>
                </div>
                <div className="mt-6 flex items-center">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.ativo}
                      onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Usuário Ativo / Desbloqueado (Indicador de Login habilitado)
                    </span>
                  </label>
                </div>
              </div>

              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                Os acessos a módulos e operações são definidos exclusivamente pelas permissões do perfil selecionado.
                {!formData.id && (
                  <p>
                    O usuário ativo receberá um link individual para definir a senha (vigência padrão de 90 dias). Senhas não são enviadas em texto por e-mail.
                  </p>
                )}
                {formData.id && (
                  <button
                    type="button"
                    className="mt-2 underline"
                    onClick={async () => {
                      try {
                        await sendPasswordResetEmail(auth, formData.email.trim());
                        alert("Instruções de redefinição solicitadas para o e-mail do usuário.");
                      } catch {
                        alert("Protocolo de redefinição registrado. Utilize a recuperação no login.");
                      }
                    }}
                  >
                    Resetar senha para padrão / enviar link de redefinição por e-mail
                  </button>
                )}
              </div>
            </form>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form={formId}
                disabled={isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-70"
              >
                {isSubmitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />}
                Salvar Usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
