"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, CheckCircle2, ArrowRight, ShieldCheck, FileCheck, Layers } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumn } from "@/components/app-ui/operational/operational-columns";

type PreviewItem = {
  id: string;
  category: string;
  code: string;
  sourceDesc: string;
  targetDesc: string;
  action: string;
};

const columns = [
  operationalColumn("category", "Categoria", 120, 160, { type: "identifier" }),
  operationalColumn("code", "Código", 90, 110),
  operationalColumn("sourceDesc", "Descrição no Exercício Atual (2026)", 220, 340),
  operationalColumn("targetDesc", "Descrição Gerada para o Próximo Exercício (2027)", 240, 360),
  operationalColumn("action", "Ação de Migração", 110, 130, { type: "status" }),
];

export default function RolloverClient() {
  const [sourceYear, setSourceYear] = useState("2026");
  const [targetYear, setTargetYear] = useState("2027");

  const [includePrograms, setIncludePrograms] = useState(true);
  const [includeActions, setIncludeActions] = useState(true);
  const [includeProducts, setIncludeProducts] = useState(true);
  const [includeIndicators, setIncludeIndicators] = useState(true);

  const [isRunning, setIsRunning] = useState(false);
  const [resultNotice, setResultNotice] = useState<string | null>(null);

  const previewItems: PreviewItem[] = [
    {
      id: "prev-1",
      category: "Programa Temático",
      code: "0010",
      sourceDesc: "Saúde Integral e Humanizada (2026)",
      targetDesc: "Saúde Integral e Humanizada (2027)",
      action: "Manter & Replicar",
    },
    {
      id: "prev-2",
      category: "Ação Orçamentária",
      code: "2.012",
      sourceDesc: "Manutenção do Transporte Escolar - LOA 2026",
      targetDesc: "Manutenção do Transporte Escolar - LOA 2027",
      action: "Gerar Descrição",
    },
    {
      id: "prev-3",
      category: "Produto Resultante",
      code: "PROD-2012",
      sourceDesc: "Transporte Diário de Estudantes da Rede Pública (Exercício 2026)",
      targetDesc: "Transporte Diário de Estudantes da Rede Pública (Exercício 2027)",
      action: "Gerar Descrição",
    },
    {
      id: "prev-4",
      category: "Ação Orçamentária",
      code: "1.005",
      sourceDesc: "Construção e Ampliação de UBS (Etapa 2026)",
      targetDesc: "Construção e Ampliação de UBS (Etapa 2027)",
      action: "Gerar Descrição",
    },
    {
      id: "prev-5",
      category: "Indicador / Apuração",
      code: "IND-010-01",
      sourceDesc: "Taxa de Cobertura da Atenção Básica de Saúde 2026",
      targetDesc: "Taxa de Cobertura da Atenção Básica de Saúde 2027",
      action: "Ajustar Vigência",
    },
    {
      id: "prev-6",
      category: "Programa Temático",
      code: "0012",
      sourceDesc: "Educação com Qualidade e Inclusão (2026)",
      targetDesc: "Educação com Qualidade e Inclusão (2027)",
      action: "Manter & Replicar",
    },
  ];

  function handleExecuteRollover() {
    setIsRunning(true);
    setResultNotice(null);

    setTimeout(() => {
      setIsRunning(false);
      setResultNotice(
        `Sucesso: 48 descrições de programas, ações, produtos e indicadores foram geradas e vinculadas ao exercício ${targetYear} com integridade referencial mantida.`
      );
    }, 1500);
  }

  return (
    <PageFrame className="flex h-full min-h-0 flex-col space-y-3">
      <PageHeader
        title="Geração Automática das Descrições do Planejamento para o Próximo Exercício"
        icon={<Sparkles className="size-4 text-indigo-700" />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Painel de Configuração do Rollover */}
        <Card className="md:col-span-1 shadow-none border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <Layers className="size-4 text-indigo-700" />
              Parâmetros de Geração
            </CardTitle>
            <CardDescription className="text-xs">
              Configure o exercício de origem e de destino para a geração automatizada das descrições.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold">Exercício Origem</Label>
                <Select value={sourceYear} onValueChange={(val) => setSourceYear(val || "2026")}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2026">2026 (Atual)</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-semibold">Exercício Destino</Label>
                <Select value={targetYear} onValueChange={(val) => setTargetYear(val || "2027")}>
                  <SelectTrigger className="h-8 text-xs mt-1 font-bold text-indigo-900 bg-indigo-50/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2027">2027 (Próximo)</SelectItem>
                    <SelectItem value="2028">2028</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <Label className="text-xs font-semibold text-slate-700">Estruturas a replicar / ajustar:</Label>
              <div className="space-y-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePrograms}
                    onChange={(e) => setIncludePrograms(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Programas Temáticos e de Gestão</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeActions}
                    onChange={(e) => setIncludeActions(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Ações Governamentais (Projetos / Atividades)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeProducts}
                    onChange={(e) => setIncludeProducts(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Produtos Resultantes e Unidades de Medida</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeIndicators}
                    onChange={(e) => setIncludeIndicators(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Indicadores de Apuração e Metas Físicas</span>
                </label>
              </div>
            </div>
          </CardContent>
          <CardFooter className="pt-2">
            <Button
              onClick={handleExecuteRollover}
              disabled={isRunning}
              className="w-full bg-indigo-700 hover:bg-indigo-800 text-white text-xs h-9 flex items-center justify-center gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${isRunning ? "animate-spin" : ""}`} />
              {isRunning ? "Gerando cadastros..." : `Gerar para o Exercício ${targetYear}`}
            </Button>
          </CardFooter>
        </Card>

        {/* Prévia das Descrições Geradas */}
        <div className="md:col-span-2 space-y-3">
          {resultNotice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
              <span>{resultNotice}</span>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileCheck className="size-4 text-indigo-700" />
              Pré-Visualização dos Registros Gerados Automaticamente
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              As descrições são padronizadas com a atualização de vigência anual mantendo os vínculos aos órgãos e
              unidades gestoras já homologadas.
            </p>

            <OperationalTable
              columns={columns}
              preferenceId="planejamento-rollover-preview"
              caption="Prévia de descrições para o próximo exercício"
              emptyMessage="Nenhum item selecionado."
              rows={previewItems.map((item) => ({
                id: item.id,
                label: item.code,
                values: {
                  category: item.category,
                  code: item.code,
                  sourceDesc: item.sourceDesc,
                  targetDesc: item.targetDesc,
                  action: item.action,
                },
              }))}
            />
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
