"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Plus, Download, FileText, Search, RotateCcw, AlertTriangle, ExternalLink } from "lucide-react";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { saveProcessReference } from "./actions";
import { processReferenceKinds } from "@/lib/protocols/reference-catalog";

type KindKey = keyof typeof processReferenceKinds;

interface SubjectOption {
  id: string;
  name: string;
}

interface ReferenceRecord {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  subjectId: string | null;
  isActive: boolean;
  createdAt: Date;
}

const columns: OperationalColumn[] = [
  { key: "name", label: "Descrição / Nome", initialWidth: 260, minWidth: 160, maxWidth: 450, type: "text", resizable: true, sortable: false, details: "overflow" },
  { key: "subject", label: "Assunto Vinculado", initialWidth: 200, minWidth: 140, maxWidth: 350, type: "text", resizable: true, sortable: false, details: "overflow" },
  { key: "details", label: "Detalhes / Link / Portal", initialWidth: 280, minWidth: 160, maxWidth: 500, type: "text", resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", initialWidth: 110, minWidth: 90, maxWidth: 140, type: "status", resizable: true, sortable: false, details: "none" },
  { key: "actions", label: "Ações", initialWidth: 110, minWidth: 90, maxWidth: 140, type: "actions", resizable: false, sortable: false, details: "none" },
];

export default function ProcessReferenceClient({
  records,
  subjects,
  currentKind,
  searchQuery,
  canCreate,
  canUpdate,
}: {
  records: ReferenceRecord[];
  subjects: SubjectOption[];
  currentKind: KindKey;
  searchQuery: string;
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  // 19.24: Check duplicate names in current kind
  const existingNames = useMemo(() => {
    return new Set(records.map(r => r.name.trim().toLowerCase()));
  }, [records]);

  const isDuplicate = useMemo(() => {
    const trimmed = newName.trim().toLowerCase();
    return trimmed.length > 0 && existingNames.has(trimmed);
  }, [newName, existingNames]);

  // Autocomplete suggestions (19.24)
  const suggestions = useMemo(() => {
    if (!newName.trim() || newName.length < 2) return [];
    const term = newName.trim().toLowerCase();
    return records
      .filter(r => r.name.toLowerCase().includes(term))
      .map(r => r.name)
      .slice(0, 5);
  }, [newName, records]);

  // 19.105: Export to CSV
  function handleExportCsv() {
    const headers = ["Categoria", "Descricao", "Assunto", "Detalhes", "Situacao", "DataCadastro"];
    const rows = records.map(r => [
      `"${processReferenceKinds[currentKind] || r.kind}"`,
      `"${r.name.replace(/"/g, '""')}"`,
      `"${(subjects.find(s => s.id === r.subjectId)?.name || "").replace(/"/g, '""')}"`,
      `"${(r.description || "").replace(/"/g, '""')}"`,
      r.isActive ? "Ativo" : "Inativo",
      new Date(r.createdAt).toLocaleDateString("pt-BR"),
    ]);
    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map(row => row.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cadastros-processos-${currentKind.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // 19.105: Export to HTML
  function handleExportHtml() {
    const rowsHtml = records.map(r => `
      <tr>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${r.name}</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${subjects.find(s => s.id === r.subjectId)?.name || "—"}</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${r.description || "—"}</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">${r.isActive ? "Ativo" : "Inativo"}</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">${new Date(r.createdAt).toLocaleDateString("pt-BR")}</td>
      </tr>
    `).join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Relatório de Cadastros — ${processReferenceKinds[currentKind]}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #1e293b; }
          h1 { font-size: 20px; margin-bottom: 4px; }
          p { font-size: 13px; color: #64748b; margin-top: 0; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #f8fafc; padding: 10px 8px; border: 1px solid #cbd5e1; text-align: left; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="margin-bottom: 16px;">
          <button onclick="window.print()" style="padding: 8px 16px; background: #0e4c7e; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Imprimir Relatório</button>
        </div>
        <h1>Cadastros de Processos — ${processReferenceKinds[currentKind]}</h1>
        <p>Extraído em ${new Date().toLocaleString("pt-BR")} • Total: ${records.length} registros</p>
        <table>
          <thead>
            <tr>
              <th>Descrição / Nome</th>
              <th>Assunto Vinculado</th>
              <th>Detalhes / Link</th>
              <th style="text-align: center;">Situação</th>
              <th style="text-align: center;">Cadastro</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="5" style="text-align:center; padding: 16px;">Nenhum registro encontrado.</td></tr>'}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  return (
    <OperationalListFrame
      label={`Cadastros — ${processReferenceKinds[currentKind]}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowNewForm(current => !current)}
              className={styles.newButton}
            >
              <Plus className="w-4 h-4" />
              {showNewForm ? "Fechar Formulário" : `Novo ${processReferenceKinds[currentKind]}`}
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            className={styles.dialogButton}
            title="Exportar registros filtrados para CSV (19.105)"
          >
            <Download className="w-4 h-4" />
            Exportar CSV (19.105)
          </button>
          <button
            type="button"
            onClick={handleExportHtml}
            className={styles.dialogButton}
            title="Exportar registros para visualização HTML/Impressão (19.105)"
          >
            <FileText className="w-4 h-4" />
            Exportar HTML (19.105)
          </button>
        </div>
      }
      toolbar={
        <div className="flex flex-col gap-3 w-full">
          {/* Navegação entre categorias do catálogo */}
          <nav className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-200 dark:border-slate-800">
            {Object.entries(processReferenceKinds).map(([value, label]) => {
              const active = value === currentKind;
              return (
                <Link
                  key={value}
                  href={`/protocolos/cadastros?kind=${value}`}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition ${
                    active
                      ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                      : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Barra de pesquisa e botão limpar (19.107) */}
          <form method="get" action="/protocolos/cadastros" className={styles.searchForm}>
            <input type="hidden" name="kind" value={currentKind} />
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder={`Pesquisar ${processReferenceKinds[currentKind].toLowerCase()}...`}
              aria-label="Pesquisar descrição"
              className={styles.searchInput}
            />
            <button type="submit" className={styles.filterButton}>
              <Search className="w-3.5 h-3.5 inline mr-1" />
              Pesquisar
            </button>
            <Link
              href={`/protocolos/cadastros?kind=${currentKind}`}
              className={styles.filterButton}
              title="Limpar pesquisa e filtros (19.107)"
            >
              <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
              Limpar (19.107)
            </Link>
          </form>
        </div>
      }
      pagination={
        <OperationalLinkPagination
          page={1}
          total={records.length}
          pathname="/protocolos/cadastros"
          values={{ kind: currentKind, q: searchQuery }}
        />
      }
    >
      {/* Formulário de Novo Cadastro com AutoComplete contra duplicidade (19.24) */}
      {showNewForm && canCreate && (
        <section className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
            <h2 className="text-sm font-bold text-slate-900">
              Cadastrar: {processReferenceKinds[currentKind]}
            </h2>
            <span className="text-xs text-slate-500">
              Campos com auto-complete e prevenção ativa de duplicidade (19.24)
            </span>
          </div>

          <form action={saveProcessReference} className="space-y-4">
            <input type="hidden" name="kind" value={currentKind} />

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {/* Campo Nome com AutoComplete e Aviso de Duplicidade (19.24) */}
              <div className="space-y-1 relative sm:col-span-2 md:col-span-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Descrição / Nome *
                </label>
                <input
                  name="name"
                  required
                  maxLength={200}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={`Ex: Nome do ${processReferenceKinds[currentKind].toLowerCase()}`}
                  className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />

                {/* Aviso contra duplicidade (19.24) */}
                {isDuplicate && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Atenção: Já existe um registro com este nome nesta categoria (19.24).
                  </p>
                )}

                {/* Sugestões de autocomplete contra duplicidade (19.24) */}
                {suggestions.length > 0 && !isDuplicate && (
                  <div className="absolute top-full left-0 z-10 w-full rounded-md border border-slate-200 bg-white shadow-lg text-xs">
                    <div className="p-1 bg-slate-50 text-[10px] text-slate-500 font-semibold border-b">
                      Cadastros similares já existentes:
                    </div>
                    {suggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setNewName(suggestion)}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-800"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Vínculo de Assunto (19.4, 19.43, 19.83) */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Assunto Vinculado {currentKind === "SUBJECT_CHILD" ? "*" : "(Opcional)"}
                </label>
                <select
                  name="subjectId"
                  required={currentKind === "SUBJECT_CHILD"}
                  className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-600"
                >
                  <option value="">
                    {currentKind === "SUBJECT_CHILD" ? "Selecione o assunto pai *" : "Sem vínculo específico"}
                  </option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Detalhes / Orientações / Link (19.2, 19.53) */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  {currentKind === "REQUIRED_DOCUMENT" ? "Link do Modelo / Instruções (19.2)" : "Detalhes / Orientações"}
                </label>
                <input
                  name="description"
                  maxLength={2000}
                  placeholder={
                    currentKind === "REQUIRED_DOCUMENT"
                      ? "https://... ou orientações sobre o documento"
                      : currentKind === "SUBJECT_CHILD"
                      ? "Informações a apresentar no portal (19.53)"
                      : currentKind === "JUSTIFICATION"
                      ? "Fundamentação da justificativa (19.83)"
                      : currentKind === "LABEL_STYLE"
                      ? "Tamanho (ex: 100x50mm, Pimaco A4, etc.)"
                      : "Informações adicionais..."
                  }
                  className="w-full rounded-md border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input name="isActive" type="checkbox" defaultChecked className="rounded border-slate-300" />
                Ativo para seleção operacional e portal
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-md bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  Cadastrar Registro
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* Tabela Operacional de Registros */}
      <OperationalTable
        columns={columns}
        preferenceId={`protocolos.cadastros.${currentKind}`}
        caption={`Registros de ${processReferenceKinds[currentKind]}`}
        emptyMessage={`Nenhum registro de ${processReferenceKinds[currentKind].toLowerCase()} cadastrado.`}
        rows={records.map(record => {
          const isEditing = editingId === record.id;
          const subject = subjects.find(s => s.id === record.subjectId);
          const hasLink = record.description && (record.description.startsWith("http://") || record.description.startsWith("https://"));

          return {
            id: record.id,
            label: record.name,
            values: {
              name: record.name,
              subject: subject?.name || "Sem vínculo",
              details: record.description || "—",
              status: record.isActive ? "Ativo" : "Inativo",
            },
            cells: {
              name: isEditing ? (
                <form id={`edit-form-${record.id}`} action={saveProcessReference} className="flex gap-2">
                  <input type="hidden" name="id" value={record.id} />
                  <input type="hidden" name="kind" value={currentKind} />
                  <input
                    name="name"
                    required
                    maxLength={200}
                    defaultValue={record.name}
                    className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                </form>
              ) : (
                <span className="font-semibold text-slate-800">{record.name}</span>
              ),
              subject: isEditing ? (
                <select
                  form={`edit-form-${record.id}`}
                  name="subjectId"
                  defaultValue={record.subjectId || ""}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="">Sem vínculo</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-slate-600">{subject?.name || "—"}</span>
              ),
              details: isEditing ? (
                <input
                  form={`edit-form-${record.id}`}
                  name="description"
                  maxLength={2000}
                  defaultValue={record.description || ""}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                />
              ) : hasLink ? (
                <a
                  href={record.description!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 hover:underline font-medium"
                >
                  <ExternalLink className="w-3 h-3" />
                  Abrir link do documento (19.2)
                </a>
              ) : (
                <span className="text-slate-600">{record.description || "—"}</span>
              ),
              status: isEditing ? (
                <label className="flex items-center gap-1 text-xs">
                  <input
                    form={`edit-form-${record.id}`}
                    name="isActive"
                    type="checkbox"
                    defaultChecked={record.isActive}
                  />
                  Ativo
                </label>
              ) : (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                    record.isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  {record.isActive ? "Ativo" : "Inativo"}
                </span>
              ),
            },
            actions: (
              <div className={styles.rowActions}>
                {canUpdate && (
                  isEditing ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="submit"
                        form={`edit-form-${record.id}`}
                        className="px-2 py-0.5 text-xs font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2 py-0.5 text-xs font-semibold bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingId(record.id)}
                      className={styles.iconButton}
                      title="Editar cadastro"
                    >
                      Editar
                    </button>
                  )
                )}
              </div>
            ),
          };
        })}
      />
    </OperationalListFrame>
  );
}
