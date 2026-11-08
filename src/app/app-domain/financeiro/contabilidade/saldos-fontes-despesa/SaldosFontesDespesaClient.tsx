"use client";

import { useState } from "react";
import { Coins, Printer, Download, Filter } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumn } from "@/components/app-ui/operational/operational-columns";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

type SourceExpenseBalance = {
  id: string;
  sourceCode: string;
  sourceName: string;
  orcado: number;
  creditos: number;
  reducoes: number;
  empenhado: number;
  anulado: number;
  liquidado: number;
  pago: number;
  aLiquidar: number;
  aPagar: number;
  liquidadoAPagar: number;
};

const currency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

const columns = [
  operationalColumn("source", "Fonte de Recursos", 160, 240, { type: "identifier" }),
  operationalColumn("orcado", "Orçado (1)", 100, 125, { type: "text", align: "right" }),
  operationalColumn("creditos", "Créditos (2)", 95, 120, { type: "text", align: "right" }),
  operationalColumn("reducoes", "Reduções (3)", 95, 120, { type: "text", align: "right" }),
  operationalColumn("empenhado", "Empenhado (4)", 105, 130, { type: "text", align: "right" }),
  operationalColumn("anulado", "Anulado (5)", 90, 115, { type: "text", align: "right" }),
  operationalColumn("liquidado", "Liquidado (6)", 105, 130, { type: "text", align: "right" }),
  operationalColumn("pago", "Pago (7)", 105, 130, { type: "text", align: "right" }),
  operationalColumn("aLiquidar", "A Liquidar (8)", 100, 125, { type: "text", align: "right" }),
  operationalColumn("aPagar", "A Pagar (9)", 100, 125, { type: "text", align: "right" }),
  operationalColumn("liquidadoAPagar", "Liquidado a Pagar (10)", 115, 140, { type: "text", align: "right" }),
];

export default function SaldosFontesDespesaClient() {
  const [exercise, setExercise] = useState("2026");
  const [search, setSearch] = useState("");

  const rows: SourceExpenseBalance[] = [
    {
      id: "f-500",
      sourceCode: "1.500.0000",
      sourceName: "Recursos Não Vinculados de Impostos (Próprios)",
      orcado: 54000000,
      creditos: 3200000,
      reducoes: 1100000,
      empenhado: 48500000,
      anulado: 450000,
      liquidado: 43200000,
      pago: 41800000,
      aLiquidar: 4850000,
      aPagar: 6250000,
      liquidadoAPagar: 1400000,
    },
    {
      id: "f-501",
      sourceCode: "1.501.0000",
      sourceName: "Outros Recursos Não Vinculados (Taxas e Serviços)",
      orcado: 8500000,
      creditos: 600000,
      reducoes: 200000,
      empenhado: 7100000,
      anulado: 80000,
      liquidado: 6450000,
      pago: 6200000,
      aLiquidar: 570000,
      aPagar: 820000,
      liquidadoAPagar: 250000,
    },
    {
      id: "f-540",
      sourceCode: "1.540.0000",
      sourceName: "FUNDEB - Impostos e Transferências de Impostos (70%)",
      orcado: 24000000,
      creditos: 1800000,
      reducoes: 0,
      empenhado: 22800000,
      anulado: 120000,
      liquidado: 21500000,
      pago: 21000000,
      aLiquidar: 1180000,
      aPagar: 1680000,
      liquidadoAPagar: 500000,
    },
    {
      id: "f-600",
      sourceCode: "1.600.0000",
      sourceName: "Transferências Fundo a Fundo do SUS (União)",
      orcado: 16800000,
      creditos: 1200000,
      reducoes: 300000,
      empenhado: 15400000,
      anulado: 210000,
      liquidado: 14200000,
      pago: 13800000,
      aLiquidar: 990000,
      aPagar: 1390000,
      liquidadoAPagar: 400000,
    },
    {
      id: "f-700",
      sourceCode: "1.700.0000",
      sourceName: "Operações de Crédito Internas (Obras FINISA)",
      orcado: 12000000,
      creditos: 500000,
      reducoes: 500000,
      empenhado: 9500000,
      anulado: 0,
      liquidado: 8200000,
      pago: 7800000,
      aLiquidar: 1300000,
      aPagar: 1700000,
      liquidadoAPagar: 400000,
    },
  ];

  const filtered = rows.filter(
    (r) =>
      r.sourceCode.includes(search) ||
      r.sourceName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageFrame className="flex h-full min-h-0 flex-col space-y-3">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Consulta dos Saldos da Despesa Orçamentária por Fonte de Recurso"
          icon={<Coins className="size-4 text-emerald-700" />}
        />
        <Link
          href="/financeiro/contabilidade"
          className="text-xs text-emerald-800 underline hover:text-emerald-950 font-medium"
        >
          ← Voltar à Contabilidade
        </Link>
      </div>

      <p className="text-xs text-slate-500">
        Demonstrativo dos 10 estágios da execução da despesa orçamentária por fonte de recurso conforme Portaria STN:
        Orçado, Créditos (+), Reduções (-), Empenhado, Anulado (-), Liquidado, Pago, A Liquidar, A Pagar e Liquidado a Pagar.
      </p>

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
              Imprimir Relatório
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => alert("Exportando mapa completo de saldos por fonte...")}
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
              placeholder="Buscar por código ou descrição da fonte..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            <Select value={exercise} onValueChange={(val) => setExercise(val || "2026")}>
              <SelectTrigger className="h-8 text-xs w-[140px] bg-white">
                <SelectValue placeholder="Exercício" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2026">Exercício 2026</SelectItem>
                <SelectItem value="2025">Exercício 2025</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        <OperationalTable
          columns={columns}
          preferenceId="contabilidade-saldos-fontes-despesa"
          caption="Demonstrativo Analítico dos Saldos da Despesa Orçamentária por Fonte de Recursos"
          emptyMessage="Nenhuma fonte de recursos localizada."
          rows={filtered.map((r) => ({
            id: r.id,
            label: `${r.sourceCode} - ${r.sourceName}`,
            values: {
              source: `${r.sourceCode} · ${r.sourceName}`,
              orcado: currency(r.orcado),
              creditos: currency(r.creditos),
              reducoes: currency(r.reducoes),
              empenhado: currency(r.empenhado),
              anulado: currency(r.anulado),
              liquidado: currency(r.liquidado),
              pago: currency(r.pago),
              aLiquidar: currency(r.aLiquidar),
              aPagar: currency(r.aPagar),
              liquidadoAPagar: currency(r.liquidadoAPagar),
            },
          }))}
        />
      </OperationalListFrame>
    </PageFrame>
  );
}
