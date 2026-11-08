"use client";

import { useState, useTransition } from "react";
import { Download, FileText, Search, RotateCcw, UserCheck, UserX, CheckCircle2, XCircle } from "lucide-react";
import { toggleSectorResponsibleStatus } from "./actions";

export interface SectorResponsibleRow {
  departmentId: string;
  departmentName: string;
  acronym: string | null;
  secretariatId: string;
  secretariatName: string;
  unitId: string | null;
  unitName: string;
  responsibleEmployeeId: string | null;
  responsibleName: string | null;
  isResponsibleActive: boolean;
}

export function SectorResponsiblesView({
  rows,
  orgs,
  units,
  staff,
  canUpdate,
}: {
  rows: SectorResponsibleRow[];
  orgs: { id: string; name: string }[];
  units: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  canUpdate: boolean;
}) {
  const [filterResponsible, setFilterResponsible] = useState("");
  const [filterOrg, setFilterOrg] = useState("");
  const [filterUnit, setFilterUnit] = useState("");
  const [filterSector, setFilterSector] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = rows.filter(r => {
    if (filterResponsible && !(r.responsibleName || "").toLowerCase().includes(filterResponsible.toLowerCase())) return false;
    if (filterOrg && r.secretariatId !== filterOrg) return false;
    if (filterUnit && r.unitId !== filterUnit) return false;
    if (filterSector && !r.departmentName.toLowerCase().includes(filterSector.toLowerCase()) && !(r.acronym || "").toLowerCase().includes(filterSector.toLowerCase())) return false;
    return true;
  });

  function handleExportCsv() {
    const headers = ["Orgao", "Unidade", "Setor", "Sigla", "Responsavel", "SituacaoResponsavel"];
    const csvRows = filtered.map(r => [
      `"${r.secretariatName.replace(/"/g, '""')}"`,
      `"${r.unitName.replace(/"/g, '""')}"`,
      `"${r.departmentName.replace(/"/g, '""')}"`,
      `"${r.acronym || ""}"`,
      `"${(r.responsibleName || "Sem responsável").replace(/"/g, '""')}"`,
      r.isResponsibleActive ? "Ativo" : "Inativo / Não designado",
    ]);
    const csvContent = "\uFEFF" + [headers.join(";"), ...csvRows.map(row => row.join(";"))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `consulta-responsaveis-setor-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportHtml() {
    const rowsHtml = filtered.map(r => `
      <tr>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${r.secretariatName}</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${r.unitName}</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0;">${r.departmentName} (${r.acronym || "—"})</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 600;">${r.responsibleName || "—"}</td>
        <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">${r.isResponsibleActive ? "Ativo" : "Inativo / Vago"}</td>
      </tr>
    `).join("");

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Consulta de Responsáveis pelo Setor (19.40)</title>
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
        <h1>Consulta de Responsáveis pelo Setor (19.40)</h1>
        <p>Extraído em ${new Date().toLocaleString("pt-BR")} • Total: ${filtered.length} setores consultados</p>
        <table>
          <thead>
            <tr>
              <th>Órgão / Secretaria</th>
              <th>Unidade Administrativa</th>
              <th>Setor / Departamento</th>
              <th>Servidor Responsável</th>
              <th style="text-align: center;">Situação</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="5" style="text-align:center; padding: 16px;">Nenhum responsável encontrado para os filtros selecionados.</td></tr>'}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  function handleToggleStatus(departmentId: string, currentActive: boolean) {
    if (!confirm(currentActive ? "Deseja inativar o responsável atual deste setor?" : "Deseja ativar o responsável selecionado?")) return;
    startTransition(async () => {
      await toggleSectorResponsibleStatus(departmentId, !currentActive);
    });
  }

  function handleClearFilters() {
    setFilterResponsible("");
    setFilterOrg("");
    setFilterUnit("");
    setFilterSector("");
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <UserCheck className="h-5 w-5 text-[#0e4c7e]" />
            Consulta de Responsáveis pelo Setor (19.40)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Filtre por servidor responsável, órgão, unidade ou setor com exportação em CSV e HTML. Permite ativar/inativar o responsável (19.8 / 19.39).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            title="Exportar para CSV (19.40)"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={handleExportHtml}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            title="Exportar para HTML (19.40)"
          >
            <FileText className="h-3.5 w-3.5 text-indigo-600" />
            Exportar HTML
          </button>
        </div>
      </div>

      {/* Faixa de Filtros 19.40: responsável, órgão, unidade, setor */}
      <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Responsável</label>
          <input
            type="text"
            value={filterResponsible}
            onChange={e => setFilterResponsible(e.target.value)}
            placeholder="Nome do responsável..."
            className="h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0e4c7e]"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Órgão / Secretaria</label>
          <select
            value={filterOrg}
            onChange={e => setFilterOrg(e.target.value)}
            className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0e4c7e]"
          >
            <option value="">Todos os órgãos</option>
            {orgs.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Unidade Administrativa</label>
          <select
            value={filterUnit}
            onChange={e => setFilterUnit(e.target.value)}
            className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0e4c7e]"
          >
            <option value="">Todas as unidades</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Setor / Departamento</label>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={filterSector}
              onChange={e => setFilterSector(e.target.value)}
              placeholder="Nome ou sigla do setor..."
              className="h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0e4c7e]"
            />
            {(filterResponsible || filterOrg || filterUnit || filterSector) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex h-8 items-center px-2 rounded-md border border-slate-300 bg-white text-xs text-slate-600 hover:bg-slate-100"
                title="Limpar filtros"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabela de Resultados */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-700 font-semibold">
              <th className="py-2.5 px-3">Setor / Sigla</th>
              <th className="py-2.5 px-3">Órgão / Secretaria</th>
              <th className="py-2.5 px-3">Unidade Administrativa</th>
              <th className="py-2.5 px-3">Responsável Designado</th>
              <th className="py-2.5 px-3 text-center">Situação do Responsável (19.8 / 19.39)</th>
              {canUpdate && <th className="py-2.5 px-3 text-right">Ação</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  Nenhum setor ou responsável encontrado com os critérios informados.
                </td>
              </tr>
            ) : (
              filtered.map(r => (
                <tr key={r.departmentId} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3">
                    <span className="font-bold text-slate-900">{r.departmentName}</span>
                    {r.acronym && (
                      <span className="ml-1.5 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 uppercase">
                        {r.acronym}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{r.secretariatName}</td>
                  <td className="py-2.5 px-3 text-slate-600">{r.unitName}</td>
                  <td className="py-2.5 px-3 font-medium">
                    {r.responsibleName ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-900">
                        <UserCheck className="h-3.5 w-3.5 text-[#0e4c7e]" />
                        {r.responsibleName}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Sem responsável designado</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {r.isResponsibleActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" />
                        Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        <XCircle className="h-3 w-3" />
                        Inativo / Vago
                      </span>
                    )}
                  </td>
                  {canUpdate && (
                    <td className="py-2.5 px-3 text-right">
                      {r.isResponsibleActive ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleToggleStatus(r.departmentId, true)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          title="Inativar responsável pelo setor (19.8 / 19.39)"
                        >
                          <UserX className="h-3 w-3" />
                          Inativar Responsável
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Designar em Setores</span>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
