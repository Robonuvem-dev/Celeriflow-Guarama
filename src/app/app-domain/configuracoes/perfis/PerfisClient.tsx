"use client";

import { useState } from "react";
import { 
  ShieldCheck, Plus, X, Pencil, CheckCircle2,
  Building2, Users, FileText, HeadphonesIcon, ShoppingCart, DollarSign,
  Package, Receipt, Stethoscope, GraduationCap, HeartHandshake, HardHat, 
   Trees, Shield, Droplets, Landmark, Palette, Share2, Settings, CheckSquare, Square, Trash2, Truck, BadgeCheck,
   Church, FileSignature, Headset, Lightbulb
} from "lucide-react";
import { deletePerfil, upsertPerfil, togglePerfilStatus } from "./actions";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

const columns: OperationalColumn[] = [
  { key: "name", label: "Nome do perfil", type: "text", initialWidth: 240, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "description", label: "Descrição", type: "text", initialWidth: 300, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "coverage", label: "Cobertura de módulos", type: "text", initialWidth: 210, minWidth: 155, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Status", type: "status", initialWidth: 100, minWidth: 75, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 140, minWidth: 116, maxWidth: 160, resizable: false, sortable: false, details: "none" },
];

type Perfil = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  permissoes: string | null;
  ativo: boolean;
  legacyModuleCodes: string[];
};

// Modules that can appear on the dashboard or have their own access boundary.
const MODULES_LIST = [
  { code: "ADMINISTRACAO", label: "Administração", icon: Building2, color: "text-blue-500" },
  { code: "PATRIMONIO", label: "Almoxarifado e Patrimônio", icon: Package, color: "text-amber-500" },
  { code: "SOCIAL", label: "Assistência Social", icon: HeartHandshake, color: "text-pink-500" },
  { code: "ATENDIMENTO", label: "Atendimento ao Cidadão", icon: HeadphonesIcon, color: "text-orange-500" },
  { code: "ASSINATURA_DIGITAL", label: "Assinatura Digital", icon: FileSignature, color: "text-violet-600" },
  { code: "SANEAMENTO", label: "Água e Saneamento", icon: Droplets, color: "text-blue-600" },
  { code: "CADASTROS", label: "Cadastros", icon: FileText, color: "text-purple-500" },
  { code: "CAMARA", label: "Câmara Municipal & Legislação", icon: Landmark, color: "text-violet-500" },
  { code: "CEMITERIOS", label: "Cemitérios", icon: Church, color: "text-stone-600" },
  { code: "COMPRAS", label: "Compras e Contratos", icon: ShoppingCart, color: "text-emerald-500" },
  { code: "CONFIGURACOES", label: "Configurações e Integrações", icon: Settings, color: "text-slate-600" },
  { code: "CULTURA", label: "Cultura e Lazer", icon: Palette, color: "text-fuchsia-500" },
  { code: "EDUCACAO", label: "Educação", icon: GraduationCap, color: "text-yellow-500" },
  { code: "FINANCEIRO", label: "Financeiro e Contábil", icon: DollarSign, color: "text-green-500" },
  { code: "FROTAS", label: "Frotas", icon: Truck, color: "text-teal-600" },
  { code: "MEIO_AMBIENTE", label: "Meio Ambiente", icon: Trees, color: "text-emerald-600" },
  { code: "OBRAS", label: "Obras e Construção Civil", icon: HardHat, color: "text-lime-500" },
  { code: "ILUMINACAO_PUBLICA", label: "Iluminação Pública (Iluminaflow)", icon: Lightbulb, color: "text-yellow-500" },
  { code: "PLANEJAMENTO", label: "Planejamento e Orçamento", icon: Landmark, color: "text-indigo-600" },
  { code: "PORTAL_SERVIDOR", label: "Portal do Servidor", icon: BadgeCheck, color: "text-sky-700" },
  { code: "TRANSPARENCIA", label: "Portal e Transparência", icon: Share2, color: "text-sky-500" },
  { code: "PROCESSOS", label: "Processos e Protocolo", icon: Share2, color: "text-cyan-500" },
  { code: "RH", label: "RH e Folha", icon: Users, color: "text-indigo-500" },
  { code: "SAUDE", label: "Saúde", icon: Stethoscope, color: "text-rose-500" },
  { code: "SEGURANCA", label: "Segurança e Mobilidade", icon: Shield, color: "text-slate-500" },
  { code: "SST", label: "Segurança e Medicina do Trabalho", icon: HardHat, color: "text-teal-600" },
  { code: "SUPORTE_TECNICO", label: "Suporte Técnico", icon: Headset, color: "text-sky-700" },
  { code: "TRIBUTACAO", label: "Tributário", icon: Receipt, color: "text-orange-500" },
];

