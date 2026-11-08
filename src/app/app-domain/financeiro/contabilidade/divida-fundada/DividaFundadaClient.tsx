"use client";

import { useState } from "react";
import { Landmark, Download, Printer, Filter, ShieldCheck, Plus, Eye } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumn } from "@/components/app-ui/operational/operational-columns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

type FundedDebtItem = {
  id: string;
  contractNumber: string;
  creditorName: string;
  type: string;
  legalBasis: string;
  contractDate: string;
  maturityDate: string;
  originalAmount: number;
  amortizationYear: number;
  interestYear: number;
  currentBalance: number;
  status: string;
};

const money = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

const columns = [
  operationalColumn("contract", "Contrato / Operação", 120, 150, { type: "identifier" }),
  operationalColumn("creditor", "Credor / Instituição", 160, 240),
  operationalColumn("type", "Tipo de Dívida Fundada", 130, 180),
  operationalColumn("dates", "Contratação / Vencimento", 120, 150),
  operationalColumn("original", "Valor Contratado", 110, 140, { type: "text", align: "right" }),
  operationalColumn("amortized", "Amortização no Exercício", 115, 140, { type: "text", align: "right" }),
  operationalColumn("interest", "Juros / Encargos", 100, 130, { type: "text", align: "right" }),
  operationalColumn("balance", "Saldo Devedor Atual", 120, 150, { type: "text", align: "right" }),
  operationalColumn("status", "Situação", 80, 100, { type: "status" }),
];

export default function DividaFundadaClient() {
  const [debts] = useState<FundedDebtItem[]>([
    {
      id: "deb-1",
      contractNumber: "FINISA-0542/2023",
      creditorName: "Caixa Econômica Federal",
      type: "Contratual Interna - Obras e Saneamento",
      legalBasis: "Lei Autorizadora nº 3.120/2023",
      contractDate: "14/08/2023",
      maturityDate: "15/08/2033",
      originalAmount: 15000000,
      amortizationYear: 1500000,
      interestYear: 840000,
      currentBalance: 11250000,
      status: "Adimplente",
    },
    {
      id: "deb-2",
      contractNumber: "BNDES-PMAT-2022",
      creditorName: "Banco Nacional de Desenvolvimento Econômico e Social",
      type: "Modernização Tributária e Administrativa",
      legalBasis: "Lei Municipal nº 3.015/2022",
      contractDate: "20/03/2022",
      maturityDate: "20/03/2028",
      originalAmount: 4800000,
      amortizationYear: 800000,
      interestYear: 245000,
      currentBalance: 1600000,
      status: "Adimplente",
    },
    {
      id: "deb-3",
      contractNumber: "PARC-INSS-115/2021",
      creditorName: "Receita Federal do Brasil / PGFN",
      type: "Parcelamento Especial Previdenciário (RGPS)",
      legalBasis: "Termo de Parcelamento RFB nº 884/2021",
      contractDate: "10/05/2021",
      maturityDate: "10/05/2036",
      originalAmount: 8500000,
      amortizationYear: 566667,
      interestYear: 180000,
      currentBalance: 5950000,
      status: "Adimplente",
    },
    {
      id: "deb-4",
      contractNumber: "PREC-TJMG-2026",
      creditorName: "Tribunal de Justiça de Minas Gerais",
      type: "Precatórios Judiciais - Regime Especial",
      legalBasis: "Emenda Constitucional nº 109/2021",
      contractDate: "01/01/2026",
      maturityDate: "31/12/2029",
      originalAmount: 6200000,
      amortizationYear: 1550000,
      interestYear: 0,
      currentBalance: 4650000,
      status: "Adimplente",
    },
  ]);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("ALL");

  const filtered = debts.filter((d) => {
    const matchesSearch =
      d.contractNumber.toLowerCase().includes(search.toLowerCase()) ||
      d.creditorName.toLowerCase().includes(search.toLowerCase()) ||
      d.type.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "ALL" || d.type.includes(filterType);
    return matchesSearch && matchesType;
  });

  const totalContracted = filtered.reduce((acc, d) => acc + d.originalAmount, 0);
  const totalBalance = filtered.reduce((acc, d) => acc + d.currentBalance, 0);
  const totalAmortized = filtered.reduce((acc, d) => acc + d.amortizationYear, 0);
  const totalInterest = filtered.reduce((acc, d) => acc + d.interestYear, 0);

  return (
    <PageFrame className="flex h-full min-h-0 flex-col space-y-3">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Consulta de Dívidas Fundadas e Operações de Crédito (Art. 29 da LRF)"
          icon={<Landmark className="size-4 text-emerald-700" />}
        />
        <Link
          href="/financeiro/contabilidade"
          className="text-xs text-emerald-800 underline hover:text-emerald-950 font-medium"
        >
          ← Voltar à Contabilidade
        </Link>
      </div>

      {/* 4 Cards de Síntese da Dívida Consolidada */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Saldo Devedor Consolidado (DCL)</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-rose-700">{money(totalBalance)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Posição do passivo exigível a longo prazo</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Valor Original Contratado</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-slate-800">{money(totalContracted)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total de operações de crédito firmadas</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Amortização no Exercício</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-emerald-700">{money(totalAmortized)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Principal pago nas funções de governo</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Juros e Encargos Pagos</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-amber-700">{money(totalInterest)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Encargos contratuais do exercício</p>
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
              Imprimir Relatório LRF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => alert("Exportando mapa da Dívida Consolidada em formato STN/Siconfi...")}
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
              placeholder="Buscar por contrato, credor ou tipo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            <Select value={filterType} onValueChange={(val) => setFilterType(val || "ALL")}>
              <SelectTrigger className="h-8 text-xs w-[180px] bg-white">
                <SelectValue placeholder="Tipo de Dívida" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os Tipos</SelectItem>
                <SelectItem value="Contratual">Contratual (Financiamentos)</SelectItem>
                <SelectItem value="Previdenciário">Parcelamento Previdenciário</SelectItem>
                <SelectItem value="Precatórios">Precatórios Judiciais</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        <OperationalTable
          columns={columns}
          preferenceId="contabilidade-divida-fundada"
          caption="Demonstrativo da Dívida Fundada / Consolidada Municipal"
          emptyMessage="Nenhuma dívida fundada cadastrada."
          rows={filtered.map((row) => ({
            id: row.id,
            label: `${row.contractNumber} - ${row.creditorName}`,
            values: {
              contract: row.contractNumber,
              creditor: `${row.creditorName} (${row.legalBasis})`,
              type: row.type,
              dates: `${row.contractDate} até ${row.maturityDate}`,
              original: money(row.originalAmount),
              amortized: money(row.amortizationYear),
              interest: money(row.interestYear),
              balance: money(row.currentBalance),
              status: row.status,
            },
          }))}
        />
      </OperationalListFrame>
    </PageFrame>
  );
}
