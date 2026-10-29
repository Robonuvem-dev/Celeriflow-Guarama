"use client";

import { useState, type FormEvent } from "react";
import { Pencil, PowerOff } from "lucide-react";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import operational from "@/components/app-ui/operational/operational.module.css";
import { LocalListToolbar } from "./LocalListToolbar";
import { qualityColumns } from "./list-columns";
import styles from "./sanitation.module.css";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { inactivateWaterQualityAnalysis, updateWaterQualityAnalysis } from "../actions";

type QualityAnalysis = {
  id: string;
  collectionPoint: string;
  collectedAt: string;
  parameter: string;
  result: string;
  limit: string;
  compliance: string;
  active: boolean;
};

export function QualityClient({ analyses }: { analyses: QualityAnalysis[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [complianceFilter, setComplianceFilter] = useState("Todos");
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [editingAnalysis, setEditingAnalysis] = useState<QualityAnalysis | null>(null);
  const [saving, setSaving] = useState(false);
  const [inactivatingId, setInactivatingId] = useState<string | null>(null);

  const filteredAnalyses = analyses.filter((analysis) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [
      analysis.collectionPoint,
      analysis.collectedAt,
      analysis.parameter,
      analysis.result,
      analysis.limit,
    ].some((value) => value.toLowerCase().includes(query));
    const matchesCompliance = complianceFilter === "Todos" || analysis.compliance === complianceFilter;
    const matchesActive = activeFilter === "Todos" || (activeFilter === "Ativas" ? analysis.active : !analysis.active);

    return matchesSearch && matchesCompliance && matchesActive;
  });
  const pageSize = OPERATIONAL_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filteredAnalyses.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedAnalyses = filteredAnalyses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAnalysis) return;

    setSaving(true);
    const formData = new FormData(event.currentTarget);

    try {
      const result = await updateWaterQualityAnalysis(editingAnalysis.id, {
        collectionPoint: formData.get("collectionPoint") as string,
        collectedAt: formData.get("collectedAt") as string,
        parameter: formData.get("parameter") as string,
        result: formData.get("result") as string,
        limit: formData.get("limit") as string,
        compliance: formData.get("compliance") as string,
      });

      if (result.error) {
        alert(result.error);
        return;
      }

      setEditingAnalysis(null);
    } catch {
      alert("Erro ao atualizar análise de qualidade.");
    } finally {
      setSaving(false);
    }
  }

  async function handleInactivate(analysis: QualityAnalysis) {
    if (!confirm(`Inativar a análise de ${analysis.parameter} do ponto ${analysis.collectionPoint}?`)) return;

    setInactivatingId(analysis.id);
    try {
      const result = await inactivateWaterQualityAnalysis(analysis.id);
      if (result.error) alert(result.error);
    } catch {
      alert("Erro ao inativar análise de qualidade.");
    } finally {
      setInactivatingId(null);
    }
  }

  const rows: OperationalRow[] = pagedAnalyses.map((analysis) => ({
    id: analysis.id, label: `${analysis.collectionPoint} · ${analysis.parameter}`,
    values: { point: analysis.collectionPoint, date: new Date(`${analysis.collectedAt}T00:00:00`).toLocaleDateString("pt-BR"), parameter: analysis.parameter, result: analysis.result, limit: analysis.limit, compliance: analysis.compliance, active: analysis.active ? "Ativa" : "Inativa" },
    actions: <div className={operational.rowActions}>
      <button type="button" onClick={() => setEditingAnalysis(analysis)} className={operational.iconButton} aria-label={`Editar análise de ${analysis.collectionPoint}`} title="Editar análise"><Pencil /></button>
      <button type="button" onClick={() => void handleInactivate(analysis)} disabled={!analysis.active || inactivatingId === analysis.id} className={operational.iconButton} aria-label={`Inativar análise de ${analysis.collectionPoint}`} title="Inativar análise"><PowerOff /></button>
    </div>,
  }));

  return (
    <OperationalListFrame label="Lista de análises de qualidade"
      toolbar={<LocalListToolbar search={search} onSearch={(value) => { setSearch(value); setPage(1); }} placeholder="Buscar ponto, parâmetro..." filters={[
        { label: "Conformidade", value: complianceFilter, defaultValue: "Todos", options: ["Todos", "Conforme", "Não Conforme"], onChange: (value) => { setComplianceFilter(value); setPage(1); } },
        { label: "Situação", value: activeFilter, defaultValue: "Todos", options: ["Todos", "Ativas", "Inativas"], onChange: (value) => { setActiveFilter(value); setPage(1); } },
      ]} />}
      pagination={<OperationalPagination page={currentPage} total={filteredAnalyses.length} onPageChange={setPage} />}>
      <OperationalTable columns={qualityColumns} rows={rows} preferenceId="sanitation-quality" caption="Análises de qualidade da água" emptyMessage="Nenhuma análise encontrada." />

      <Sheet open={editingAnalysis !== null} onOpenChange={(open) => !open && setEditingAnalysis(null)}>
        <SheetContent side="right" className={styles.sheet}>
          <SheetHeader>
            <SheetTitle>Editar Análise de Qualidade</SheetTitle>
            <SheetDescription>Atualize os dados da análise selecionada.</SheetDescription>
          </SheetHeader>
          {editingAnalysis && (
            <form onSubmit={handleUpdate} className="mt-4 space-y-3 pb-2">
              <div className="space-y-2">
                <label htmlFor="collectionPoint" className="text-sm font-medium">Ponto de coleta</label>
                <input id="collectionPoint" name="collectionPoint" required defaultValue={editingAnalysis.collectionPoint} className="w-full rounded-md border p-2 text-sm" />
              </div>
              <div className="space-y-2">
                <label htmlFor="collectedAt" className="text-sm font-medium">Data da coleta</label>
                <input id="collectedAt" name="collectedAt" type="date" required defaultValue={editingAnalysis.collectedAt} className="w-full rounded-md border p-2 text-sm" />
              </div>
              <div className="space-y-2">
                <label htmlFor="parameter" className="text-sm font-medium">Parâmetro</label>
                <input id="parameter" name="parameter" required defaultValue={editingAnalysis.parameter} className="w-full rounded-md border p-2 text-sm" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="result" className="text-sm font-medium">Resultado</label>
                  <input id="result" name="result" required defaultValue={editingAnalysis.result} className="w-full rounded-md border p-2 text-sm" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="limit" className="text-sm font-medium">Limite</label>
                  <input id="limit" name="limit" required defaultValue={editingAnalysis.limit} className="w-full rounded-md border p-2 text-sm" />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="compliance" className="text-sm font-medium">Conformidade</label>
                <select id="compliance" name="compliance" required defaultValue={editingAnalysis.compliance} className="w-full rounded-md border p-2 text-sm">
                  <option value="Conforme">Conforme</option>
                  <option value="Não Conforme">Não Conforme</option>
                </select>
              </div>
              <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end">
                <SheetTrigger render={<button type="button" className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200" />}>
                  Cancelar
                </SheetTrigger>
                <button type="submit" disabled={saving} className="rounded-md bg-[#0284C7] px-4 py-2 text-sm font-medium text-white hover:bg-[#0369A1] disabled:opacity-50">
                  {saving ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </OperationalListFrame>
  );
}
