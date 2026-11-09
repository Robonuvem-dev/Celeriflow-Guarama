"use client";

import { useState } from "react";
import { savePonto } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { rhColumn } from "../../_components/operational-columns";
import { FileText, Plus, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

type OccurrenceItem = {
  id: string;
  employeeName: string;
  registration: string;
  departmentName: string;
  dateFormatted: string;
  rawDate: string;
  occurrenceType: string;
  justification: string;
  documentRef: string;
  status: string;
};

type EmployeeOption = {
  id: string;
  name: string;
  registration?: string | null;
};

export function OcorrenciasClient({
  occurrences,
  employees,
}: {
  occurrences: OccurrenceItem[];
  employees: EmployeeOption[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(occurrences.length / OPERATIONAL_PAGE_SIZE)));
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [occurrenceType, setOccurrenceType] = useState("Falta Justificada");
  const [justification, setJustification] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [status, setStatus] = useState("Presente");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!justification.trim() || justification.trim().length < 5) {
      alert("A digitação do histórico da justificativa é obrigatória (mínimo 5 caracteres - Requisito 20.14).");
      return;
    }

    setIsSaving(true);
    const formData = new FormData();
    formData.set("employeeId", employeeId);
    formData.set("date", date);
    formData.set("entryTime", "08:00");
    formData.set("exitTime", "17:00");
    formData.set("status", status);
    formData.set("punchType", "MANUAL");
    formData.set("occurrenceType", occurrenceType);
    formData.set("justification", justification);
    formData.set("documentRef", documentRef);
    formData.set("clockLocation", "Apontamento Manual / Ocorrência RH");

    const res = await savePonto(formData);
    setIsSaving(false);

    if (res.success) {
      alert("Ocorrência de ponto cadastrada com sucesso!");
      setIsOpen(false);
      window.location.reload();
    } else {
      alert(res.error || "Erro ao registrar ocorrência.");
    }
  };

  const columns = [
    rhColumn("employee", "Servidor", 200, 130),
    rhColumn("registration", "Matrícula", 100, 80, "identifier"),
    rhColumn("department", "Lotação", 160, 110),
    rhColumn("date", "Data Ocorrência", 120, 95),
    rhColumn("type", "Tipo de Ocorrência", 180, 120),
    rhColumn("justification", "Histórico Obrigatório da Justificativa", 360, 180),
    rhColumn("document", "Comprovante / Atestado", 180, 110),
    rhColumn("status", "Status", 95, 80, "status"),
  ];

  const rows = occurrences.map((occ) => ({
    id: occ.id,
    label: occ.employeeName,
    values: {
      employee: occ.employeeName,
      registration: occ.registration || "—",
      department: occ.departmentName || "Geral",
      date: occ.dateFormatted,
      type: occ.occurrenceType,
      justification: occ.justification,
      document: occ.documentRef || "—",
      status: occ.status,
    },
  }));

  return (
    <div className="flex flex-col gap-3 w-full text-xs">
      <div className="flex justify-between items-center bg-white p-2.5 rounded border border-slate-200 dark:border-slate-800">
        <div className="text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Requisito 20.14 & 20.19: </span>
          Cadastre ocorrências de ponto (faltas, atrasos, atestados, serviços externos) com digitação obrigatória do histórico da justificativa.
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded text-xs font-semibold hover:bg-violet-700 transition"
        >
          <Plus className="w-4 h-4" />
          Registrar Ocorrência com Justificativa (20.14)
        </button>
      </div>

      <OperationalTable
        preferenceId="rh-ponto-ocorrencias"
        columns={columns}
        caption="Histórico de Ocorrências e Justificativas de Ponto (Requisitos 20.14 e 20.19)"
        emptyMessage="Nenhuma ocorrência de ponto registrada ainda. Clique no botão acima para registrar."
        rows={rows.slice((currentPage - 1) * OPERATIONAL_PAGE_SIZE, currentPage * OPERATIONAL_PAGE_SIZE)}
      />
      <OperationalPagination page={currentPage} total={rows.length} onPageChange={setPage} />

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-xl max-h-[90vh] overflow-y-auto p-5">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-5 h-5 text-violet-600" />
                Registrar Ocorrência de Ponto (Requisito 20.14)
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
                <Label htmlFor="employeeId">Servidor *</Label>
                <select
                  id="employeeId"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                  required
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.registration || "Sem matrícula"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="date">Data da Ocorrência *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="occurrenceType">Tipo de Ocorrência *</Label>
                  <select
                    id="occurrenceType"
                    value={occurrenceType}
                    onChange={(e) => setOccurrenceType(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                    required
                  >
                    <option value="Falta Justificada">Falta Justificada</option>
                    <option value="Falta Injustificada">Falta Injustificada</option>
                    <option value="Atraso Justificado">Atraso Justificado</option>
                    <option value="Saída Antecipada Justificada">Saída Antecipada Justificada</option>
                    <option value="Esquecimento de Crachá/Biometria">Esquecimento de Crachá / Biometria</option>
                    <option value="Declaração Médica / Consulta">Declaração Médica / Consulta</option>
                    <option value="Serviço Externo / Diligência">Serviço Externo / Diligência</option>
                    <option value="Convocação Judicial / Eleitoral">Convocação Judicial / Eleitoral</option>
                    <option value="Ajuste de Batida Manual">Ajuste de Batida Manual</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="status">Impacto / Status no Ponto *</Label>
                  <select
                    id="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                  >
                    <option value="Presente">Presente (Abonado / Horas Válidas)</option>
                    <option value="Falta">Falta (Desconto em folha)</option>
                    <option value="Atraso">Atraso Parcial</option>
                    <option value="Licença">Licença Legal</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="documentRef">Comprovante / Atestado / Protocolo</Label>
                  <Input
                    id="documentRef"
                    value={documentRef}
                    onChange={(e) => setDocumentRef(e.target.value)}
                    placeholder="Ex: Atestado Médico CRM 98124 / Memorando 20/2026"
                  />
                </div>
              </div>

              <div className="space-y-1 bg-amber-50 p-3 rounded border border-amber-200">
                <Label htmlFor="justification" className="font-bold text-amber-950">
                  Histórico da Justificativa * (Digitação Obrigatória - Requisito 20.14)
                </Label>
                <textarea
                  id="justification"
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Descreva detalhadamente os motivos, horários e fundamento da justificativa..."
                  rows={4}
                  className="w-full rounded border border-amber-300 p-2 bg-white text-xs focus:ring-1 focus:ring-amber-500"
                  required
                />
                <span className="text-[10px] text-amber-700 block">
                  * A digitação do histórico da justificativa é obrigatória por norma de auditoria e controle interno.
                </span>
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
                  {isSaving ? "Gravando Ocorrência..." : "Gravar Ocorrência (20.14)"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
