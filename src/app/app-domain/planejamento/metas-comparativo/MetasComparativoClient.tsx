"use client";

import { useState } from "react";
import { Target, TrendingUp, BarChart2, Download, Printer, Filter, AlertTriangle } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumn } from "@/components/app-ui/operational/operational-columns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import styles from "@/components/app-ui/operational/operational.module.css";

type ActionGoalRow = {
  id: string;
  actionCode: string;
  actionName: string;
  program: string;
  unit: string;
  unitOfMeasure: string;
  targetPhysical: number;
  actualPhysical: number;
  physicalPercent: number;
  budgetPlanned: number;
  budgetExecuted: number;
  financialPercent: number;
  performanceStatus: "SUPERADA" | "ATINGIDA" | "EM_ANDAMENTO" | "EM_RISCO" | "NAO_INICIADA";
};

const money = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

const columns = [
  operationalColumn("action", "Ação Orçamentária", 160, 240, { type: "identifier" }),
  operationalColumn("program", "Programa", 130, 200),
  operationalColumn("physical", "Meta Física (Prev / Real)", 120, 160, { type: "text", align: "right" }),
  operationalColumn("physicalPct", "Atingimento Físico", 90, 110, { type: "text", align: "right" }),
  operationalColumn("plannedBudget", "Orçado (R$)", 105, 130, { type: "text", align: "right" }),
  operationalColumn("executedBudget", "Liquidado (R$)", 105, 130, { type: "text", align: "right" }),
  operationalColumn("financialPct", "Execução Fin.", 90, 110, { type: "text", align: "right" }),
  operationalColumn("status", "Desempenho", 95, 120, { type: "status" }),
];

