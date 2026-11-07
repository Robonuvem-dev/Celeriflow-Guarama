"use client";

import { useState } from "react";
import { BookOpen, Filter, Download, Printer, Search, Building } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumn } from "@/components/app-ui/operational/operational-columns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import styles from "@/components/app-ui/operational/operational.module.css";

type PcaspEntry = {
  id: string;
  date: string;
  transactionNumber: string;
  pcaspCode: string;
  pcaspName: string;
  currentAccount: string;
  history: string;
  debit: number;
  credit: number;
  balance: number;
};

const currency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

const columns = [
  operationalColumn("date", "Data", 85, 100),
  operationalColumn("transaction", "Lançamento", 95, 120, { type: "identifier" }),
  operationalColumn("account", "Conta PCASP", 180, 260),
  operationalColumn("currentAccount", "Conta Corrente Vinculada", 160, 240, { type: "identifier" }),
  operationalColumn("history", "Histórico Contábil", 200, 320),
  operationalColumn("debit", "Débito (R$)", 105, 130, { type: "text", align: "right" }),
  operationalColumn("credit", "Crédito (R$)", 105, 130, { type: "text", align: "right" }),
  operationalColumn("balance", "Saldo Atual (R$)", 115, 140, { type: "text", align: "right" }),
];

export default function PcaspMovimentacaoClient() {
  const [currentAccountFilter, setCurrentAccountFilter] = useState("ALL");
  const [pcaspClassFilter, setPcaspClassFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const mockEntries: PcaspEntry[] = [
    {
      id: "ent-1",
      date: "03/11/2026",
      transactionNumber: "LAN-2026-0842",
      pcaspCode: "1.1.1.1.1.01.00",
      pcaspName: "Caixa e Equivalentes de Caixa em Moeda Nacional",
      currentAccount: "Banco do Brasil - Ag. 1245 - C/C 15.420-1 (FPM)",
      history: "Arrecadação de cota-parte do Fundo de Participação dos Municípios (FPM 1º Decêndio)",
      debit: 1450250.32,
      credit: 0,
      balance: 4890250.32,
    },
    {
      id: "ent-2",
      date: "04/11/2026",
      transactionNumber: "LAN-2026-0843",
      pcaspCode: "1.1.1.1.1.02.00",
      pcaspName: "Bancos Conta Movimento - Recursos Vinculados",
      currentAccount: "Caixa Econômica - Ag. 0820 - C/C 8.900-5 (FUNDEB)",
      history: "Crédito de repasse mensal do FUNDEB para valorização do magistério",
      debit: 820100.0,
      credit: 0,
      balance: 3120100.0,
    },
    {
      id: "ent-3",
      date: "04/11/2026",
      transactionNumber: "LAN-2026-0844",
      pcaspCode: "2.1.1.1.1.01.00",
      pcaspName: "Pessoal a Pagar - Vencimentos e Vantagens",
      currentAccount: "Folha de Pagamento - Competência Outubro/2026",
      history: "Pagamento da folha salarial dos servidores ativos da Secretaria de Educação",
      debit: 0,
      credit: 680450.2,
      balance: -680450.2,
    },
    {
      id: "ent-4",
      date: "05/11/2026",
      transactionNumber: "LAN-2026-0845",
      pcaspCode: "1.1.1.1.1.01.00",
      pcaspName: "Caixa e Equivalentes de Caixa em Moeda Nacional",
      currentAccount: "Banco do Brasil - Ag. 1245 - C/C 15.420-1 (FPM)",
      history: "Liquidação de despesa com fornecedores de merenda escolar (Contrato 014/2026)",
      debit: 0,
      credit: 125400.0,
      balance: 4764850.32,
    },
    {
      id: "ent-5",
      date: "05/11/2026",
      transactionNumber: "LAN-2026-0846",
      pcaspCode: "2.2.1.1.1.01.00",
      pcaspName: "Empréstimos e Financiamentos Internos a Pagar",
      currentAccount: "Contrato CEF FINISA-0542/2023",
      history: "Amortização de parcela mensal da operação de crédito de infraestrutura urbana",
      debit: 125000.0,
      credit: 0,
      balance: 11250000.0,
    },
  ];

  const currentAccounts = [...new Set(mockEntries.map((e) => e.currentAccount))];

  const filtered = mockEntries.filter((item) => {
    const matchesSearch =
      item.history.toLowerCase().includes(search.toLowerCase()) ||
      item.pcaspCode.includes(search) ||
      item.pcaspName.toLowerCase().includes(search.toLowerCase()) ||
      item.currentAccount.toLowerCase().includes(search.toLowerCase());
    const matchesAccount =
      currentAccountFilter === "ALL" || item.currentAccount === currentAccountFilter;
    const matchesClass =
      pcaspClassFilter === "ALL" || item.pcaspCode.startsWith(pcaspClassFilter);
    return matchesSearch && matchesAccount && matchesClass;
  });

  const totalDebits = filtered.reduce((acc, cur) => acc + cur.debit, 0);
  const totalCredits = filtered.reduce((acc, cur) => acc + cur.credit, 0);

  return (
    <PageFrame className="flex h-full min-h-0 flex-col space-y-3">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Movimentação Contábil PCASP com Filtro por Conta Corrente"
          icon={<BookOpen className="size-4 text-emerald-700" />}
        />
        <Link
          href="/financeiro/contabilidade"
          className="text-xs text-emerald-800 underline hover:text-emerald-950 font-medium"
        >
          ← Voltar à Contabilidade
        </Link>
      </div>

      {/* Faixa de Filtros Avançados de Conta Corrente e Classe PCASP */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <span className="text-xs font-bold text-slate-700 block mb-1">Filtrar por Conta Corrente:</span>
            <Select value={currentAccountFilter} onValueChange={(val) => setCurrentAccountFilter(val || "ALL")}>
              <SelectTrigger className="h-8 text-xs w-[320px] bg-slate-50 font-medium">
                <SelectValue placeholder="Selecione a Conta Corrente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as Contas Correntes</SelectItem>
                {currentAccounts.map((acc) => (
                  <SelectItem key={acc} value={acc}>
                    {acc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <span className="text-xs font-bold text-slate-700 block mb-1">Classe PCASP:</span>
            <Select value={pcaspClassFilter} onValueChange={(val) => setPcaspClassFilter(val || "ALL")}>
              <SelectTrigger className="h-8 text-xs w-[220px] bg-slate-50 font-medium">
                <SelectValue placeholder="Classe PCASP" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as Classes (1 a 8)</SelectItem>
                <SelectItem value="1">Classe 1 - Ativo</SelectItem>
                <SelectItem value="2">Classe 2 - Passivo</SelectItem>
                <SelectItem value="3">Classe 3 - VPD (Variação Diminutiva)</SelectItem>
                <SelectItem value="4">Classe 4 - VPA (Variação Aumentativa)</SelectItem>
                <SelectItem value="5">Classe 5 - Controle Orçamentário</SelectItem>
                <SelectItem value="6">Classe 6 - Execução do Orçamento</SelectItem>
                <SelectItem value="7">Classe 7 - Controles Devedores</SelectItem>
                <SelectItem value="8">Classe 8 - Controles Credores</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="h-8 text-xs flex items-center gap-1.5"
          >
            <Printer className="size-3.5 text-slate-600" />
            Imprimir Razão
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => alert("Exportando movimentação PCASP da conta corrente selecionada...")}
            className="h-8 text-xs flex items-center gap-1.5"
          >
            <Download className="size-3.5 text-slate-600" />
            Exportar XLS
          </Button>
        </div>
      </div>

      {/* Totais de Débito e Crédito da seleção */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Total de Movimentos a Débito</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-emerald-700">{currency(totalDebits)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Entradas e aplicações debitadas</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Total de Movimentos a Crédito</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-rose-700">{currency(totalCredits)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Saídas e obrigações creditadas</p>
          </CardContent>
        </Card>
        <Card className="shadow-none border-slate-200">
          <CardHeader className="pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium text-slate-500">Lançamentos no Período</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <p className="text-xl font-bold text-slate-800">{filtered.length} partidas</p>
            <p className="text-xs text-muted-foreground mt-0.5">Filtradas por conta corrente e classe</p>
          </CardContent>
        </Card>
      </div>

      <OperationalListFrame pagination={null}
        toolbar={
          <div className={styles.searchForm}>
            <input
              type="search"
              placeholder="Buscar por código PCASP, nome, conta corrente ou histórico..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        }
      >
        <OperationalTable
          columns={columns}
          preferenceId="contabilidade-pcasp-movimentacao"
          caption="Razão e Extrato Contábil PCASP por Conta Corrente"
          emptyMessage="Nenhum lançamento encontrado para os filtros selecionados."
          rows={filtered.map((item) => ({
            id: item.id,
            label: `${item.pcaspCode} - ${item.history}`,
            values: {
              date: item.date,
              transaction: item.transactionNumber,
              account: `${item.pcaspCode} · ${item.pcaspName}`,
              currentAccount: item.currentAccount,
              history: item.history,
              debit: item.debit ? currency(item.debit) : "—",
              credit: item.credit ? currency(item.credit) : "—",
              balance: currency(item.balance),
            },
          }))}
        />
      </OperationalListFrame>
    </PageFrame>
  );
}
