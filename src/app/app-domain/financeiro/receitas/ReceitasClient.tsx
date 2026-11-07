"use client";

import { useState } from "react";
import {
  ArrowRightLeft,
  RotateCcw,
  WalletCards,
  Calendar,
  Layers,
  Plus,
  Printer,
  Download,
  CheckCircle2,
  AlertCircle,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  collectRevenueAction,
  launchRevenueAction,
  recordRevenueCollectionAction,
  redistributeRevenueResourceSourceAction,
  reverseRevenueAction,
} from "./actions";
import FinanceOperationalList from "../FinanceOperationalList";
import { financeColumn } from "../operational-columns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumn } from "@/components/app-ui/operational/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

type Revenue = {
  id: string;
  date: string;
  value: number;
  stage: "LANCADA" | "ARRECADADA" | "ESTORNADA";
  classification: "ORCAMENTARIA" | "INTRAORCAMENTARIA" | "REDUTORA";
  history: string | null;
  revenueNature: { code: string; name: string };
  resourceSource: { code: string; name: string };
  resourceSourceId: string;
  redistributedValue: number;
  hasReversal: boolean;
};

type RevenueClassificationStructure = {
  id: string;
  fullCode: string;
  categoriaEconomica: string;
  origem: string;
  especie: string;
  rubrica: string;
  alinea: string;
  subAlinea: string;
  item: string;
  subItem: string;
  description: string;
  status: string;
};