export default function MetasComparativoClient() {
  const [records] = useState<ActionGoalRow[]>([
    {
      id: "meta-1",
      actionCode: "2.012",
      actionName: "Manutenção do Transporte Escolar",
      program: "0012 - Educação com Qualidade",
      unit: "Secretaria de Educação",
      unitOfMeasure: "ALUNO",
      targetPhysical: 1250,
      actualPhysical: 1280,
      physicalPercent: 102.4,
      budgetPlanned: 1850000,
      budgetExecuted: 1795000,
      financialPercent: 97.0,
      performanceStatus: "SUPERADA",
    },
    {
      id: "meta-2",
      actionCode: "1.005",
      actionName: "Construção de Novas Unidades Básicas de Saúde",
      program: "0010 - Saúde Integral",
      unit: "Fundo Municipal de Saúde",
      unitOfMeasure: "UN",
      targetPhysical: 2,
      actualPhysical: 2,
      physicalPercent: 100.0,
      budgetPlanned: 3400000,
      budgetExecuted: 3380000,
      financialPercent: 99.4,
      performanceStatus: "ATINGIDA",
    },
    {
      id: "meta-3",
      actionCode: "2.078",
      actionName: "Recuperação e Pavimentação de Estradas Vicinais",
      program: "0015 - Infraestrutura e Logística",
      unit: "Secretaria de Obras",
      unitOfMeasure: "KM",
      targetPhysical: 180,
      actualPhysical: 135,
      physicalPercent: 75.0,
      budgetPlanned: 2200000,
      budgetExecuted: 1650000,
      financialPercent: 75.0,
      performanceStatus: "EM_ANDAMENTO",
    },
    {
      id: "meta-4",
      actionCode: "2.045",
      actionName: "Distribuição de Benefícios Eventuais e Cestas",
      program: "0008 - Proteção Social Básica",
      unit: "Fundo de Assistência Social",
      unitOfMeasure: "UN",
      targetPhysical: 3600,
      actualPhysical: 1800,
      physicalPercent: 50.0,
      budgetPlanned: 650000,
      budgetExecuted: 325000,
      financialPercent: 50.0,
      performanceStatus: "EM_ANDAMENTO",
    },
    {
      id: "meta-5",
      actionCode: "1.018",
      actionName: "Implantação do Parque Tecnológico Municipal",
      program: "0020 - Inovação e Empreendedorismo",
      unit: "Secretaria de Desenvolvimento",
      unitOfMeasure: "UN",
      targetPhysical: 1,
      actualPhysical: 0,
      physicalPercent: 0.0,
      budgetPlanned: 1200000,
      budgetExecuted: 120000,
      financialPercent: 10.0,
      performanceStatus: "EM_RISCO",
    },
  ]);

  const [search, setSearch] = useState("");
  const [filterProgram, setFilterProgram] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const programs = [...new Set(records.map((r) => r.program))];

  const filtered = records.filter((r) => {
    const matchesSearch =
      r.actionName.toLowerCase().includes(search.toLowerCase()) ||
      r.actionCode.includes(search) ||
      r.program.toLowerCase().includes(search.toLowerCase());
    const matchesProg = filterProgram === "ALL" || r.program === filterProgram;
    const matchesStat = filterStatus === "ALL" || r.performanceStatus === filterStatus;
    return matchesSearch && matchesProg && matchesStat;
  });

  const totalPlanned = filtered.reduce((acc, r) => acc + r.budgetPlanned, 0);
  const totalExecuted = filtered.reduce((acc, r) => acc + r.budgetExecuted, 0);
  const overallFinancialPct = totalPlanned ? ((totalExecuted / totalPlanned) * 100).toFixed(1) : "0.0";
  const averagePhysicalPct = filtered.length
    ? (filtered.reduce((acc, r) => acc + r.physicalPercent, 0) / filtered.length).toFixed(1)
    : "0.0";

  const statusLabel = {
    SUPERADA: "Superada",
    ATINGIDA: "Meta Atingida",
    EM_ANDAMENTO: "Em Andamento",
    EM_RISCO: "Em Risco",
    NAO_INICIADA: "Não Iniciada",
  };

  return (
    <PageFrame className="flex h-full min-h-0 flex-col space-y-3">
      <PageHeader
        title="Consulta de Ações e Metas: Comparativo Previsto x Executado"
        icon={<Target className="size-4 text-indigo-700" />}
      />

      {/* Cards de Resumo de Execução */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Ações Monitoradas</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-slate-800">{filtered.length} ações</p>
            <p className="text-xs text-muted-foreground mt-0.5">Programas do PPA / LOA 2026</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Média de Atingimento Físico</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-indigo-700">{averagePhysicalPct}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Metas físicas de produtos entregues</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Orçado x Liquidado</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-emerald-700">{money(totalExecuted)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">de {money(totalPlanned)} fixados</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Execução Financeira Global</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-slate-800">{overallFinancialPct}%</p>
            <p className="text-xs text-muted-foreground mt-0.5">Liquidado sobre o orçado</p>
          </CardContent>
        </Card>
      </div>

      <OperationalListFrame pagination={null}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="h-8 text-xs flex items-center gap-1.5"
            >
              <Printer className="size-3.5 text-slate-600" />
              Imprimir Comparativo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => alert("Exportando demonstrativo comparativo de metas físicas e financeiras...")}
              className="h-8 text-xs flex items-center gap-1.5"
            >
              <Download className="size-3.5 text-slate-600" />
              Exportar XLS
            </Button>
          </div>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Buscar ação ou programa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            <Select value={filterProgram} onValueChange={(val) => setFilterProgram(val ?? "ALL")}>
              <SelectTrigger className="h-8 text-xs w-[180px] bg-white">
                <SelectValue placeholder="Programa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os Programas</SelectItem>
                {programs.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(val) => setFilterStatus(val ?? "ALL")}>
              <SelectTrigger className="h-8 text-xs w-[160px] bg-white">
                <SelectValue placeholder="Situação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as Situações</SelectItem>
                <SelectItem value="SUPERADA">Superada</SelectItem>
                <SelectItem value="ATINGIDA">Meta Atingida</SelectItem>
                <SelectItem value="EM_ANDAMENTO">Em Andamento</SelectItem>
                <SelectItem value="EM_RISCO">Em Risco</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        <OperationalTable
          columns={columns}
          preferenceId="planejamento-metas-comparativo"
          caption="Comparativo Físico e Financeiro das Ações e Metas do Planejamento"
          emptyMessage="Nenhuma ação localizada."
          rows={filtered.map((row) => ({
            id: row.id,
            label: `${row.actionCode} - ${row.actionName}`,
            values: {
              action: `${row.actionCode} · ${row.actionName}`,
              program: row.program,
              physical: `${row.actualPhysical.toLocaleString("pt-BR")} / ${row.targetPhysical.toLocaleString("pt-BR")} ${row.unitOfMeasure}`,
              physicalPct: `${row.physicalPercent.toFixed(1)}%`,
              plannedBudget: money(row.budgetPlanned),
              executedBudget: money(row.budgetExecuted),
              financialPct: `${row.financialPercent.toFixed(1)}%`,
              status: statusLabel[row.performanceStatus],
            },
          }))}
        />
      </OperationalListFrame>
    </PageFrame>
  );
}
