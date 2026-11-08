"use client";

import { Label } from "@/components/ui/label";
import { useState } from "react";
import { HeartPulse, Printer, Download, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumn } from "@/components/app-ui/operational/operational-columns";

type HealthRow = {
  id: string;
  code: string;
  description: string;
  expectedValue: number;
  realizedValue: number;
  category: "RECEITA_BASE" | "DESPESA_PROPRIA" | "DEDUCAO" | "APURACAO";
};

const currency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

const columns = [
  operationalColumn("code", "Código", 90, 110, { type: "identifier" }),
  operationalColumn("description", "Especificação da Receita / Despesa de Saúde (LC 141/2012)", 260, 420),
  operationalColumn("expected", "Previsão / Fixação (R$)", 120, 150, { type: "text", align: "right" }),
  operationalColumn("realized", "Valor Realizado / Liquidado (R$)", 130, 160, { type: "text", align: "right" }),
];

export default function Saude15Client() {
  const [exercise, setExercise] = useState("2026");
  const [period, setPeriod] = useState("3_QUADRIMESTRE");

  const revenueRows: HealthRow[] = [
    {
      id: "rec-1",
      code: "1.1.1.2.01",
      description: "IPTU - Imposto Predial e Territorial Urbano",
      expectedValue: 12500000,
      realizedValue: 13100000,
      category: "RECEITA_BASE",
    },
    {
      id: "rec-2",
      code: "1.1.1.2.02",
      description: "ITBI - Transmissão Inter Vivos de Bens Imóveis",
      expectedValue: 4200000,
      realizedValue: 4450000,
      category: "RECEITA_BASE",
    },
    {
      id: "rec-3",
      code: "1.1.1.3.01",
      description: "ISSQN - Imposto Sobre Serviços de Qualquer Natureza",
      expectedValue: 18000000,
      realizedValue: 18600000,
      category: "RECEITA_BASE",
    },
    {
      id: "rec-4",
      code: "1.1.1.1.01",
      description: "IRRF - Retido nas Fontes Sobre Rendimentos do Trabalho",
      expectedValue: 6500000,
      realizedValue: 6720000,
      category: "RECEITA_BASE",
    },
    {
      id: "rec-5",
      code: "1.7.1.1.51",
      description: "Cota-Parte do FPM - Fundo de Participação dos Municípios",
      expectedValue: 42000000,
      realizedValue: 43200000,
      category: "RECEITA_BASE",
    },
    {
      id: "rec-6",
      code: "1.7.2.1.50",
      description: "Cota-Parte do ICMS Estadual",
      expectedValue: 28000000,
      realizedValue: 28900000,
      category: "RECEITA_BASE",
    },
    {
      id: "rec-7",
      code: "1.7.2.1.51",
      description: "Cota-Parte do IPVA",
      expectedValue: 7500000,
      realizedValue: 7850000,
      category: "RECEITA_BASE",
    },
  ];

  const expenseRows: HealthRow[] = [
    {
      id: "desp-1",
      code: "10.301",
      description: "Atenção Primária / Saúde da Família (Recursos Próprios)",
      expectedValue: 12000000,
      realizedValue: 12650000,
      category: "DESPESA_PROPRIA",
    },
    {
      id: "desp-2",
      code: "10.302",
      description: "Assistência Hospitalar e Ambulatorial (Próprios)",
      expectedValue: 6800000,
      realizedValue: 7120000,
      category: "DESPESA_PROPRIA",
    },
    {
      id: "desp-3",
      code: "10.304",
      description: "Vigilância Sanitária e Epidemiológica (Próprios)",
      expectedValue: 1400000,
      realizedValue: 1480000,
      category: "DESPESA_PROPRIA",
    },
  ];

  const totalBaseRevenues = revenueRows.reduce((acc, r) => acc + r.realizedValue, 0);
  const minimumRequired15 = totalBaseRevenues * 0.15;
  const totalAppliedHealth = expenseRows.reduce((acc, r) => acc + r.realizedValue, 0);
  const actualPercentage = ((totalAppliedHealth / totalBaseRevenues) * 100).toFixed(2);
  const surplusValue = totalAppliedHealth - minimumRequired15;
  const isCompliant = totalAppliedHealth >= minimumRequired15;

  return (
    <PageFrame className="flex h-full min-h-0 flex-col space-y-3">
      <PageHeader
        title="Demonstrativo de Gastos com Saúde — Mínimo Constitucional de 15% (LC 141/2012)"
        icon={<HeartPulse className="size-4 text-rose-600" />}
      />

      {/* Seletor de Período e Botões de Exportação */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Label className="text-xs font-bold text-slate-700 uppercase">Exercício:</Label>
          <Select value={exercise} onValueChange={(val) => setExercise(val || "2026")}>
            <SelectTrigger className="h-8 text-xs w-[120px] bg-slate-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026">2026 (Atual)</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
            </SelectContent>
          </Select>

          <Label className="text-xs font-bold text-slate-700 uppercase ml-2">Período de Apuração:</Label>
          <Select value={period} onValueChange={(val) => setPeriod(val || "6B")}>
            <SelectTrigger className="h-8 text-xs w-[180px] bg-slate-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1_QUADRIMESTRE">1º Quadrimestre (Jan-Abr)</SelectItem>
              <SelectItem value="2_QUADRIMESTRE">2º Quadrimestre (Jan-Ago)</SelectItem>
              <SelectItem value="3_QUADRIMESTRE">3º Quadrimestre (Consolidado)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-8 text-xs flex items-center gap-1.5"
          >
            <Printer className="size-3.5 text-slate-600" />
            Imprimir Relatório Oficial
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => alert("Exportando Demonstrativo da Saúde em PDF oficial (SIOPS / STN)...")}
            className="h-8 text-xs flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
          >
            <Download className="size-3.5 text-emerald-700" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Indicador de Cumprimento Constitucional */}
      <div
        className={`p-3 rounded-lg border text-sm flex items-center justify-between ${
          isCompliant
            ? "bg-emerald-50 border-emerald-200 text-emerald-900"
            : "bg-rose-50 border-rose-200 text-rose-900"
        }`}
      >
        <div className="flex items-center gap-2.5">
          {isCompliant ? (
            <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="size-5 text-rose-600 shrink-0" />
          )}
          <div>
            <p className="font-bold">
              {isCompliant
                ? `Limite Constitucional Atingido: ${actualPercentage}% aplicado em ASPS`
                : `Abaixo do Limite Constitucional: ${actualPercentage}% (Mínimo obrigatório: 15,00%)`}
            </p>
            <p className="text-xs mt-0.5 opacity-90">
              {isCompliant
                ? `Superávit de aplicação própria em saúde: ${currency(surplusValue)} acima do piso legal.`
                : `Déficit de aplicação: necessário aplicar mais ${currency(Math.abs(surplusValue))} para atingir os 15%.`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black">{actualPercentage}%</span>
          <span className="text-xs block text-slate-500">Mínimo: 15,00%</span>
        </div>
      </div>

      {/* 4 Cards de Síntese */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Base de Cálculo de Impostos (Art. 198)</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-lg font-bold text-slate-800">{currency(totalBaseRevenues)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Impostos líquidos + Transferências CF</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Aplicação Mínima Obrigatória (15%)</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-lg font-bold text-amber-700">{currency(minimumRequired15)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Piso legal da LC 141/2012</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Despesa Própria Liquidada em Saúde</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-lg font-bold text-emerald-700">{currency(totalAppliedHealth)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Subfunções 301, 302, 304 com recursos próprios</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Percentual Aplicado</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-lg font-bold text-indigo-700">{actualPercentage}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Índice homologado para o SIOPS</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabelas de Receitas e Despesas */}
      <div className="space-y-3">
        <OperationalListFrame pagination={null} label="1. Receitas de Impostos e Transferências Constitucionais (Base de Cálculo)">
          <OperationalTable
            columns={columns}
            preferenceId="saude-receitas-base"
            caption="Receitas integrantes da base dos 15%"
            rows={revenueRows.map((r) => ({
              id: r.id,
              label: r.description,
              values: {
                code: r.code,
                description: r.description,
                expected: currency(r.expectedValue),
                realized: currency(r.realizedValue),
              },
            }))}
          />
        </OperationalListFrame>

        <OperationalListFrame pagination={null} label="2. Despesas com Ações e Serviços Públicos de Saúde (ASPS) com Recursos Próprios">
          <OperationalTable
            columns={columns}
            preferenceId="saude-despesas-proprias"
            caption="Despesas empenhadas e liquidadas em saúde com recursos municipais"
            rows={expenseRows.map((r) => ({
              id: r.id,
              label: r.description,
              values: {
                code: r.code,
                description: r.description,
                expected: currency(r.expectedValue),
                realized: currency(r.realizedValue),
              },
            }))}
          />
        </OperationalListFrame>
      </div>
    </PageFrame>
  );
}
