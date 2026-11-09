"use client";

import { useState } from "react";
import { saveManualAttendance } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { rhColumn } from "../../_components/operational-columns";
import { UserCheck, Plus, FileBarChart2, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

type EmployeeFrequenciaItem = {
  id: string;
  name: string;
  registration: string;
  departmentName: string;
  roleName: string;
  punchType: "Ponto Manual" | "Ponto Eletrônico";
  legalFoundation: string;
  daysRecorded: number;
  absences: number;
  totalWorked: number;
};

export function FrequenciaManualClient({
  employeesList,
}: {
  employeesList: EmployeeFrequenciaItem[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(employeesList.length / OPERATIONAL_PAGE_SIZE)));
  const [isSaving, setIsSaving] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState(employeesList[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Presente");
  const [hoursWorked, setHoursWorked] = useState("8");
  const [extraHours, setExtraHours] = useState("0");
  const [justification, setJustification] = useState("");
  const [legalBase, setLegalBase] = useState("Folha de Frequência Física / Livro Ponto");

  const openNewForEmp = (empId: string) => {
    setSelectedEmpId(empId);
    setJustification("");
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "Falta" && (!justification.trim() || justification.trim().length < 5)) {
      alert("A digitação do histórico da justificativa é obrigatória para lançamento de faltas manuais (Requisito 20.14).");
      return;
    }

    setIsSaving(true);
    const formData = new FormData();
    formData.set("employeeId", selectedEmpId);
    formData.set("date", date);
    formData.set("status", status);
    formData.set("hoursWorked", hoursWorked);
    formData.set("extraHours", extraHours);
    formData.set("justification", justification);
    formData.set("legalBase", legalBase);

    const res = await saveManualAttendance(formData);
    setIsSaving(false);

    if (res.success) {
      alert("Frequência registrada com sucesso!");
      setIsOpen(false);
      window.location.reload();
    } else {
      alert(res.error || "Erro ao registrar frequência.");
    }
  };

  const columns = [
    rhColumn("name", "Servidor", 220, 140),
    rhColumn("registration", "Matrícula", 110, 85, "identifier"),
    rhColumn("department", "Lotação", 160, 110),
    rhColumn("role", "Cargo", 160, 110),
    rhColumn("punchType", "Tipo de Ponto (20.23)", 160, 110, "status"),
    rhColumn("legalBase", "Fundamento da Modalidade", 220, 140),
    rhColumn("records", "Dias Apurados", 100, 80, "text", "right"),
    rhColumn("absences", "Faltas", 80, 70, "text", "right"),
    rhColumn("worked", "Horas Realizadas", 110, 85, "text", "right"),
    rhColumn("actions", "Ações", 110, 90, "actions", "right"),
  ];

  const rows = employeesList.map((emp) => ({
    id: emp.id,
    label: emp.name,
    values: {
      name: emp.name,
      registration: emp.registration || "—",
      department: emp.departmentName || "Geral",
      role: emp.roleName || "Cargo Público",
      punchType: emp.punchType,
      legalBase: emp.legalFoundation,
      records: String(emp.daysRecorded),
      absences: String(emp.absences),
      worked: `${emp.totalWorked.toFixed(2)}h`,
    },
    cells: {
      punchType: (
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
            emp.punchType === "Ponto Manual"
              ? "bg-amber-100 text-amber-800 border border-amber-300"
              : "bg-blue-100 text-blue-800 border border-blue-300"
          }`}
        >
          {emp.punchType}
        </span>
      ),
    },
    actions: (
      <div className={styles.rowActions}>
        <button
          type="button"
          onClick={() => openNewForEmp(emp.id)}
          className="px-2 py-0.5 bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 rounded text-[11px] font-semibold"
          title="Lançar frequência manual para este servidor"
        >
          Lançar Ponto
        </button>
      </div>
    ),
  }));

  return (
    <div className="flex flex-col gap-3 w-full text-xs">
      {/* Banner Requisito 20.17 e 20.23 */}
      <div className="bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 p-3 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-violet-600" />
            Controle de Frequência e Lançamento de Ponto Manual (Requisito 20.17)
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Realize lançamentos do ponto de funcionários que não batem ponto digital (dispensados por lei, comissionados ou livro manual) e emita os relatórios de controle.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-violet-600 text-white rounded text-xs font-semibold hover:bg-violet-700 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Lançamento Manual (20.17)
          </button>
        </div>
      </div>

      {/* Relatórios Rápidos Exigidos pelo Requisito 20.17 */}
      <div className="bg-white border border-slate-200 p-2.5 rounded flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-slate-700">Relatórios obrigatórios vinculados (Requisito 20.17):</span>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/rh/ponto/relatorios?kind=CONTROLE_FREQUENCIA"
            className="px-2.5 py-1 bg-violet-50 text-violet-800 border border-violet-200 rounded font-medium hover:bg-violet-100 flex items-center gap-1"
          >
            <FileBarChart2 className="w-3 h-3 text-violet-600" />
            Relatório de Controle de Frequência
          </Link>
          <Link
            href="/rh/ponto/relatorios?kind=JUSTIFICATIVA_HORAS_EXTRAS"
            className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded font-medium hover:bg-amber-100 flex items-center gap-1"
          >
            <FileBarChart2 className="w-3 h-3 text-amber-600" />
            Justificativa de Horas Extras
          </Link>
          <Link
            href="/rh/ponto/relatorios?kind=INFORMACOES_COMPLEMENTARES"
            className="px-2.5 py-1 bg-blue-50 text-blue-800 border border-blue-200 rounded font-medium hover:bg-blue-100 flex items-center gap-1"
          >
            <FileBarChart2 className="w-3 h-3 text-blue-600" />
            Informações Complementares
          </Link>
          <Link
            href="/rh/ponto/relatorios?kind=TIPO_PONTO_SERVIDOR"
            className="px-2.5 py-1 bg-slate-100 text-slate-800 border border-slate-200 rounded font-medium hover:bg-slate-200 flex items-center gap-1"
          >
            <FileSpreadsheet className="w-3 h-3 text-slate-600" />
            Relatório Tipo de Ponto (20.23)
          </Link>
        </div>
      </div>

      <OperationalTable
        preferenceId="rh-ponto-frequencia"
        columns={columns}
        caption="Controle de Frequência de Servidores (Requisito 20.17 e 20.23)"
        emptyMessage="Nenhum servidor encontrado."
        rows={rows.slice((currentPage - 1) * OPERATIONAL_PAGE_SIZE, currentPage * OPERATIONAL_PAGE_SIZE)}
      />
      <OperationalPagination page={currentPage} total={rows.length} onPageChange={setPage} />

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-violet-600" />
                Lançamento de Frequência / Ponto Manual (20.17)
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="selectedEmpId">Servidor *</Label>
                <select
                  id="selectedEmpId"
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                  required
                >
                  {employeesList.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.registration || "—"}) - {emp.punchType}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="date">Data da Frequência *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="status">Situação / Presença *</Label>
                  <select
                    id="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                  >
                    <option value="Presente">Presente (Dia Trabalhado)</option>
                    <option value="Falta">Falta a Justificar</option>
                    <option value="Atraso">Atraso Parcial</option>
                    <option value="Licença">Licença / Afastamento</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="hoursWorked">Horas Trabalhadas no Dia</Label>
                  <Input
                    id="hoursWorked"
                    type="number"
                    step="0.25"
                    min="0"
                    max="24"
                    value={hoursWorked}
                    onChange={(e) => setHoursWorked(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="extraHours">Horas Extras (Opcional)</Label>
                  <Input
                    id="extraHours"
                    type="number"
                    step="0.25"
                    min="0"
                    max="12"
                    value={extraHours}
                    onChange={(e) => setExtraHours(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="legalBase">Fundamento / Instrumento de Frequência</Label>
                <Input
                  id="legalBase"
                  value={legalBase}
                  onChange={(e) => setLegalBase(e.target.value)}
                  placeholder="Ex: Folha de Frequência Física / Portaria Dispensa 014/2026"
                />
              </div>

              <div className="space-y-1 bg-amber-50 p-3 rounded border border-amber-200">
                <Label htmlFor="justification" className="font-semibold text-amber-950">
                  Histórico da Justificativa / Observações (Obrigatório se Falta - 20.14)
                </Label>
                <textarea
                  id="justification"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Digite a justificativa, motivo do apontamento manual ou registro de ocorrência..."
                  rows={3}
                  className="w-full rounded border border-amber-300 p-2 bg-white text-xs focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                >
                  {isSaving ? "Gravando Frequência..." : "Gravar Frequência Manual (20.17)"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
