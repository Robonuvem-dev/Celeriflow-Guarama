"use client";

import { useState } from "react";
import { History, Calendar, CheckCircle, FileText, ArrowRight, Download, Printer } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumn } from "@/components/app-ui/operational/operational-columns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

type ExerciseInstrument = {
  id: string;
  kind: "PPA" | "LDO" | "LOA";
  code: string;
  title: string;
  year: number;
  period: string;
  totalRevenue: string;
  totalExpense: string;
  status: string;
  publishedAt: string;
  lawNumber: string;
  amendmentsCount: number;
};

const columns = [
  operationalColumn("kind", "Peça de Planejamento", 100, 130, { type: "identifier" }),
  operationalColumn("code", "Código / Projeto", 90, 120),
  operationalColumn("title", "Título / Descrição da Peça", 180, 280),
  operationalColumn("period", "Vigência", 90, 110),
  operationalColumn("revenue", "Receita Prevista", 120, 150, { type: "text", align: "right" }),
  operationalColumn("expense", "Despesa Fixada", 120, 150, { type: "text", align: "right" }),
  operationalColumn("law", "Lei / Decreto", 110, 140),
  operationalColumn("status", "Situação do Exercício", 95, 120, { type: "status" }),
];

export default function ExerciciosClient() {
  const [selectedYear, setSelectedYear] = useState<number>(2025);

  const mockData: Record<number, ExerciseInstrument[]> = {
    2026: [
      {
        id: "loa-2026",
        kind: "LOA",
        code: "LOA-2026",
        title: "Lei Orçamentária Anual para o Exercício 2026",
        year: 2026,
        period: "2026",
        totalRevenue: "R$ 142.500.000,00",
        totalExpense: "R$ 142.500.000,00",
        status: "Sancionada",
        publishedAt: "28/12/2025",
        lawNumber: "Lei Municipal nº 3.450/2025",
        amendmentsCount: 14,
      },
      {
        id: "ldo-2026",
        kind: "LDO",
        code: "LDO-2026",
        title: "Lei de Diretrizes Orçamentárias 2026",
        year: 2026,
        period: "2026",
        totalRevenue: "R$ 140.000.000,00",
        totalExpense: "R$ 140.000.000,00",
        status: "Publicada",
        publishedAt: "30/06/2025",
        lawNumber: "Lei Municipal nº 3.412/2025",
        amendmentsCount: 8,
      },
      {
        id: "ppa-2026",
        kind: "PPA",
        code: "PPA-2026-2029",
        title: "Plano Plurianual Quadriênio 2026-2029",
        year: 2026,
        period: "2026–2029",
        totalRevenue: "R$ 610.000.000,00",
        totalExpense: "R$ 610.000.000,00",
        status: "Publicada",
        publishedAt: "15/12/2025",
        lawNumber: "Lei Municipal nº 3.448/2025",
        amendmentsCount: 22,
      },
    ],
    2025: [
      {
        id: "loa-2025",
        kind: "LOA",
        code: "LOA-2025",
        title: "Lei Orçamentária Anual para o Exercício 2025 (Execução Encerrada)",
        year: 2025,
        period: "2025",
        totalRevenue: "R$ 128.000.000,00",
        totalExpense: "R$ 128.000.000,00",
        status: "Encerrada",
        publishedAt: "27/12/2024",
        lawNumber: "Lei Municipal nº 3.320/2024",
        amendmentsCount: 18,
      },
      {
        id: "ldo-2025",
        kind: "LDO",
        code: "LDO-2025",
        title: "Lei de Diretrizes Orçamentárias 2025",
        year: 2025,
        period: "2025",
        totalRevenue: "R$ 125.000.000,00",
        totalExpense: "R$ 125.000.000,00",
        status: "Publicada",
        publishedAt: "28/06/2024",
        lawNumber: "Lei Municipal nº 3.280/2024",
        amendmentsCount: 6,
      },
    ],
    2024: [
      {
        id: "loa-2024",
        kind: "LOA",
        code: "LOA-2024",
        title: "Lei Orçamentária Anual para o Exercício 2024 (Encerrado e Prestado Contas)",
        year: 2024,
        period: "2024",
        totalRevenue: "R$ 115.400.000,00",
        totalExpense: "R$ 115.400.000,00",
        status: "Encerrada",
        publishedAt: "26/12/2023",
        lawNumber: "Lei Municipal nº 3.190/2023",
        amendmentsCount: 12,
      },
      {
        id: "ldo-2024",
        kind: "LDO",
        code: "LDO-2024",
        title: "Lei de Diretrizes Orçamentárias 2024",
        year: 2024,
        period: "2024",
        totalRevenue: "R$ 112.000.000,00",
        totalExpense: "R$ 112.000.000,00",
        status: "Publicada",
        publishedAt: "25/06/2023",
        lawNumber: "Lei Municipal nº 3.140/2023",
        amendmentsCount: 5,
      },
    ],
    2023: [
      {
        id: "loa-2023",
        kind: "LOA",
        code: "LOA-2023",
        title: "Lei Orçamentária Anual para o Exercício 2023",
        year: 2023,
        period: "2023",
        totalRevenue: "R$ 102.800.000,00",
        totalExpense: "R$ 102.800.000,00",
        status: "Encerrada",
        publishedAt: "29/12/2022",
        lawNumber: "Lei Municipal nº 3.050/2022",
        amendmentsCount: 10,
      },
    ],
  };

  const records = mockData[selectedYear] || [];

  return (
    <PageFrame className="flex h-full min-h-0 flex-col space-y-3">
      <PageHeader
        title="Consulta da Elaboração do Planejamento em Outros Exercícios"
        icon={<History className="size-4 text-indigo-700" />}
      />

      {/* Faixa de seleção de exercício e ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
        <div className="flex items-center gap-3">
          <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Exercício de Elaboração:
          </Label>
          <Select
            value={String(selectedYear)}
            onValueChange={(val) => setSelectedYear(Number(val))}
          >
            <SelectTrigger className="h-8 text-xs w-[200px] font-bold text-indigo-900 bg-slate-50 border-indigo-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2026">Exercício 2026 (Corrente)</SelectItem>
              <SelectItem value="2025">Exercício 2025 (Encerrado)</SelectItem>
              <SelectItem value="2024">Exercício 2024 (Encerrado)</SelectItem>
              <SelectItem value="2023">Exercício 2023 (Encerrado)</SelectItem>
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
            Imprimir Relatório do Exercício
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => alert(`Exportando dossiê de planejamento do exercício ${selectedYear}...`)}
            className="h-8 text-xs flex items-center gap-1.5"
          >
            <Download className="size-3.5 text-slate-600" />
            Exportar Histórico
          </Button>
        </div>
      </div>

      {/* Cards informativos do exercício selecionado */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Peças Elaboradas no Ano</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-slate-800">{records.length} instrumentos</p>
            <p className="text-xs text-muted-foreground mt-0.5">PPA, LDO e LOA tramitados e arquivados</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Orçamento Consolidado</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-emerald-700">
              {records.find((r) => r.kind === "LOA")?.totalExpense ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Previsão e fixação sancionada</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Emendas Legislativas Apreciadas</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-indigo-700">
              {records.reduce((acc, cur) => acc + cur.amendmentsCount, 0)} emendas
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Emendas impositivas e de bancada</p>
          </CardContent>
        </Card>
      </div>

      <OperationalListFrame pagination={null}>
        <OperationalTable
          columns={columns}
          preferenceId="planejamento-exercicios"
          caption={`Instrumentos de Planejamento Elaborados no Exercício ${selectedYear}`}
          emptyMessage="Nenhuma peça elaborada no exercício selecionado."
          rows={records.map((r) => ({
            id: r.id,
            label: r.title,
            values: {
              kind: r.kind,
              code: r.code,
              title: r.title,
              period: r.period,
              revenue: r.totalRevenue,
              expense: r.totalExpense,
              law: r.lawNumber,
              status: r.status,
            },
          }))}
        />
      </OperationalListFrame>
    </PageFrame>
  );
}
