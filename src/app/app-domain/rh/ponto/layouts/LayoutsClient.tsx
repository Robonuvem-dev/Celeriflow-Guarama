"use client";

import { useState } from "react";
import { savePontoLayout, deletePontoLayout } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { rhColumn } from "../../_components/operational-columns";
import { Plus, Edit2, Trash2, CheckCircle2, AlertCircle, FileCode } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";

type LayoutRecord = {
  id: string;
  name: string;
  code: string;
  details: {
    delimiter?: string;
    employeeIdCol?: string;
    dateCol?: string;
    dateFormat?: string;
    timeCol?: string;
    timeFormat?: string;
    eventCol?: string;
    clockCol?: string;
    skipHeaderRows?: string;
    notes?: string;
  };
};

export function LayoutsClient({ initialLayouts }: { initialLayouts: LayoutRecord[] }) {
  const [layouts, setLayouts] = useState<LayoutRecord[]>(initialLayouts);
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(layouts.length / OPERATIONAL_PAGE_SIZE)));
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingLayout, setEditingLayout] = useState<LayoutRecord | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [delimiter, setDelimiter] = useState(";");
  const [employeeIdCol, setEmployeeIdCol] = useState("1");
  const [dateCol, setDateCol] = useState("2");
  const [dateFormat, setDateFormat] = useState("DD/MM/AAAA");
  const [timeCol, setTimeCol] = useState("3");
  const [timeFormat, setTimeFormat] = useState("HH:MM");
  const [eventCol, setEventCol] = useState("4");
  const [clockCol, setClockCol] = useState("5");
  const [skipHeaderRows, setSkipHeaderRows] = useState("0");
  const [notes, setNotes] = useState("");

  // Simulator test line
  const [sampleLine, setSampleLine] = useState("1024;08/11/2026;08:05;ENTRADA;REP_SEDE_01");
  const [parsedSample, setParsedSample] = useState<{
    servidor: string;
    data: string;
    hora: string;
    evento: string;
    relogio: string;
  } | null>(null);

  const openNew = () => {
    setEditingLayout(null);
    setName("");
    setCode("");
    setDelimiter(";");
    setEmployeeIdCol("1");
    setDateCol("2");
    setDateFormat("DD/MM/AAAA");
    setTimeCol("3");
    setTimeFormat("HH:MM");
    setEventCol("4");
    setClockCol("5");
    setSkipHeaderRows("0");
    setNotes("");
    setIsOpen(true);
  };

  const openEdit = (layout: LayoutRecord) => {
    setEditingLayout(layout);
    setName(layout.name);
    setCode(layout.code);
    setDelimiter(layout.details.delimiter || ";");
    setEmployeeIdCol(layout.details.employeeIdCol || "1");
    setDateCol(layout.details.dateCol || "2");
    setDateFormat(layout.details.dateFormat || "DD/MM/AAAA");
    setTimeCol(layout.details.timeCol || "3");
    setTimeFormat(layout.details.timeFormat || "HH:MM");
    setEventCol(layout.details.eventCol || "");
    setClockCol(layout.details.clockCol || "");
    setSkipHeaderRows(layout.details.skipHeaderRows || "0");
    setNotes(layout.details.notes || "");
    setIsOpen(true);
  };

  const handleTestSample = () => {
    if (!sampleLine) return;
    const parts = sampleLine.split(delimiter === "TAB" ? "\t" : delimiter);
    const getVal = (colStr: string) => {
      const idx = parseInt(colStr, 10) - 1;
      return idx >= 0 && idx < parts.length ? parts[idx].trim() : "—";
    };

    setParsedSample({
      servidor: getVal(employeeIdCol),
      data: getVal(dateCol),
      hora: getVal(timeCol),
      evento: eventCol ? getVal(eventCol) : "Não mapeado",
      relogio: clockCol ? getVal(clockCol) : "Não mapeado",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const formData = new FormData();
    if (editingLayout) formData.set("id", editingLayout.id);
    formData.set("name", name);
    formData.set("code", code);
    formData.set("delimiter", delimiter);
    formData.set("employeeIdCol", employeeIdCol);
    formData.set("dateCol", dateCol);
    formData.set("dateFormat", dateFormat);
    formData.set("timeCol", timeCol);
    formData.set("timeFormat", timeFormat);
    formData.set("eventCol", eventCol);
    formData.set("clockCol", clockCol);
    formData.set("skipHeaderRows", skipHeaderRows);
    formData.set("notes", notes);

    const res = await savePontoLayout(formData);
    setIsSaving(false);

    if (res.success) {
      alert("Layout de importação salvo com sucesso!");
      setIsOpen(false);
      window.location.reload();
    } else {
      alert(res.error || "Erro ao salvar layout.");
    }
  };

  const handleDelete = async (id: string, layoutName: string) => {
    if (!confirm(`Deseja realmente excluir o layout "${layoutName}"?`)) return;
    const res = await deletePontoLayout(id);
    if (res.success) {
      setLayouts((prev) => prev.filter((item) => item.id !== id));
      alert("Layout excluído com sucesso.");
    } else {
      alert(res.error || "Erro ao excluir layout.");
    }
  };

  const columns = [
    rhColumn("code", "Código", 120, 90, "identifier"),
    rhColumn("name", "Nome do Layout", 250, 160),
    rhColumn("delimiter", "Delimitador", 100, 80),
    rhColumn("mapping", "Mapeamento das Colunas (Servidor / Data / Hora / REP)", 380, 200),
    rhColumn("actions", "Ações", 100, 90, "actions", "right"),
  ];

  const rows = layouts.map((layout) => ({
    id: layout.id,
    label: layout.name,
    values: {
      code: layout.code,
      name: layout.name,
      delimiter: layout.details.delimiter === "TAB" ? "Tabulação [TAB]" : `"${layout.details.delimiter || ";"}"`,
      mapping: `Col. ${layout.details.employeeIdCol || 1} (Servidor) · Col. ${layout.details.dateCol || 2} (${layout.details.dateFormat || "DD/MM/AAAA"}) · Col. ${layout.details.timeCol || 3} (${layout.details.timeFormat || "HH:MM"}) · Col. ${layout.details.clockCol || "—"} (REP)`,
    },
    actions: (
      <div className={styles.rowActions}>
        <button
          type="button"
          onClick={() => openEdit(layout)}
          className={styles.iconButton}
          title="Editar layout"
        >
          <Edit2 className="w-3.5 h-3.5 text-blue-600" />
        </button>
        <button
          type="button"
          onClick={() => handleDelete(layout.id, layout.name)}
          className={styles.iconButton}
          title="Excluir layout"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
        </button>
      </div>
    ),
  }));

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex justify-between items-center bg-white p-2.5 rounded border border-slate-200 dark:border-slate-800">
        <div className="text-xs text-slate-600 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Requisito 20.10: </span>
          Crie leiautes próprios para importar arquivos de catracas, planilhas CSV/TXT e relógios fora do padrão Portaria 1510 do MTE.
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded text-xs font-semibold hover:bg-violet-700 transition"
        >
          <Plus className="w-4 h-4" />
          Novo Layout Customizado
        </button>
      </div>

      <OperationalTable
        preferenceId="rh-ponto-layouts"
        columns={columns}
        caption="Layouts Customizados de Importação de Ponto (Requisito 20.10)"
        emptyMessage="Nenhum layout customizado cadastrado ainda. Clique em 'Novo Layout Customizado' acima para cadastrar."
        rows={rows.slice((currentPage - 1) * OPERATIONAL_PAGE_SIZE, currentPage * OPERATIONAL_PAGE_SIZE)}
      />
      <OperationalPagination page={currentPage} total={rows.length} onPageChange={setPage} />

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <FileCode className="w-5 h-5 text-violet-600" />
                {editingLayout ? "Editar Layout Customizado" : "Cadastrar Novo Layout de Importação (20.10)"}
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="name">Nome Descritivo do Layout *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Ponto Facial Recepção CSV"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="code">Código / Identificador</Label>
                  <Input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Ex: CATRACA_SEDE_CSV"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded border">
                <div className="space-y-1">
                  <Label htmlFor="delimiter">Delimitador / Separador *</Label>
                  <select
                    id="delimiter"
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                  >
                    <option value=";">; (Ponto e vírgula)</option>
                    <option value=",">, (Vírgula)</option>
                    <option value="TAB">Tabulação [TAB]</option>
                    <option value="|">| (Barra vertical - Pipe)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="skipHeaderRows">Ignorar Linhas Iniciais</Label>
                  <Input
                    id="skipHeaderRows"
                    type="number"
                    min="0"
                    value={skipHeaderRows}
                    onChange={(e) => setSkipHeaderRows(e.target.value)}
                    placeholder="0"
                  />
                  <span className="text-[10px] text-slate-500">Linhas de cabeçalho</span>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="employeeIdCol">Coluna do Servidor *</Label>
                  <Input
                    id="employeeIdCol"
                    value={employeeIdCol}
                    onChange={(e) => setEmployeeIdCol(e.target.value)}
                    placeholder="1"
                    required
                  />
                  <span className="text-[10px] text-slate-500">PIS, CPF ou Matrícula</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded border">
                <div className="space-y-1">
                  <Label htmlFor="dateCol">Coluna da Data *</Label>
                  <Input
                    id="dateCol"
                    value={dateCol}
                    onChange={(e) => setDateCol(e.target.value)}
                    placeholder="2"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dateFormat">Formato da Data *</Label>
                  <select
                    id="dateFormat"
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                  >
                    <option value="DD/MM/AAAA">DD/MM/AAAA (ex: 08/11/2026)</option>
                    <option value="AAAA-MM-DD">AAAA-MM-DD (ex: 2026-11-08)</option>
                    <option value="DDMMAAAA">DDMMAAAA (ex: 08112026)</option>
                    <option value="DD-MM-AAAA">DD-MM-AAAA (ex: 08-11-2026)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="timeCol">Coluna da Hora *</Label>
                  <Input
                    id="timeCol"
                    value={timeCol}
                    onChange={(e) => setTimeCol(e.target.value)}
                    placeholder="3"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="timeFormat">Formato da Hora *</Label>
                  <select
                    id="timeFormat"
                    value={timeFormat}
                    onChange={(e) => setTimeFormat(e.target.value)}
                    className="w-full h-9 rounded border border-slate-300 px-2 bg-white"
                  >
                    <option value="HH:MM">HH:MM (ex: 08:30)</option>
                    <option value="HH:MM:SS">HH:MM:SS (ex: 08:30:15)</option>
                    <option value="HHMM">HHMM (ex: 0830)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="eventCol">Coluna do Tipo / Evento (Opcional)</Label>
                  <Input
                    id="eventCol"
                    value={eventCol}
                    onChange={(e) => setEventCol(e.target.value)}
                    placeholder="Ex: 4 (E=Entrada / S=Saída)"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="clockCol">Coluna do Relógio / REP (Opcional)</Label>
                  <Input
                    id="clockCol"
                    value={clockCol}
                    onChange={(e) => setClockCol(e.target.value)}
                    placeholder="Ex: 5 (REP01 / Serial)"
                  />
                </div>
              </div>

              {/* Live Simulator Test Box */}
              <div className="bg-violet-50/70 border border-violet-200 rounded p-3 space-y-2">
                <div className="font-semibold text-violet-900 flex items-center justify-between">
                  <span>Simulador de Mapeamento em Tempo Real</span>
                  <button
                    type="button"
                    onClick={handleTestSample}
                    className="text-[11px] px-2 py-0.5 bg-violet-600 text-white rounded font-medium hover:bg-violet-700"
                  >
                    Testar Mapeamento
                  </button>
                </div>
                <Input
                  value={sampleLine}
                  onChange={(e) => setSampleLine(e.target.value)}
                  placeholder="Cole uma linha de exemplo do arquivo..."
                  className="font-mono text-xs bg-white"
                />
                {parsedSample && (
                  <div className="grid grid-cols-5 gap-2 text-[11px] bg-white p-2 rounded border border-violet-100">
                    <div>
                      <span className="text-slate-400 block">Servidor:</span>
                      <strong className="text-slate-800">{parsedSample.servidor}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Data:</span>
                      <strong className="text-slate-800">{parsedSample.data}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Hora:</span>
                      <strong className="text-slate-800">{parsedSample.hora}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Evento:</span>
                      <strong className="text-slate-800">{parsedSample.evento}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Relógio:</span>
                      <strong className="text-slate-800">{parsedSample.relogio}</strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes">Instruções / Observações Internas</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Arquivo gerado diariamente pela catraca do almoxarifado central..."
                  rows={2}
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
                <Button type="submit" disabled={isSaving} className="bg-violet-600 hover:bg-violet-700">
                  {isSaving ? "Gravando..." : "Salvar Layout"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
