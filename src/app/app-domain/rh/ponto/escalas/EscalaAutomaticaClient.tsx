"use client";

import { useState } from "react";
import { generateAutomaticScale } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { rhColumn } from "../../_components/operational-columns";
import { CalendarCheck, Plus, CheckCircle, RefreshCw, Users, Clock } from "lucide-react";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

type ScaleItem = {
  id: string;
  name: string;
  employeeName: string;
  registration: string;
  departmentName: string;
  rangeName: string;
  weekdays: string;
  from: string;
  until: string;
};

type OptionItem = {
  id: string;
  name: string;
};

export function EscalaAutomaticaClient({
  scales,
  employees,
  departments,
  ranges,
}: {
  scales: ScaleItem[];
  employees: OptionItem[];
  departments: OptionItem[];
  ranges: OptionItem[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scope, setScope] = useState<"TODOS" | "DEPARTAMENTO" | "SERVIDOR">("TODOS");
  const [targetId, setTargetId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [scaleType, setScaleType] = useState("ADMINISTRATIVO_5X2");
  const [rangeId, setRangeId] = useState(ranges[0]?.id || "");
  const [skipHolidays, setSkipHolidays] = useState(true);
  const [skipLeaves, setSkipLeaves] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    employeesCount?: number;
    daysGenerated?: number;
    error?: string;
  } | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setResult(null);

    const formData = new FormData();
    formData.set("scope", scope);
    formData.set("targetId", targetId);
    formData.set("month", month);
    formData.set("scaleType", scaleType);
    if (scaleType === "FAIXA_EXISTENTE") formData.set("rangeId", rangeId);
    formData.set("skipHolidays", String(skipHolidays));
    formData.set("skipLeaves", String(skipLeaves));

    const res = await generateAutomaticScale(formData);
    setIsGenerating(false);
    setResult(res);

    if (res.success) {
      alert(`Escala automática gerada com sucesso! ${res.daysGenerated} marcações previstas criadas para ${res.employeesCount} servidores.`);
      window.location.reload();
    } else {
      alert(res.error || "Erro ao gerar escala automática.");
    }
  };

  const columns = [
    rhColumn("employee", "Servidor", 220, 140),
    rhColumn("registration", "Matrícula", 110, 85, "identifier"),
    rhColumn("department", "Lotação", 180, 120),
    rhColumn("scale", "Escala de Trabalho", 240, 150),
    rhColumn("period", "Vigência", 160, 110),
    rhColumn("weekdays", "Dias da Semana", 140, 100),
  ];

  const rows = scales.map((item) => ({
    id: item.id,
    label: item.name,
    values: {
      employee: item.employeeName,
      registration: item.registration || "—",
      department: item.departmentName || "Geral",
      scale: item.name,
      period: `${item.from || "—"} até ${item.until || "—"}`,
      weekdays: item.weekdays || "1,2,3,4,5",
    },
  }));

  return (
    <div className="flex flex-col gap-3 w-full text-xs">
      <div className="flex justify-between items-center bg-white p-2.5 rounded border border-slate-200 dark:border-slate-800">
        <div className="text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Requisito 20.9: </span>
          Gere automaticamente a escala e horários de trabalho dos servidores por departamento, equipe ou individualmente, calculando os dias úteis, turnos ou plantões 12x36.
        </div>
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setResult(null);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded text-xs font-semibold hover:bg-violet-700 transition"
        >
          <CalendarCheck className="w-4 h-4" />
          Gerar Escala Automática (20.9)
        </button>
      </div>

      <OperationalTable
        preferenceId="rh-ponto-escalas"
        columns={columns}
        caption="Escalas e Horários de Trabalho Cadastrados (Requisito 20.9)"
        emptyMessage="Nenhuma escala cadastrada no momento. Clique no botão acima para gerar a escala automática."
        rows={rows}
      />

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-xl max-h-[90vh] overflow-y-auto p-5">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-violet-600" />
                Geração de Escala Automática de Trabalho (20.9)
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="scope">Abrangência da Escala *</Label>
                <select
                  id="scope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as any)}
                  className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                >
                  <option value="TODOS">Todos os Servidores Ativos do Município</option>
                  <option value="DEPARTAMENTO">Por Secretaria / Departamento</option>
                  <option value="SERVIDOR">Servidor Específico Individual</option>
                </select>
              </div>

              {scope === "DEPARTAMENTO" && (
                <div className="space-y-1">
                  <Label htmlFor="targetId">Selecione a Secretaria / Lotação *</Label>
                  <select
                    id="targetId"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                    required
                  >
                    <option value="">Selecione a lotação...</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {scope === "SERVIDOR" && (
                <div className="space-y-1">
                  <Label htmlFor="targetId">Selecione o Servidor *</Label>
                  <select
                    id="targetId"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                    required
                  >
                    <option value="">Selecione o servidor...</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="month">Mês de Competência da Escala *</Label>
                  <Input
                    id="month"
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="scaleType">Modelo de Horário / Escala *</Label>
                  <select
                    id="scaleType"
                    value={scaleType}
                    onChange={(e) => setScaleType(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                  >
                    <option value="ADMINISTRATIVO_5X2">Administrativo 5x2 (08h às 17h, Seg a Sex)</option>
                    <option value="PLANTAO_12X36_IMPAR">Plantão 12x36 (Dias Ímpares - 07h às 19h)</option>
                    <option value="PLANTAO_12X36_PAR">Plantão 12x36 (Dias Pares - 07h às 19h)</option>
                    <option value="TURNO_6X1">Turno 6x1 (07h às 14h, Folga Rotativa)</option>
                    <option value="FAIXA_EXISTENTE">Usar Faixa de Horário Cadastrada</option>
                  </select>
                </div>
              </div>

              {scaleType === "FAIXA_EXISTENTE" && (
                <div className="space-y-1">
                  <Label htmlFor="rangeId">Faixa de Horário *</Label>
                  <select
                    id="rangeId"
                    value={rangeId}
                    onChange={(e) => setRangeId(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                    required
                  >
                    {ranges.length === 0 ? (
                      <option value="">Nenhuma faixa de horário cadastrada em /rh/cadastros</option>
                    ) : (
                      ranges.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div className="space-y-2 bg-slate-50 p-3 rounded border">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="skipHolidays"
                    checked={skipHolidays}
                    onChange={(e) => setSkipHolidays(e.target.checked)}
                    className="rounded text-violet-600"
                  />
                  <Label htmlFor="skipHolidays" className="cursor-pointer font-medium">
                    Respeitar feriados municipais e nacionais (não gerar previsão)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="skipLeaves"
                    checked={skipLeaves}
                    onChange={(e) => setSkipLeaves(e.target.checked)}
                    className="rounded text-violet-600"
                  />
                  <Label htmlFor="skipLeaves" className="cursor-pointer font-medium">
                    Respeitar férias e licenças concedidas dos servidores
                  </Label>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsOpen(false)}
                  disabled={isGenerating}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isGenerating}
                  className="bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Calculando e Gerando Escala...
                    </span>
                  ) : (
                    "Gerar e Aplicar Escala Automática"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
