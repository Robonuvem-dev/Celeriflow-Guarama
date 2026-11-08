"use client";

import { useState } from "react";
import { processClockImport } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Upload, FileText, CheckCircle, AlertCircle, RefreshCw, Eye } from "lucide-react";
import Link from "next/link";

type LayoutOption = {
  id: string;
  name: string;
  code: string;
  details: Record<string, string>;
};

export function ImportacaoRelogioClient({ customLayouts }: { customLayouts: LayoutOption[] }) {
  const [format, setFormat] = useState<"AFD" | "AFDT" | "ACJEF" | "CUSTOM">("AFD");
  const [customLayoutId, setCustomLayoutId] = useState<string>(customLayouts[0]?.id || "");
  const [clockLocation, setClockLocation] = useState("REP 01 - Sede Administrativa");
  const [fileContent, setFileContent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    importedCount?: number;
    totalPunches?: number;
    unmatchedCount?: number;
    error?: string;
  } | null>(null);

  const loadSampleAFD = () => {
    // Standard AFD Portaria 1510 (Registro tipo 3: NSR 9 dig + '3' + DDMMYYYY + HHMM + PIS 11 dig)
    const today = new Date();
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    const dateFormatted = `${d}${m}${y}`;

    const sample = [
      `0000000001112345678900019999999999999999999999PREFEITURA MUNICIPAL GUARAMA`,
      `0000000013${dateFormatted}080012345678901`,
      `0000000023${dateFormatted}120012345678901`,
      `0000000033${dateFormatted}130012345678901`,
      `0000000043${dateFormatted}170012345678901`,
      `0000000053${dateFormatted}081598765432100`,
      `0000000063${dateFormatted}173098765432100`,
      `99999999900000000600000000000000000000`,
    ].join("\n");

    setFormat("AFD");
    setFileContent(sample);
  };

  const loadSampleCustom = () => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, "0");
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const y = today.getFullYear();
    const sample = [
      `MATRICULA;DATA;HORA;TIPO;RELOGIO`,
      `1001;${d}/${m}/${y};08:00;ENTRADA;REP_SEDE`,
      `1001;${d}/${m}/${y};17:00;SAIDA;REP_SEDE`,
      `1002;${d}/${m}/${y};08:15;ENTRADA;REP_SAUDE`,
      `1002;${d}/${m}/${y};17:30;SAIDA;REP_SAUDE`,
    ].join("\n");

    setFormat("CUSTOM");
    setFileContent(sample);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
    };
    reader.readAsText(file);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileContent.trim()) {
      alert("Informe ou carregue o arquivo de ponto para importar.");
      return;
    }

    setIsProcessing(true);
    setResult(null);

    const formData = new FormData();
    formData.set("format", format);
    if (format === "CUSTOM") formData.set("customLayoutId", customLayoutId);
    formData.set("clockLocation", clockLocation);
    formData.set("fileContent", fileContent);

    const res = await processClockImport(formData);
    setIsProcessing(false);
    setResult(res);
  };

  return (
    <div className="flex flex-col gap-4 w-full text-xs">
      {/* Intro info box */}
      <div className="bg-slate-50 border border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 p-3 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
        <div>
          <h2 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
            Importação de Marcações de Relógio de Ponto (Requisito 20.15)
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Suporte integral aos formatos fiscais da Portaria MTE 1510/2009 e Portaria 671/2021 (AFD, AFDT, ACJEF) e leiautes customizados mapeados no Requisito 20.10.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/rh/ponto/layouts"
            className="px-2.5 py-1 bg-white border border-slate-300 rounded font-medium text-slate-700 hover:bg-slate-100"
          >
            Gerenciar Layouts Customizados
          </Link>
        </div>
      </div>

      <form onSubmit={handleImport} className="space-y-4 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="format" className="font-semibold text-slate-700 dark:text-slate-300">
              Padrão / Formato do Arquivo *
            </Label>
            <select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as any)}
              className="w-full h-9 rounded border border-slate-300 px-2 bg-white font-medium"
            >
              <option value="AFD">AFD - Arquivo Fonte de Dados (Portaria 1510 / 671)</option>
              <option value="AFDT">AFDT - Arquivo de Fonte de Dados Tratado</option>
              <option value="ACJEF">ACJEF - Controle de Jornada para Efeitos Fiscais</option>
              <option value="CUSTOM">Layout Customizado (Mapeamento Próprio - 20.10)</option>
            </select>
          </div>

          {format === "CUSTOM" && (
            <div className="space-y-1">
              <Label htmlFor="customLayoutId" className="font-semibold text-slate-700 dark:text-slate-300">
                Selecione o Layout Customizado *
              </Label>
              <select
                id="customLayoutId"
                value={customLayoutId}
                onChange={(e) => setCustomLayoutId(e.target.value)}
                className="w-full h-9 rounded border border-slate-300 px-2 bg-white font-medium"
                required
              >
                {customLayouts.length === 0 ? (
                  <option value="">Nenhum layout customizado encontrado</option>
                ) : (
                  customLayouts.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.details.delimiter || ";"})
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="clockLocation" className="font-semibold text-slate-700 dark:text-slate-300">
              Relógio REP / Local de Origem
            </Label>
            <Input
              id="clockLocation"
              value={clockLocation}
              onChange={(e) => setClockLocation(e.target.value)}
              placeholder="Ex: REP 01 - Sede Administrativa"
            />
          </div>
        </div>

        {/* Upload & Quick Samples */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-white rounded font-medium hover:bg-slate-900 transition">
              <Upload className="w-3.5 h-3.5" />
              <span>Selecionar Arquivo (.txt / .csv / .dat)</span>
              <input
                type="file"
                accept=".txt, .csv, .dat"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <span className="text-slate-400">ou cole o conteúdo textual abaixo:</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">Exemplos rápidos:</span>
            <button
              type="button"
              onClick={loadSampleAFD}
              className="px-2 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded font-medium hover:bg-violet-100"
            >
              Exemplo AFD 1510
            </button>
            <button
              type="button"
              onClick={loadSampleCustom}
              className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded font-medium hover:bg-emerald-100"
            >
              Exemplo CSV Customizado
            </button>
          </div>
        </div>

        {/* Textarea Content Preview */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-slate-500">
            <Label htmlFor="fileContent">Conteúdo Bruto do Arquivo:</Label>
            <span>{fileContent.split(/\r?\n/).filter(Boolean).length} linhas carregadas</span>
          </div>
          <Textarea
            id="fileContent"
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            rows={8}
            placeholder="Cole ou carregue o arquivo de ponto..."
            className="font-mono text-[11px] bg-slate-50"
          />
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button
            type="submit"
            disabled={isProcessing || !fileContent.trim()}
            className="bg-violet-600 hover:bg-violet-700 text-white font-semibold"
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Processando e Validando Marcações...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                Processar e Gravar Marcações no Ponto
              </span>
            )}
          </Button>
        </div>
      </form>

      {/* Result Card */}
      {result && (
        <div
          className={`p-4 rounded-lg border ${
            result.success
              ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
              : "bg-rose-50/80 border-rose-200 text-rose-950"
          }`}
        >
          <div className="flex items-start gap-3">
            {result.success ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <h3 className="font-bold text-sm">
                {result.success
                  ? "Importação de Ponto Concluída com Sucesso!"
                  : "Falha na Importação de Ponto"}
              </h3>
              {result.success ? (
                <div>
                  <p>
                    Foram processadas <strong>{result.totalPunches}</strong> batidas de ponto, consolidando{" "}
                    <strong>{result.importedCount}</strong> registros diários de frequência no sistema.
                  </p>
                  {result.unmatchedCount ? (
                    <p className="text-amber-800 text-[11px]">
                      Aviso: {result.unmatchedCount} batidas não foram associadas a matrículas cadastradas.
                    </p>
                  ) : null}
                  <div className="pt-2 flex items-center gap-2">
                    <Link
                      href="/rh/ponto"
                      className="px-3 py-1 bg-emerald-700 text-white rounded font-semibold text-xs hover:bg-emerald-800"
                    >
                      Ver Marcações Atualizadas
                    </Link>
                    <Link
                      href="/rh/ponto/relatorios?kind=PONTO_LOCAL_RELOGIO"
                      className="px-3 py-1 bg-white border border-emerald-300 text-emerald-800 rounded font-semibold text-xs hover:bg-emerald-100"
                    >
                      Ver Relatório por Relógio (20.20)
                    </Link>
                  </div>
                </div>
              ) : (
                <p>{result.error}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
