"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, PowerOff } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { inactivateSavedReport, updateSavedReport } from "../actions";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import operational from "@/components/app-ui/operational/operational.module.css";
import { LocalListToolbar } from "./LocalListToolbar";
import { reportColumns } from "./list-columns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const pageSize = OPERATIONAL_PAGE_SIZE;
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

  const rows: OperationalRow[] = paged.map((report) => ({
    id: report.id, label: report.name,
    values: { name: report.name, type: report.type, period: report.period, format: report.format, active: report.active ? "Ativo" : "Inativo" },
    actions: <div className={operational.rowActions}>
      <button type="button" onClick={() => { setError(""); setSelectedReport(report); }} className={operational.iconButton} aria-label={`Editar relatório ${report.name}`} title="Editar"><Pencil /></button>
      <button type="button" onClick={() => void handleInactivate(report)} disabled={!report.active || inactivatingId === report.id} className={operational.iconButton} aria-label={`Inativar relatório ${report.name}`} title="Inativar"><PowerOff /></button>
    </div>,
  }));

  return (
    <OperationalListFrame label="Lista de relatórios"
      toolbar={<LocalListToolbar search={search} onSearch={(value) => { setSearch(value); setPage(1); }} placeholder="Buscar relatório..." filters={[
        { label: "Tipo", value: typeFilter, defaultValue: "Todos", options: types, onChange: (value) => { setTypeFilter(value); setPage(1); } },
        { label: "Situação", value: activeFilter, defaultValue: "Todos", options: ["Ativos", "Inativos", "Todos"], onChange: (value) => { setActiveFilter(value); setPage(1); } },
      ]} />}
      pagination={<OperationalPagination page={currentPage} total={filteredReports.length} onPageChange={setPage} />}>
      <OperationalTable columns={reportColumns} rows={rows} preferenceId="sanitation-reports" caption="Relatórios salvos" emptyMessage="Nenhum relatório encontrado." />
      <Dialog open={Boolean(error) && !selectedReport} onOpenChange={(open) => { if (!open) setError(""); }}>
        <DialogContent className={operational.dialog}>
          <DialogHeader><DialogTitle>Não foi possível atualizar o relatório</DialogTitle><DialogDescription>{error}</DialogDescription></DialogHeader>
          <button type="button" className={operational.dialogButton} onClick={() => setError("")}>Fechar</button>
        </DialogContent>
      </Dialog>

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
    </OperationalListFrame>
  );
}