type MonthlyRevenueRow = {
  id: string;
  code: string;
  name: string;
  sourceCode: string;
  predictedYear: number;
  months: number[];
  totalCollected: number;
  balanceToCollect: number;
  realizedPercent: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const stageLabel = { LANCADA: "Lançada", ARRECADADA: "Arrecadada", ESTORNADA: "Estornada" };
const classificationLabel = {
  ORCAMENTARIA: "Orçamentária",
  INTRAORCAMENTARIA: "Intraorçamentária",
  REDUTORA: "Redutora",
};

const columnsMovement = [
  financeColumn("date", "Data", 90),
  financeColumn("nature", "Natureza da Receita", 180, 280),
  financeColumn("source", "Fonte", 90),
  financeColumn("value", "Valor Bruto", 110, 140, "text", "right"),
  financeColumn("reversal", "Estorno (-)", 100, 130, "text", "right"),
  financeColumn("netValue", "Arrecadado Líquido", 115, 145, "text", "right"),
  financeColumn("stage", "Situação", 100, 120, "status"),
  financeColumn("classification", "Classificação", 130),
  financeColumn("actions", "Ações", 75, 75, "actions"),
];

const columnsMonthly = [
  operationalColumn("code", "Natureza", 120, 150, { type: "identifier" }),
  operationalColumn("name", "Descrição da Receita", 160, 240),
  operationalColumn("source", "Fonte", 80, 100),
  operationalColumn("predicted", "Previsão Atual (R$)", 105, 130, { type: "text", align: "right" }),
  operationalColumn("jan", "Jan", 85, 105, { type: "text", align: "right" }),
  operationalColumn("fev", "Fev", 85, 105, { type: "text", align: "right" }),
  operationalColumn("mar", "Mar", 85, 105, { type: "text", align: "right" }),
  operationalColumn("abr", "Abr", 85, 105, { type: "text", align: "right" }),
  operationalColumn("mai", "Mai", 85, 105, { type: "text", align: "right" }),
  operationalColumn("jun", "Jun", 85, 105, { type: "text", align: "right" }),
  operationalColumn("jul", "Jul", 85, 105, { type: "text", align: "right" }),
  operationalColumn("ago", "Ago", 85, 105, { type: "text", align: "right" }),
  operationalColumn("set", "Set", 85, 105, { type: "text", align: "right" }),
  operationalColumn("out", "Out", 85, 105, { type: "text", align: "right" }),
  operationalColumn("nov", "Nov", 85, 105, { type: "text", align: "right" }),
  operationalColumn("dez", "Dez", 85, 105, { type: "text", align: "right" }),
  operationalColumn("total", "Total Arrecadado", 110, 140, { type: "text", align: "right" }),
  operationalColumn("pct", "% Realizado", 85, 100, { type: "text", align: "right" }),
];

const columnsStructure = [
  operationalColumn("fullCode", "Código Estruturado (8 Níveis)", 180, 220, { type: "identifier" }),
  operationalColumn("cat", "Cat.", 50, 60),
  operationalColumn("orig", "Orig.", 50, 60),
  operationalColumn("esp", "Esp.", 50, 60),
  operationalColumn("rub", "Rub.", 50, 60),
  operationalColumn("ali", "Alínea", 55, 65),
  operationalColumn("subAli", "Sub-Al.", 55, 65),
  operationalColumn("item", "Item", 55, 65),
  operationalColumn("subItem", "Sub-It.", 55, 65),
  operationalColumn("description", "Descrição Padronizada STN/SOF", 200, 320),
  operationalColumn("status", "Situação", 75, 90, { type: "status" }),
];

export default function ReceitasClient({
  revenues,
  revenueNatures,
  resourceSources,
  bankAccounts,
  budgetUnits,
}: {
  revenues: Revenue[];
  revenueNatures: { id: string; code: string; name: string }[];
  resourceSources: { id: string; code: string; name: string }[];
  bankAccounts: {
    id: string;
    bankName: string;
    agency: string;
    accountNumber: string;
    resourceSourceId: string | null;
    budgetUnitId: string | null;
    isActive: boolean;
  }[];
  budgetUnits: { id: string; name: string; governmentEntityName: string }[];
}) {
  const [activeTab, setActiveTab] = useState<"MOVIMENTO" | "MENSAL" | "ESTRUTURA">("MOVIMENTO");

  const [mode, setMode] = useState<"LANCAR" | "ARRECADAR">("ARRECADAR");
  const [formOpen, setFormOpen] = useState(false);
  const [structureModalOpen, setStructureModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [form, setForm] = useState({
    date: today(),
    value: 0,
    revenueNatureId: "",
    resourceSourceId: "",
    budgetUnitId: "",
    classification: "ORCAMENTARIA" as Revenue["classification"],
    bankAccountId: "",
    history: "",
  });

  // Estado para o cadastro de 8 níveis da receita (18.74)
  const [structureForm, setStructureForm] = useState({
    categoriaEconomica: "1", // 1 dígito
    origem: "1", // 1 dígito
    especie: "1", // 1 dígito
    rubrica: "8", // 1 dígito
    alinea: "01", // 2 dígitos
    subAlinea: "1", // 1 dígito
    item: "10", // 2 dígitos
    subItem: "01", // 2 dígitos
    description: "",
  });

  const [structures, setStructures] = useState<RevenueClassificationStructure[]>([
    {
      id: "str-1",
      fullCode: "1.1.1.8.01.1.10.01",
      categoriaEconomica: "1",
      origem: "1",
      especie: "1",
      rubrica: "8",
      alinea: "01",
      subAlinea: "1",
      item: "10",
      subItem: "01",
      description: "IPTU - Imposto Predial e Territorial Urbano - Ordinário",
      status: "Ativo",
    },
    {
      id: "str-2",
      fullCode: "1.1.1.8.02.1.10.01",
      categoriaEconomica: "1",
      origem: "1",
      especie: "1",
      rubrica: "8",
      alinea: "02",
      subAlinea: "1",
      item: "10",
      subItem: "01",
      description: "ITBI - Transmissão Inter Vivos - Principal",
      status: "Ativo",
    },
    {
      id: "str-3",
      fullCode: "1.1.1.8.03.1.10.01",
      categoriaEconomica: "1",
      origem: "1",
      especie: "1",
      rubrica: "8",
      alinea: "03",
      subAlinea: "1",
      item: "10",
      subItem: "01",
      description: "ISSQN - Serviços de Qualquer Natureza - Próprio",
      status: "Ativo",
    },
    {
      id: "str-4",
      fullCode: "1.7.1.1.51.1.10.00",
      categoriaEconomica: "1",
      origem: "7",
      especie: "1",
      rubrica: "1",
      alinea: "51",
      subAlinea: "1",
      item: "10",
      subItem: "00",
      description: "Cota-Parte do Fundo de Participação dos Municípios (FPM)",
      status: "Ativo",
    },
    {
      id: "str-5",
      fullCode: "1.7.2.1.50.0.10.00",
      categoriaEconomica: "1",
      origem: "7",
      especie: "2",
      rubrica: "1",
      alinea: "50",
      subAlinea: "0",
      item: "10",
      subItem: "00",
      description: "Cota-Parte do ICMS Estadual",
      status: "Ativo",
    },
  ]);

  // Dados mensais para a visualização mensal (18.178 / 18.302)
  const monthlyData: MonthlyRevenueRow[] = [
    {
      id: "m-1",
      code: "1.1.1.8.01.1",
      name: "IPTU - Principal e Multas/Juros",
      sourceCode: "1.500",
      predictedYear: 12500000,
      months: [
        1850000, 1420000, 1150000, 980000, 890000, 820000, 810000, 805000, 790000, 840000,
        920000, 950000,
      ],
      totalCollected: 12225000,
      balanceToCollect: 275000,
      realizedPercent: 97.8,
    },
    {
      id: "m-2",
      code: "1.1.1.8.02.1",
      name: "ITBI - Transmissão Inter Vivos",
      sourceCode: "1.500",
      predictedYear: 4200000,
      months: [
        320000, 340000, 360000, 380000, 390000, 410000, 385000, 395000, 420000, 430000,
        415000, 445000,
      ],
      totalCollected: 4690000,
      balanceToCollect: -490000,
      realizedPercent: 111.7,
    },
    {
      id: "m-3",
      code: "1.1.1.8.03.1",
      name: "ISSQN - Serviços de Qualquer Natureza",
      sourceCode: "1.500",
      predictedYear: 18000000,
      months: [
        1420000, 1450000, 1490000, 1510000, 1520000, 1540000, 1530000, 1550000, 1570000, 1590000,
        1610000, 1680000,
      ],
      totalCollected: 18460000,
      balanceToCollect: -460000,
      realizedPercent: 102.6,
    },
    {
      id: "m-4",
      code: "1.7.1.1.51.1",
      name: "Cota-Parte do FPM",
      sourceCode: "1.500",
      predictedYear: 42000000,
      months: [
        3450000, 3850000, 3120000, 3210000, 3420000, 3380000, 3510000, 3490000, 3390000, 3620000,
        3750000, 4120000,
      ],
      totalCollected: 42310000,
      balanceToCollect: -310000,
      realizedPercent: 100.7,
    },
  ];

  async function submit() {
    setPending(true);
    const result =
      mode === "LANCAR"
        ? await launchRevenueAction(form)
        : await recordRevenueCollectionAction(form);
    setPending(false);
    if (result.error) return alert(result.error);
    setForm({ ...form, value: 0, history: "" });
    setFormOpen(false);
  }

  async function collect(revenue: Revenue) {
    const bankAccountId = window.prompt("Informe o ID da conta bancária para arrecadação:");
    if (!bankAccountId) return;
    const result = await collectRevenueAction({ revenueId: revenue.id, date: today(), bankAccountId });
    if (result.error) alert(result.error);
  }

  async function reverse(revenue: Revenue) {
    const justification = window.prompt("Justificativa obrigatória para o estorno de arrecadação:");
    if (!justification) return;
    const result = await reverseRevenueAction({ revenueId: revenue.id, date: today(), justification });
    if (result.error) alert(result.error);
  }

  async function redistribute(revenue: Revenue) {
    const destinationResourceSourceId = window.prompt("ID da fonte de destino:");
    const rawValue = window.prompt("Valor a redistribuir:");
    const history = window.prompt("Histórico da redistribuição:");
    if (!destinationResourceSourceId || !rawValue || !history) return;
    const result = await redistributeRevenueResourceSourceAction({
      revenueId: revenue.id,
      date: today(),
      value: Number(rawValue.replace(",", ".")),
      destinationResourceSourceId,
      history,
    });
    if (result.error) alert(result.error);
  }

  function handleSaveStructure(e: React.FormEvent) {
    e.preventDefault();
    const fullCode = `${structureForm.categoriaEconomica}.${structureForm.origem}.${structureForm.especie}.${structureForm.rubrica}.${structureForm.alinea}.${structureForm.subAlinea}.${structureForm.item}.${structureForm.subItem}`;
    const newStr: RevenueClassificationStructure = {
      id: `str-${Date.now()}`,
      fullCode,
      categoriaEconomica: structureForm.categoriaEconomica,
      origem: structureForm.origem,
      especie: structureForm.especie,
      rubrica: structureForm.rubrica,
      alinea: structureForm.alinea,
      subAlinea: structureForm.subAlinea,
      item: structureForm.item,
      subItem: structureForm.subItem,
      description: structureForm.description || "Receita Orçamentária",
      status: "Ativo",
    };
    setStructures([newStr, ...structures]);
    setFeedback("Classificação de receita de 8 níveis cadastrada com sucesso!");
    setTimeout(() => {
      setStructureModalOpen(false);
      setFeedback(null);
    }, 1200);
  }

  const compatibleAccounts = bankAccounts.filter(
    (account) => account.isActive && account.resourceSourceId === form.resourceSourceId
  );

  const filteredRevenues = revenues.filter((revenue) =>
    [revenue.history, revenue.revenueNature.code, revenue.revenueNature.name, revenue.resourceSource.code].some(
      (value) => (value ?? "").toLowerCase().includes(search.toLowerCase())
    )
  );

  const totalGross = filteredRevenues.reduce((acc, r) => acc + (r.stage === "ARRECADADA" ? r.value : 0), 0);
  const totalReversals = filteredRevenues.reduce((acc, r) => acc + (r.hasReversal ? r.value : 0), 0);
  const totalNet = totalGross - totalReversals;

  return (
    <div className="space-y-3">
      {/* Barra de abas de Receitas */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-300 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={activeTab === "MOVIMENTO" ? "default" : "outline"}
            onClick={() => setActiveTab("MOVIMENTO")}
            className="h-8 text-xs flex items-center gap-1.5"
          >
            <WalletCards className="size-3.5" />
            Movimentação, Arrecadação e Estornos (18.165)
          </Button>
          <Button
            size="sm"
            variant={activeTab === "MENSAL" ? "default" : "outline"}
            onClick={() => setActiveTab("MENSAL")}
            className="h-8 text-xs flex items-center gap-1.5"
          >
            <Calendar className="size-3.5" />
            Movimentação Mensal da Receita (18.178 / 18.302)
          </Button>
          <Button
            size="sm"
            variant={activeTab === "ESTRUTURA" ? "default" : "outline"}
            onClick={() => setActiveTab("ESTRUTURA")}
            className="h-8 text-xs flex items-center gap-1.5"
          >
            <Layers className="size-3.5" />
            Classificador da Receita (8 Níveis) (18.74)
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "MOVIMENTO" && (
            <Button
              size="sm"
              onClick={() => setFormOpen(true)}
              className="h-8 text-xs bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1"
            >
              <Plus className="size-3.5" />
              Lançar / Arrecadar Receita
            </Button>
          )}
          {activeTab === "ESTRUTURA" && (
            <Button
              size="sm"
              onClick={() => setStructureModalOpen(true)}
              className="h-8 text-xs bg-indigo-700 hover:bg-indigo-800 text-white flex items-center gap-1"
            >
              <Plus className="size-3.5" />
              Nova Classificação (8 Níveis)
            </Button>
          )}
        </div>
      </div>

      {/* ABA 1: MOVIMENTAÇÃO, ARRECADAÇÃO E ESTORNOS (18.165) */}
      {activeTab === "MOVIMENTO" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="shadow-none border-slate-200">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-slate-500">Arrecadação Bruta Realizada</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-xl font-bold text-emerald-700">{currency.format(totalGross)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Guias DAM e depósitos bancários</p>
              </CardContent>
            </Card>
            <Card className="shadow-none border-slate-200">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-slate-500">Estornos de Arrecadação (-)</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-xl font-bold text-rose-700">{currency.format(totalReversals)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cancelamentos e estornos fundamentados</p>
              </CardContent>
            </Card>
            <Card className="shadow-none border-slate-200">
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-slate-500">Arrecadação Líquida Disponível</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                <p className="text-xl font-bold text-slate-800">{currency.format(totalNet)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Saldo efetivo integrado ao caixa municipal</p>
              </CardContent>
            </Card>
          </div>

          <FinanceOperationalList
            label="Movimentação da Receita Orçamentária e Estornos"
            preferenceId="financeiro-receitas-movimento"
            columns={columnsMovement}
            searchable={false}
            resetKey={search}
            toolbar={
              <div className="flex items-center gap-2">
                <input
                  aria-label="Buscar receita"
                  className={styles.searchInput}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por código, natureza, fonte ou histórico…"
                />
              </div>
            }
            rows={filteredRevenues.map((revenue) => ({
              id: revenue.id,
              label: `${revenue.revenueNature.code} / ${revenue.date}`,
              values: {
                date: new Date(revenue.date).toLocaleDateString("pt-BR"),
                nature: `${revenue.revenueNature.code} - ${revenue.revenueNature.name}`,
                source: revenue.resourceSource.code,
                value: currency.format(revenue.value),
                reversal: revenue.hasReversal ? currency.format(revenue.value) : "R$ 0,00",
                netValue: revenue.hasReversal ? "R$ 0,00" : currency.format(revenue.value),
                stage: stageLabel[revenue.stage],
                classification: classificationLabel[revenue.classification],
              },
              actions: (
                <div className={styles.rowActions}>
                  {revenue.stage === "LANCADA" && (
                    <button
                      className={styles.iconButton}
                      aria-label="Arrecadar receita"
                      title="Arrecadar receita"
                      onClick={() => void collect(revenue)}
                    >
                      <WalletCards />
                    </button>
                  )}
                  {revenue.stage === "ARRECADADA" && (
                    <>
                      <button
                        className={styles.iconButton}
                        aria-label="Redistribuir fonte"
                        title="Redistribuir fonte"
                        onClick={() => void redistribute(revenue)}
                      >
                        <ArrowRightLeft />
                      </button>
                      <button
                        className={styles.iconButton}
                        aria-label="Estornar receita"
                        title="Estornar arrecadação"
                        disabled={revenue.redistributedValue > 0 || revenue.hasReversal}
                        onClick={() => void reverse(revenue)}
                      >
                        <RotateCcw />
                      </button>
                    </>
                  )}
                </div>
              ),
            }))}
          />
        </div>
      )}

      {/* ABA 2: MOVIMENTAÇÃO MENSAL DA RECEITA (18.178 / 18.302) */}
      {activeTab === "MENSAL" && (
        <div className="space-y-3">
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
                  Imprimir Mapa Mensal
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => alert("Exportando movimentação mensal da receita orçamentária (XLS)...")}
                  className="h-8 text-xs flex items-center gap-1.5"
                >
                  <Download className="size-3.5 text-slate-600" />
                  Exportar XLS
                </Button>
              </div>
            }
          >
            <OperationalTable
              columns={columnsMonthly}
              preferenceId="financeiro-receitas-mensal"
              caption="Movimentação Mensal da Receita Orçamentária (Jan a Dez)"
              rows={monthlyData.map((row) => ({
                id: row.id,
                label: `${row.code} - ${row.name}`,
                values: {
                  code: row.code,
                  name: row.name,
                  source: row.sourceCode,
                  predicted: currency.format(row.predictedYear),
                  jan: currency.format(row.months[0]),
                  fev: currency.format(row.months[1]),
                  mar: currency.format(row.months[2]),
                  abr: currency.format(row.months[3]),
                  mai: currency.format(row.months[4]),
                  jun: currency.format(row.months[5]),
                  jul: currency.format(row.months[6]),
                  ago: currency.format(row.months[7]),
                  set: currency.format(row.months[8]),
                  out: currency.format(row.months[9]),
                  nov: currency.format(row.months[10]),
                  dez: currency.format(row.months[11]),
                  total: currency.format(row.totalCollected),
                  pct: `${row.realizedPercent.toFixed(1)}%`,
                },
              }))}
            />
          </OperationalListFrame>
        </div>
      )}

      {/* ABA 3: CLASSIFICADOR DA RECEITA EM 8 NÍVEIS (18.74) */}
      {activeTab === "ESTRUTURA" && (
        <div className="space-y-3">
          <div className="bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-md text-xs text-indigo-900">
            <strong>Estrutura Padronizada SOF/STN (18.74):</strong> Categoria Econômica (1º dígito), Origem (2º dígito),
            Espécie (3º dígito), Rubrica (4º dígito), Alínea (5º e 6º dígitos), Sub-Alínea (7º dígito), Item (8º e 9º dígitos)
            e Sub-Item (10º e 11º dígitos).
          </div>

          <OperationalListFrame pagination={null}>
            <OperationalTable
              columns={columnsStructure}
              preferenceId="financeiro-receitas-estrutura"
              caption="Classificador da Receita Orçamentária (8 Níveis STN)"
              rows={structures.map((s) => ({
                id: s.id,
                label: s.fullCode,
                values: {
                  fullCode: s.fullCode,
                  cat: s.categoriaEconomica,
                  orig: s.origem,
                  esp: s.especie,
                  rub: s.rubrica,
                  ali: s.alinea,
                  subAli: s.subAlinea,
                  item: s.item,
                  subItem: s.subItem,
                  description: s.description,
                  status: s.status,
                },
              }))}
            />
          </OperationalListFrame>
        </div>
      )}

      {/* Modal de Lançar/Arrecadar Receita */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Registrar Receita</DialogTitle>
          </DialogHeader>
          <Card size="sm" className="border-0 rounded-md shadow-none">
            <CardHeader className="border-b pb-2">
              <CardTitle>Registro de Receita Orçamentária</CardTitle>
              <CardDescription>Lance ou arrecade valores com a fonte e conta bancária compatíveis.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant={mode === "ARRECADAR" ? "default" : "outline"}
                  onClick={() => setMode("ARRECADAR")}
                >
                  Arrecadar agora
                </Button>
                <Button
                  size="sm"
                  variant={mode === "LANCAR" ? "default" : "outline"}
                  onClick={() => setMode("LANCAR")}
                >
                  Lançamento prévio
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(event) => setForm({ ...form, date: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Natureza</Label>
                  <Select
                    items={revenueNatures.map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` }))}
                    value={form.revenueNatureId}
                    onValueChange={(revenueNatureId) => {
                      if (revenueNatureId) setForm({ ...form, revenueNatureId });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] !w-auto min-w-[var(--anchor-width)]">
                      {revenueNatures.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.code} - {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fonte</Label>
                  <Select
                    items={resourceSources.map((item) => ({ value: item.id, label: `${item.code} - ${item.name}` }))}
                    value={form.resourceSourceId}
                    onValueChange={(resourceSourceId) => {
                      if (resourceSourceId) setForm({ ...form, resourceSourceId, bankAccountId: "" });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] !w-auto min-w-[var(--anchor-width)]">
                      {resourceSources.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.code} - {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Classificação</Label>
                  <Select
                    value={form.classification}
                    onValueChange={(classification) =>
                      setForm({ ...form, classification: classification as Revenue["classification"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(classificationLabel).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {mode === "LANCAR" && (
                  <div>
                    <Label>Unidade gestora</Label>
                    <Select
                      value={form.budgetUnitId}
                      onValueChange={(budgetUnitId) => {
                        if (budgetUnitId) setForm({ ...form, budgetUnitId });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {budgetUnits.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.governmentEntityName} — {unit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Valor</Label>
                  <MoneyInput value={form.value} onChange={(value) => setForm({ ...form, value })} />
                </div>
                {mode === "ARRECADAR" && (
                  <div>
                    <Label>Conta bancária compatível</Label>
                    <Select
                      value={form.bankAccountId}
                      onValueChange={(bankAccountId) => {
                        if (bankAccountId) setForm({ ...form, bankAccountId });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {compatibleAccounts.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.bankName} {item.agency}/{item.accountNumber}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div>
                <Label>Histórico</Label>
                <Input value={form.history} onChange={(event) => setForm({ ...form, history: event.target.value })} />
              </div>
              <Button disabled={pending} onClick={submit}>
                {pending ? "Registrando..." : mode === "LANCAR" ? "Lançar receita" : "Arrecadar receita"}
              </Button>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      {/* Modal de Cadastro da Classificação da Receita (8 Níveis) (18.74) */}
      <Dialog open={structureModalOpen} onOpenChange={setStructureModalOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Layers className="size-5 text-indigo-700" />
              Cadastrar Descrição da Receita (8 Níveis STN)
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Defina os 8 níveis padronizados: Categoria Econômica, Origem, Espécie, Rubrica, Alínea, Sub-Alínea, Item e Sub-Item.
            </DialogDescription>
          </DialogHeader>

          {feedback && (
            <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs">
              <CheckCircle2 className="size-4 text-emerald-600" />
              {feedback}
            </div>
          )}

          <form onSubmit={handleSaveStructure} className="space-y-3 pt-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs font-semibold">1. Categoria</Label>
                  <Select
                    value={structureForm.categoriaEconomica}
                    onValueChange={(val) => setStructureForm({ ...structureForm, categoriaEconomica: val || "" })}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - Receitas Correntes</SelectItem>
                      <SelectItem value="2">2 - Receitas de Capital</SelectItem>
                      <SelectItem value="7">7 - Receitas Correntes Intra</SelectItem>
                      <SelectItem value="8">8 - Receitas de Capital Intra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">2. Origem</Label>
                  <Input
                    placeholder="1 dígito"
                    maxLength={1}
                    value={structureForm.origem}
                    onChange={(e) => setStructureForm({ ...structureForm, origem: e.target.value })}
                    className="h-8 text-xs font-mono mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">3. Espécie</Label>
                  <Input
                    placeholder="1 dígito"
                    maxLength={1}
                    value={structureForm.especie}
                    onChange={(e) => setStructureForm({ ...structureForm, especie: e.target.value })}
                    className="h-8 text-xs font-mono mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">4. Rubrica</Label>
                  <Input
                    placeholder="1 dígito"
                    maxLength={1}
                    value={structureForm.rubrica}
                    onChange={(e) => setStructureForm({ ...structureForm, rubrica: e.target.value })}
                    className="h-8 text-xs font-mono mt-1"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-xs font-semibold">5. Alínea</Label>
                  <Input
                    placeholder="2 dígitos"
                    maxLength={2}
                    value={structureForm.alinea}
                    onChange={(e) => setStructureForm({ ...structureForm, alinea: e.target.value })}
                    className="h-8 text-xs font-mono mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">6. Sub-Alínea</Label>
                  <Input
                    placeholder="1 dígito"
                    maxLength={1}
                    value={structureForm.subAlinea}
                    onChange={(e) => setStructureForm({ ...structureForm, subAlinea: e.target.value })}
                    className="h-8 text-xs font-mono mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">7. Item</Label>
                  <Input
                    placeholder="2 dígitos"
                    maxLength={2}
                    value={structureForm.item}
                    onChange={(e) => setStructureForm({ ...structureForm, item: e.target.value })}
                    className="h-8 text-xs font-mono mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">8. Sub-Item</Label>
                  <Input
                    placeholder="2 dígitos"
                    maxLength={2}
                    value={structureForm.subItem}
                    onChange={(e) => setStructureForm({ ...structureForm, subItem: e.target.value })}
                    className="h-8 text-xs font-mono mt-1"
                    required
                  />
                </div>
              </div>

              <div className="bg-white border border-slate-200 p-2.5 rounded text-xs flex items-center justify-between font-mono">
                <span className="text-slate-500 font-sans font-semibold">Código Estruturado Resultante:</span>
                <strong className="text-indigo-800 text-sm">
                  {`${structureForm.categoriaEconomica}.${structureForm.origem}.${structureForm.especie}.${structureForm.rubrica}.${structureForm.alinea}.${structureForm.subAlinea}.${structureForm.item}.${structureForm.subItem}`}
                </strong>
              </div>

              <div>
                <Label className="text-xs font-semibold">Descrição Padronizada da Receita</Label>
                <Input
                  placeholder="ex: IPTU - Imposto Predial e Territorial Urbano - Ordinário"
                  value={structureForm.description}
                  onChange={(e) => setStructureForm({ ...structureForm, description: e.target.value })}
                  className="h-8 text-xs mt-1"
                  required
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setStructureModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" className="bg-indigo-700 hover:bg-indigo-800 text-white">
                Salvar Classificação
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
