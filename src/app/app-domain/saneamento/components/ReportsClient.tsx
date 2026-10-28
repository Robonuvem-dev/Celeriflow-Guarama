"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Filter, Pencil, PowerOff, Search } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { inactivateSavedReport, updateSavedReport } from "../actions";
import { SanitationTable, SanitationPagination } from "./SanitationTable";
import styles from "./sanitation.module.css";

type Report = {
  id: string;
  name: string;
  type: string;
  period: string;
  format: string;
  active: boolean;
};

export function ReportsClient({ reports }: { reports: Report[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [activeFilter, setActiveFilter] = useState("Ativos");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [saving, setSaving] = useState(false);
  const [inactivatingId, setInactivatingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const types = ["Todos", ...Array.from(new Set(reports.map((report) => report.type)))];
  const query = search.trim().toLowerCase();
  const filteredReports = reports.filter((report) => {
    const matchesSearch = !query || [report.name, report.type, report.period, report.format].some((value) => value.toLowerCase().includes(query));
    const matchesType = typeFilter === "Todos" || report.type === typeFilter;
    const matchesActive = activeFilter === "Todos" || (activeFilter === "Ativos" ? report.active : !report.active);
    return matchesSearch && matchesType && matchesActive;
  });
  const pageSize = 20;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredReports.length / pageSize)));
  const paged = filteredReports.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function closeSheet() {
    setSelectedReport(null);
    setError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedReport) return;

    setSaving(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const result = await updateSavedReport(selectedReport.id, {
      name: formData.get("name") as string,
      type: formData.get("type") as string,
      period: formData.get("period") as string,
      format: formData.get("format") as string,
    });

    if (result.error) {
      setError(result.error);
    } else {
      closeSheet();
      startTransition(() => router.refresh());
    }
    setSaving(false);
  }

  async function handleInactivate(report: Report) {
    if (!confirm(`Inativar o relatório "${report.name}"?`)) return;

    setInactivatingId(report.id);
    setError("");
    const result = await inactivateSavedReport(report.id);
    if (result.error) {
      setError(result.error);
    } else {
      startTransition(() => router.refresh());
    }
    setInactivatingId(null);
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800" aria-label="Lista de relatórios">
      <div className="flex flex-col gap-2 border-b border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              placeholder="Buscar relatório..."
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              className="h-9 w-full rounded-md border bg-white py-1.5 pr-3 pl-8 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0284C7] dark:bg-gray-900 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-1">
            <Filter className="h-3.5 w-3.5 text-gray-400" />
            <select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }} aria-label="Filtrar relatórios por tipo" className="h-9 rounded-md border bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0284C7] dark:bg-gray-900 dark:text-white">
              {types.map((type) => <option key={type}>{type}</option>)}
            </select>
          </div>
          <select value={activeFilter} onChange={(event) => { setActiveFilter(event.target.value); setPage(1); }} aria-label="Filtrar relatórios por situação" className="h-9 rounded-md border bg-white px-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0284C7] dark:bg-gray-900 dark:text-white">
            <option>Ativos</option>
            <option>Inativos</option>
            <option>Todos</option>
          </select>
        </div>
        <span className="text-xs text-gray-400">{filteredReports.length} relatório{filteredReports.length !== 1 ? "s" : ""}</span>
      </div>

      {error && <div className="mx-3 mt-3 rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</div>}

      {filteredReports.length === 0 ? (
        <div className="min-h-0 flex-1 p-10 text-center text-sm text-gray-400">
          <FileText className="mx-auto mb-3 h-10 w-10 text-gray-200" />
          Nenhum relatório encontrado.
        </div>
      ) : (
        <SanitationTable columns={[
          { label: "Relatório", width: 35 }, { label: "Tipo", width: 20 }, { label: "Período", width: 15 },
          { label: "Formato", width: 10 }, { label: "Status", width: 12 }, { label: "Ações", width: 8, align: "right" },
        ]}>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {paged.map((report) => (
                <tr key={report.id} className="text-xs text-gray-600 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{report.name}</td>
                  <td className="px-3 py-2">{report.type}</td>
                  <td className="px-3 py-2">{report.period}</td>
                  <td className="px-3 py-2">{report.format}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-1.5 py-0.5 font-medium ${report.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{report.active ? "Ativo" : "Inativo"}</span></td>
                  <td className="px-3 py-2"><div className="flex justify-end gap-1">
                    <button onClick={() => { setError(""); setSelectedReport(report); }} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-[#0284C7]" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleInactivate(report)} disabled={!report.active || inactivatingId === report.id} className="rounded p-1.5 text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-500 disabled:cursor-not-allowed disabled:opacity-40" title="Inativar"><PowerOff className="h-3.5 w-3.5" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
        </SanitationTable>
      )}

      <Sheet open={selectedReport !== null} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent side="right" className={styles.sheet}>
          <SheetHeader>
            <SheetTitle>Editar Relatório</SheetTitle>
            <SheetDescription>Atualize os dados do relatório salvo.</SheetDescription>
          </SheetHeader>
          {selectedReport && <form onSubmit={handleSubmit} className="mt-4 space-y-3 pb-2">
            {error && <div className="rounded-md bg-red-100 p-3 text-sm text-red-700">{error}</div>}
            <div className="space-y-2"><label className="text-sm font-medium">Nome</label><input name="name" required defaultValue={selectedReport.name} className="w-full rounded-md border p-2 text-sm" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Tipo</label><input name="type" required defaultValue={selectedReport.type} className="w-full rounded-md border p-2 text-sm" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Período</label><input name="period" required defaultValue={selectedReport.period} className="w-full rounded-md border p-2 text-sm" /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Formato</label><input name="format" required defaultValue={selectedReport.format} className="w-full rounded-md border p-2 text-sm" /></div>
            <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end"><button type="button" onClick={closeSheet} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Cancelar</button><button type="submit" disabled={saving} className="rounded-md bg-[#0284C7] px-4 py-2 text-sm font-medium text-white hover:bg-[#0369A1] disabled:opacity-50">{saving ? "Salvando..." : "Salvar Alterações"}</button></div>
          </form>}
        </SheetContent>
      </Sheet>
      <SanitationPagination page={currentPage} total={filteredReports.length} pageSize={pageSize} onPageChange={setPage} />
    </section>
  );
}