type ModulePermission = {
  showDashboardCard: boolean;
  blocked: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  issueReports: boolean;
};

type PermissionKey = keyof Omit<ModulePermission, "blocked" | "showDashboardCard">;
const ACTIONS_LABELS: { key: PermissionKey; label: string }[] = [
  { key: "create", label: "Criar" },
  { key: "update", label: "Editar" },
  { key: "delete", label: "Excluir" },
  { key: "issueReports", label: "Emitir relatórios" },
];

const emptyPermission = (): ModulePermission => ({
  showDashboardCard: true,
  blocked: true,
  create: false,
  update: false,
  delete: false,
  issueReports: false,
});

export default function PerfisClient({ perfis, capabilities }: { perfis: Perfil[]; capabilities: { create: boolean; update: boolean; delete: boolean } }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dados" | "matriz">("matriz");

  const [formData, setFormData] = useState<{
    id?: string;
    nome: string;
    descricao: string;
    ativo: boolean;
    accessLevel: "operacional";
    permissionsMap: Record<string, ModulePermission>;
  }>({
    nome: "",
    descricao: "",
    ativo: true,
    accessLevel: "operacional",
    permissionsMap: {},
  });

  const filtered = perfis.filter((p) =>
    p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.descricao && p.descricao.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const pageProfiles = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  function parsePermissionsJSON(jsonStr: string | null, legacyModuleCodes: string[] = []): { accessLevel: "operacional"; map: Record<string, ModulePermission> } {
    const map = Object.fromEntries(MODULES_LIST.map((moduleItem) => [moduleItem.code, emptyPermission()])) as Record<string, ModulePermission>;
    const finalizeMap = () => ({ accessLevel: "operacional" as const, map });

    if (!jsonStr) return finalizeMap();
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      if (parsed.ALL) {
        MODULES_LIST.forEach((m) => {
          map[m.code] = { showDashboardCard: true, blocked: false, create: true, update: true, delete: true, issueReports: false };
        });
        return finalizeMap();
      }
      if (parsed.acesso === "total" && !parsed.modules) {
        MODULES_LIST.forEach((moduleItem) => {
          map[moduleItem.code] = { showDashboardCard: true, blocked: false, create: true, update: true, delete: true, issueReports: false };
        });
        return finalizeMap();
      }
      const modules = parsed.modules;
      if (modules && typeof modules === "object" && !Array.isArray(modules)) {
        for (const moduleItem of MODULES_LIST) {
          const raw = (modules as Record<string, unknown>)[moduleItem.code];
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
          const permission = raw as Partial<ModulePermission>;
          const blocked = permission.blocked === true;
          map[moduleItem.code] = {
            showDashboardCard: true,
            blocked,
            create: !blocked && permission.create === true,
            update: !blocked && permission.update === true,
            delete: !blocked && permission.delete === true,
            issueReports: !blocked && permission.issueReports === true,
          };
        }
        return finalizeMap();
      }
      const blockedModules = Array.isArray(parsed.modulosBloqueados) ? parsed.modulosBloqueados : [];
      const allowedModules = Array.isArray(parsed.modulosPermitidos) ? parsed.modulosPermitidos : null;
      for (const moduleItem of MODULES_LIST) {
        const legacyActions = Array.isArray(parsed[moduleItem.code]) ? parsed[moduleItem.code] as string[] : [];
        const allowed = allowedModules
          ? allowedModules.includes(moduleItem.code)
          : legacyActions.length > 0 || legacyModuleCodes.includes(moduleItem.code);
        const blocked = blockedModules.includes(moduleItem.code) || !allowed;
        map[moduleItem.code] = {
          showDashboardCard: true,
          blocked,
          create: !blocked && legacyActions.includes("create"),
          update: !blocked && legacyActions.includes("update"),
          delete: !blocked && legacyActions.includes("delete"),
          issueReports: false,
        };
      }
      return finalizeMap();
    } catch {
      return finalizeMap();
    }
  }

  function serializePermissionsJSON(accessLevel: "operacional", map: Record<string, ModulePermission>): string {
    const cleanedMap = Object.fromEntries(Object.entries(map).map(([code, permission]) => [code, { ...permission, showDashboardCard: true }]));
    return JSON.stringify({
      acesso: accessLevel,
      modules: cleanedMap,
      modulosBloqueados: MODULES_LIST.filter((moduleItem) => cleanedMap[moduleItem.code]?.blocked).map((moduleItem) => moduleItem.code),
    });
  }

  function openNew() {
    if (!capabilities.create) return;
    const defaultMap: Record<string, ModulePermission> = {};
    MODULES_LIST.forEach((m) => {
      defaultMap[m.code] = emptyPermission();
    });
    setFormData({ nome: "", descricao: "", ativo: true, accessLevel: "operacional", permissionsMap: defaultMap });
    setActiveTab("matriz");
    setIsModalOpen(true);
  }

  function openEdit(p: Perfil) {
    const parsed = parsePermissionsJSON(p.permissoes, p.legacyModuleCodes);
    setFormData({ id: p.id, nome: p.nome, descricao: p.descricao ?? "", ativo: p.ativo, accessLevel: parsed.accessLevel, permissionsMap: parsed.map });
    setActiveTab("matriz");
    setIsModalOpen(true);
  }

  const toggleAction = (moduleCode: string, action: PermissionKey) => {
    setFormData((prev) => {
      const current = prev.permissionsMap[moduleCode] || emptyPermission();
      return {
        ...prev,
        permissionsMap: { ...prev.permissionsMap, [moduleCode]: { ...current, [action]: !current[action] } },
      };
    });
  };

  const toggleModuleAccess = (moduleCode: string) => {
    setFormData((prev) => {
      const current = prev.permissionsMap[moduleCode] || emptyPermission();
      const blocked = !current.blocked;
      return {
        ...prev,
        permissionsMap: {
          ...prev.permissionsMap,
          [moduleCode]: blocked ? { ...current, blocked, create: false, update: false, delete: false, issueReports: false } : { ...current, blocked },
        },
      };
    });
  };

  const toggleAllModuleActions = (moduleCode: string) => {
    setFormData((prev) => {
      const current = prev.permissionsMap[moduleCode] || emptyPermission();
      const allSelected = !current.blocked && current.create && current.update && current.delete && current.issueReports;
      const updated = allSelected
        ? emptyPermission()
        : { showDashboardCard: true, blocked: false, create: true, update: true, delete: true, issueReports: true };
      return {
        ...prev,
        permissionsMap: { ...prev.permissionsMap, [moduleCode]: updated },
      };
    });
  };

  const applyPreset = (preset: "FULL" | "READ_ONLY" | "CLEAR") => {
    const newMap: Record<string, ModulePermission> = {};
    MODULES_LIST.forEach((m) => {
      if (preset === "FULL") {
        newMap[m.code] = { showDashboardCard: true, blocked: false, create: true, update: true, delete: true, issueReports: true };
      } else if (preset === "READ_ONLY") {
        newMap[m.code] = { showDashboardCard: true, blocked: false, create: false, update: false, delete: false, issueReports: false };
      } else {
        newMap[m.code] = emptyPermission();
      }
    });
    setFormData((prev) => ({ ...prev, permissionsMap: newMap }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formData.id ? !capabilities.update : !capabilities.create) return;
    setIsSubmitting(true);
    const jsonPerms = serializePermissionsJSON(formData.accessLevel, formData.permissionsMap);
    const result = await upsertPerfil({
      id: formData.id,
      nome: formData.nome,
      descricao: formData.descricao,
      ativo: formData.ativo,
      permissoes: jsonPerms,
    });
    if (result.error) {
      alert(result.error);
    } else {
      setIsModalOpen(false);
    }
    setIsSubmitting(false);
  }

  async function handleToggle(id: string, ativo: boolean) {
    if (!capabilities.update) return;
    const result = await togglePerfilStatus(id, !ativo);
    if (result.error) alert(result.error);
  }

  async function handleDelete(perfil: Perfil) {
    if (!capabilities.delete) return;
    if (!window.confirm(`Excluir o perfil "${perfil.nome}"? Esta ação não pode ser desfeita.`)) return;

    setDeletingId(perfil.id);
    const result = await deletePerfil(perfil.id);
    if (result.error) alert(result.error);
    setDeletingId(null);
  }

  return (
    <>
      <OperationalListFrame label="Gestão de perfis e permissões"
        actions={capabilities.create ? <button onClick={openNew} className={styles.newButton}><Plus />Criar perfil</button> : undefined}
        toolbar={<input type="search" aria-label="Buscar perfis" placeholder="Buscar perfil..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }} className={styles.searchInput} />}
        pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
          <OperationalTable columns={columns} preferenceId="configuracoes-perfis" caption="Perfis e permissões" emptyMessage="Nenhum perfil encontrado." rows={pageProfiles.map((perfil) => {
                  const permMap = parsePermissionsJSON(perfil.permissoes, perfil.legacyModuleCodes).map;
                  const activeModulesCount = MODULES_LIST.filter((moduleItem) => {
                    const permission = permMap[moduleItem.code];
                    return permission && !permission.blocked;
                  }).length;

                  return {
                    id: perfil.id, label: perfil.nome,
                    values: { name: perfil.nome, description: perfil.descricao || "Perfil de acesso padrão do sistema municipal.", coverage: activeModulesCount === MODULES_LIST.length ? `Todos os ${MODULES_LIST.length} Módulos` : `${activeModulesCount} de ${MODULES_LIST.length} Módulos`, status: perfil.ativo ? "Ativo" : "Inativo" },
                    cells: { status: <button onClick={() => handleToggle(perfil.id, perfil.ativo)} disabled={!capabilities.update} aria-label={`Alterar status de ${perfil.nome}`} className="h-6 max-w-full rounded px-1 font-medium">{perfil.ativo ? "Ativo" : "Inativo"}</button> },
                    actions: <div className={styles.rowActions}>
                          <button
                            onClick={() => openEdit(perfil)}
                            aria-label={`${capabilities.update ? "Configurar" : "Visualizar"} permissões de ${perfil.nome}`}
                            className={styles.iconButton} title="Permissões"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {capabilities.delete && perfil.codigo !== "SYSTEM_ADMINISTRATOR" && (
                            <button
                              onClick={() => handleDelete(perfil)}
                              disabled={deletingId === perfil.id}
                              className={styles.iconButton} aria-label={`Excluir ${perfil.nome}`} title="Excluir perfil"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>,
                  };
                })} />
      </OperationalListFrame>

      {/* Permissions Config Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 rounded-lg">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                    {formData.id ? `Configurar Perfil: ${formData.nome}` : "Novo Perfil de Acesso"}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Defina as permissões granulares por módulo para os usuários vinculados.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Tabs Header & Quick Presets */}
            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("matriz")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === "matriz"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  🛡️ Matriz de Permissões ({MODULES_LIST.length} Módulos)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("dados")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === "dados"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                  }`}
                >
                  📝 Dados do Perfil
                </button>
              </div>

              {activeTab === "matriz" && (formData.id ? capabilities.update : capabilities.create) && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-semibold mr-1">Presets Rápidos:</span>
                  <button
                    type="button"
                    onClick={() => applyPreset("FULL")}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 hover:opacity-90"
                  >
                    ⚡ Acesso Total
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("READ_ONLY")}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800 hover:opacity-90"
                  >
                    Sem ações operacionais
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("CLEAR")}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:opacity-90"
                  >
                    🧹 Limpar Tudo
                  </button>
                </div>
              )}
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmit} className="space-y-5 p-4">
              <fieldset disabled={formData.id ? !capabilities.update : !capabilities.create} className="space-y-5">
              {activeTab === "dados" && (
                <div className="space-y-4 max-w-xl mx-auto py-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nome do Perfil *
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Ex: Fiscal de Obras / Gestor de Compras"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Descrição & Responsabilidades
                    </label>
                    <textarea
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      rows={3}
                      className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                      placeholder="Descreva as atribuições deste perfil no sistema público..."
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="ativo-check"
                      checked={formData.ativo}
                      onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="ativo-check" className="text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                      Perfil Habilitado no Sistema
                    </label>
                  </div>
                </div>
              )}

              {activeTab === "matriz" && (
                <div className="space-y-4">
                  <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                    Módulos ativos sempre aparecem no Dashboard. Quando o perfil fica sem acesso, o cartão permanece visível, acinzentado e bloqueado. A ativação geral é administrada em Configurações e Integrações &gt; Módulos.
                  </p>
                  <div className="grid grid-cols-1 gap-3">
                    {MODULES_LIST.map((moduleItem) => {
                      const IconComponent = moduleItem.icon;
                       const permission = formData.permissionsMap[moduleItem.code] || emptyPermission();
                       const isAllSelected = !permission.blocked && permission.create && permission.update && permission.delete && permission.issueReports;

                      return (
                        <div
                          key={moduleItem.code}
                          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-indigo-500/30 transition-all space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${moduleItem.color}`}>
                                <IconComponent className="w-5 h-5" />
                              </div>
                              <div>
                                <span className="font-bold text-sm text-slate-900 dark:text-white">{moduleItem.label}</span>
                                <span className="text-[11px] block text-slate-400 font-mono">Código: {moduleItem.code}</span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleAllModuleActions(moduleItem.code)}
                              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                            >
                              {isAllSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                              {isAllSelected ? "Desmarcar Módulo" : "Marcar Todas"}
                            </button>
                          </div>

                           <div className="grid grid-cols-1 gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
                              <label className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium cursor-pointer ${permission.blocked ? "bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-200" : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200"}`}>
                                <input type="checkbox" checked={!permission.blocked} onChange={() => toggleModuleAccess(moduleItem.code)} className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5" />
                                <span>Acessar e visualizar módulo {!permission.blocked ? "(liberado)" : "(cartão bloqueado no Dashboard)"}</span>
                              </label>
                           </div>
                            {!permission.blocked ? (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                             {ACTIONS_LABELS.map((act) => {
                               const isChecked = permission[act.key];
                              return (
                                <label
                                  key={act.key}
                                  className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-all ${
                                    isChecked
                                      ? "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200"
                                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleAction(moduleItem.code, act.key)}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                                  />
                                  <span>{act.label}</span>
                                </label>
                             );
                              })}
                             </div>
                           ) : (
                             <p className="text-xs text-rose-700 dark:text-rose-300">Módulo bloqueado: as permissões operacionais ficam indisponíveis até o desbloqueio.</p>
                           )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              </fieldset>
            </form>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                As permissões definidas neste perfil serão aplicadas a todos os usuários vinculados.
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || (formData.id ? !capabilities.update : !capabilities.create)}
                  className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-70 flex items-center gap-2 shadow-md"
                >
                  {isSubmitting ? (
                    <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Salvar Matriz de Permissões
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
