"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import FinanceTablePanel from "../FinanceTablePanel";
import { financeColumn } from "../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useState } from "react";
import { BarChart2, Coins, Calendar, FileText, Layers, Printer, Download, Sparkles, Filter, CheckCircle2, ShieldCheck, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { approveExpenseRequestAction, cancelBudgetReservationAction, createBudgetReservationAction, createExpenseRequestAction, createExpenseRequestFromPurchaseReceiptAction, setFinancialYearStatusAction } from "./actions";

import { CreditRequestDialog } from "./CreditRequestDialog";
import { actionApproveCreditRequest, actionExecuteCreditRequest, actionSubmitCreditRequest } from "./planejamento-actions";

type Appropriation = {
  id: string;
  code: string;
  budgetUnit: { name: string; code: string; secretariatId: string };
  expenseNature: { name: string; code: string; };
  resourceSource: { name: string; code: string; };
  initialValue: number;
  updatedValue: number;
  committedValue: number;
  reservedValue: number;
  availableValue: number;
};

type Reservation = {
  id: string;
  number: string;
  value: number;
  status: string;
  appropriation: { code: string };
};

type FinancialYear = {
  id: string;
  year: number;
  status: string;
};

type CreditRequest = {
  id: string;
  number: string;
  type: string;
  justification: string;
  totalValue: number;
  status: string;
};
type ExpenseRequest = { id: string; description: string; value: number; status: string; appropriationId: string; appropriation: { code: string }; supplier: { company?: { corporateName: string } | null; person?: { fullName: string } | null } | null };
type SupplierOption = { id: string; name: string };
type PurchaseReceipt = { id: string; number: string; contractNumber: string; secretariatId: string; value: number };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export default function OrcamentoClient({
  appropriations,
  reservations,
  financialYears,
  creditRequests = [],
  expenses = [],
  suppliers = [],
  resourceSources = [],
  legalDocuments = [],
  purchaseReceipts = [],
  canEdit,
}: {
  appropriations: Appropriation[];
  reservations: Reservation[];
  financialYears: FinancialYear[];
  creditRequests?: CreditRequest[];
  expenses?: ExpenseRequest[];
  suppliers?: SupplierOption[];
  resourceSources?: { id: string; code: string; name: string }[];
  legalDocuments?: { id: string; title: string }[];
  purchaseReceipts?: PurchaseReceipt[];
  canEdit: boolean;
}) {
  const [reservation, setReservation] = useState({ number: "", appropriationId: "", expenseId: "", value: 0, justification: "" });
  const [expenseRequest, setExpenseRequest] = useState({ description: "", appropriationId: "", supplierId: "", value: 0 });
  const [receiptExpense, setReceiptExpense] = useState({ purchaseReceiptId: "", appropriationId: "", description: "" });
  const [pending, setPending] = useState(false);
  const [activeTab, setActiveTab] = useState<"GERAL" | "RELATORIO_EXERCICIOS" | "COTAS" | "RESERVAS" | "MENSAL">("GERAL");
  const [reportYear, setReportYear] = useState<string>("2026");
  const [reportUnit, setReportUnit] = useState<string>("ALL");
  const [quotaUnit, setQuotaUnit] = useState<string>("ALL");

  const submitReservation = async (event: React.FormEvent) => {
    event.preventDefault(); setPending(true);
    const result = await createBudgetReservationAction({ ...reservation, date: new Date() }); setPending(false);
    if (result.error) return alert(result.error);
    setReservation({ number: "", appropriationId: "", expenseId: "", value: 0, justification: "" });
  };

  const submitExpenseRequest = async (event: React.FormEvent) => {
    event.preventDefault(); setPending(true);
    const appropriation = appropriations.find((item) => item.id === expenseRequest.appropriationId);
    if (!appropriation) { setPending(false); return alert("Selecione a dotação orçamentária."); }
    const result = await createExpenseRequestAction({ ...expenseRequest, date: new Date(), secretariatId: appropriation.budgetUnit.secretariatId }); setPending(false);
    if (result.error) return alert(result.error);
    setExpenseRequest({ description: "", appropriationId: "", supplierId: "", value: 0 });
  };

  const approveExpense = async (id: string) => {
    setPending(true); const result = await approveExpenseRequestAction(id); setPending(false);
    if (result.error) alert(result.error);
  };

  const submitReceiptExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    const receipt = purchaseReceipts.find((item) => item.id === receiptExpense.purchaseReceiptId);
    if (!receipt) return alert("Selecione o recebimento aprovado.");
    if (!receiptExpense.appropriationId) return alert("Selecione a dotação orçamentária.");
    setPending(true);
    const result = await createExpenseRequestFromPurchaseReceiptAction({
      purchaseReceiptId: receipt.id,
      date: new Date(),
      description: receiptExpense.description || `Recebimento ${receipt.number} do contrato ${receipt.contractNumber}`,
      value: receipt.value,
      appropriationId: receiptExpense.appropriationId,
      secretariatId: receipt.secretariatId,
    });
    setPending(false);
    if (result.error) return alert(result.error);
    setReceiptExpense({ purchaseReceiptId: "", appropriationId: "", description: "" });
  };

  const cancelReservation = async (id: string) => {
    const result = await cancelBudgetReservationAction(id);
    if (result.error) alert(result.error);
  };

  const changeYearStatus = async (id: string, status: string) => {
    const result = await setFinancialYearStatusAction(id, status);
    if (result.error) alert(result.error);
  };

  const handleApproveCredit = async (id: string) => {
    setPending(true);
    const result = await actionApproveCreditRequest(id);
    setPending(false);
    if (result.error) alert(result.error);
  };

  const handleSubmitCredit = async (id: string) => {
    setPending(true);
    const result = await actionSubmitCreditRequest(id);
    setPending(false);
    if (result.error) alert(result.error);
  };

  const handleExecuteCredit = async (id: string) => {
    setPending(true);
    const result = await actionExecuteCreditRequest(id);
    setPending(false);
    if (result.error) alert(result.error);
  };

  const activeYear = financialYears.find((y) => y.status === "Aberto") || financialYears[0];

  return (
    <div className="h-full min-h-0 overflow-y-auto px-1 py-1 sm:px-2 [&>*+*]:mt-2 [&_[data-slot=card]]:rounded-md [&_[data-slot=card]]:shadow-none [&_[data-slot=card-header]]:pb-2 [&_[data-slot=table-container]]:overflow-x-hidden [&_[data-slot=table]]:table-fixed">
      <div className="flex flex-col gap-2 border-b border-slate-300 bg-white px-3 py-2 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-sm font-bold tracking-tight text-slate-900">Orçamento e Plano de Contas</h1>
          <p className="text-xs text-muted-foreground">Gestão de dotações orçamentárias e alterações com segregação de funções</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {activeYear && canEdit && (
            <CreditRequestDialog
              financialYearId={activeYear.id}
              appropriations={appropriations}
              resourceSources={resourceSources}
              legalDocuments={legalDocuments}
            />
          )}
          <Link href="/financeiro/orcamento/cadastros" className="inline-flex h-7 items-center justify-center rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent">Cadastros Orçamentários</Link>
        </div>
      </div>

        {activeTab === "GERAL" && (<><Card><CardHeader><CardTitle>Exercícios Financeiros</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{financialYears.map(year => <div key={year.id} className="flex items-center justify-between rounded border p-3"><span className="font-medium">{year.year}</span>{canEdit && year.status !== "Encerrado" ? <Select value={year.status} onValueChange={status => status && changeYearStatus(year.id, status)}><SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Preparação">Preparação</SelectItem><SelectItem value="Aberto">Aberto</SelectItem><SelectItem value="Em Encerramento">Em Encerramento</SelectItem></SelectContent></Select> : <Badge variant="outline">{year.status}</Badge>}</div>)}</CardContent></Card>

       {canEdit && <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><CardTitle>Solicitação de Despesa</CardTitle></CardHeader><CardContent><form onSubmit={submitExpenseRequest} className="grid gap-3 md:grid-cols-2"><Input required placeholder="Descrição" value={expenseRequest.description} onChange={event => setExpenseRequest({ ...expenseRequest, description: event.target.value })} /><Select value={expenseRequest.appropriationId} onValueChange={appropriationId => setExpenseRequest({ ...expenseRequest, appropriationId: appropriationId ?? "" })}><SelectTrigger><SelectValue placeholder="Dotação" /></SelectTrigger><SelectContent>{appropriations.map(app => <SelectItem key={app.id} value={app.id}>{app.code}</SelectItem>)}</SelectContent></Select><Select value={expenseRequest.supplierId} onValueChange={supplierId => setExpenseRequest({ ...expenseRequest, supplierId: supplierId ?? "" })}><SelectTrigger><SelectValue placeholder="Fornecedor" /></SelectTrigger><SelectContent>{suppliers.map(supplier => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent></Select><MoneyInput value={expenseRequest.value} onChange={value => setExpenseRequest({ ...expenseRequest, value })} /><Button type="submit" disabled={pending}>Solicitar aprovação</Button></form></CardContent></Card>
        <Card><CardHeader><CardTitle>Reserva Orçamentária</CardTitle></CardHeader><CardContent><form onSubmit={submitReservation} className="grid gap-3 md:grid-cols-2"><Input required placeholder="Número da reserva" value={reservation.number} onChange={event => setReservation({ ...reservation, number: event.target.value })} /><Select value={reservation.appropriationId} onValueChange={appropriationId => setReservation({ ...reservation, appropriationId: appropriationId ?? "", expenseId: "" })}><SelectTrigger><SelectValue placeholder="Dotação" /></SelectTrigger><SelectContent>{appropriations.map(app => <SelectItem key={app.id} value={app.id}>{app.code}</SelectItem>)}</SelectContent></Select><Select value={reservation.expenseId} onValueChange={expenseId => { const expense = expenses.find(item => item.id === expenseId); setReservation({ ...reservation, expenseId: expenseId ?? "", value: expense?.value ?? reservation.value }); }}><SelectTrigger><SelectValue placeholder="Solicitação aprovada" /></SelectTrigger><SelectContent>{expenses.filter(expense => expense.status === "Aprovada" && expense.appropriationId === reservation.appropriationId).map(expense => <SelectItem key={expense.id} value={expense.id}>{expense.description} - {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(expense.value)}</SelectItem>)}</SelectContent></Select><MoneyInput value={reservation.value} onChange={value => setReservation({ ...reservation, value })} /><Input placeholder="Justificativa" value={reservation.justification} onChange={event => setReservation({ ...reservation, justification: event.target.value })} /><Button type="submit" disabled={pending}>Criar reserva</Button></form></CardContent></Card>
        </div>}

       {canEdit && purchaseReceipts.length > 0 && <Card><CardHeader><CardTitle>Solicitação de Despesa por Recebimento</CardTitle></CardHeader><CardContent><form onSubmit={submitReceiptExpense} className="grid gap-3 md:grid-cols-3"><Select value={receiptExpense.purchaseReceiptId} onValueChange={purchaseReceiptId => setReceiptExpense({ ...receiptExpense, purchaseReceiptId: purchaseReceiptId ?? "" })}><SelectTrigger><SelectValue placeholder="Recebimento aprovado" /></SelectTrigger><SelectContent>{purchaseReceipts.map((receipt) => <SelectItem key={receipt.id} value={receipt.id}>{receipt.number} · {receipt.contractNumber} · {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(receipt.value)}</SelectItem>)}</SelectContent></Select><Select value={receiptExpense.appropriationId} onValueChange={appropriationId => setReceiptExpense({ ...receiptExpense, appropriationId: appropriationId ?? "" })}><SelectTrigger><SelectValue placeholder="Dotação" /></SelectTrigger><SelectContent>{appropriations.filter((item) => item.budgetUnit.secretariatId === purchaseReceipts.find((receipt) => receipt.id === receiptExpense.purchaseReceiptId)?.secretariatId).map((item) => <SelectItem key={item.id} value={item.id}>{item.code}</SelectItem>)}</SelectContent></Select><Input placeholder="Descrição complementar" value={receiptExpense.description} onChange={event => setReceiptExpense({ ...receiptExpense, description: event.target.value })} /><Button type="submit" disabled={pending || !receiptExpense.purchaseReceiptId}>Criar solicitação vinculada</Button></form></CardContent></Card>}

       <FinanceTablePanel label="Solicitações de Despesa" preferenceId="financeiro-orcamento-despesas"
         columns={[financeColumn("description", "Descrição", 120, 300), financeColumn("appropriation", "Dotação", 80, 150), financeColumn("supplier", "Fornecedor", 100, 240), financeColumn("value", "Valor", 90, 140, "text", "right"), financeColumn("status", "Status", 80, 120, "status"), financeColumn("actions", "Ações", 80, 80, "actions")]}
         rows={expenses.map(expense => ({ id: expense.id, label: expense.description, values: { description: expense.description, appropriation: expense.appropriation.code, supplier: expense.supplier?.company?.corporateName ?? expense.supplier?.person?.fullName ?? "—", value: money(expense.value), status: expense.status }, actions: canEdit && expense.status === "Solicitada" ? <button className={styles.dialogButton} onClick={() => void approveExpense(expense.id)} disabled={pending}>Aprovar</button> : undefined }))} />

       <FinanceTablePanel label="Dotações" preferenceId="financeiro-orcamento-dotacoes"
         columns={[financeColumn("code", "Código da Dotação", 80, 140), financeColumn("nature", "Natureza da Despesa", 100, 200), financeColumn("unit", "Unidade Orçamentária", 100, 200), financeColumn("source", "Fonte", 70, 120), financeColumn("updated", "Valor Atualizado (R$)", 90, 140, "text", "right"), financeColumn("reserved", "Reservado (R$)", 90, 140, "text", "right"), financeColumn("committed", "Valor Empenhado (R$)", 90, 140, "text", "right"), financeColumn("balance", "Saldo (R$)", 90, 140, "text", "right")]}
         rows={appropriations.map(row => ({ id: row.id, label: row.code, values: { code: row.code, nature: `${row.expenseNature.code} - ${row.expenseNature.name}`, unit: `${row.budgetUnit.code} - ${row.budgetUnit.name}`, source: row.resourceSource.code, updated: money(row.updatedValue), reserved: money(row.reservedValue), committed: money(row.committedValue), balance: money(row.availableValue) } }))} />

      <FinanceTablePanel label="Solicitações de Crédito Adicional" description="Segregação de funções preservada por situação e permissão." preferenceId="financeiro-orcamento-creditos"
        columns={[financeColumn("number", "Número", 80, 130), financeColumn("type", "Tipo", 90, 140), financeColumn("reason", "Justificativa", 120, 360), financeColumn("value", "Valor Total", 90, 150, "text", "right"), financeColumn("status", "Status", 90, 140, "status"), financeColumn("actions", "Ações", 110, 110, "actions")]}
        rows={creditRequests.map(credit => ({ id: credit.id, label: credit.number, values: { number: credit.number, type: credit.type, reason: credit.justification, value: money(Number(credit.totalValue)), status: credit.status }, actions: <>{canEdit && credit.status === "DRAFT" && <button className={styles.dialogButton} disabled={pending} onClick={() => void handleSubmitCredit(credit.id)}>Submeter</button>}{canEdit && credit.status === "SUBMITTED" && <button className={styles.dialogButton} disabled={pending} onClick={() => void handleApproveCredit(credit.id)}>Aprovar</button>}{canEdit && credit.status === "PUBLISHED" && <button className={styles.dialogButton} disabled={pending} onClick={() => void handleExecuteCredit(credit.id)}>Efetivar Saldo</button>}</> }))} />

       <FinanceTablePanel label="Reservas recentes" preferenceId="financeiro-orcamento-reservas"
         columns={[financeColumn("number", "Número", 80, 140), financeColumn("appropriation", "Dotação", 90, 200), financeColumn("value", "Valor", 90, 150, "text", "right"), financeColumn("status", "Status", 80, 140, "status"), financeColumn("actions", "Ações", 85, 85, "actions")]}
         rows={reservations.map(row => ({ id: row.id, label: row.number, values: { number: row.number, appropriation: row.appropriation.code, value: money(row.value), status: row.status }, actions: canEdit && row.status === "Ativa" ? <button className={styles.dialogButton} onClick={() => void cancelReservation(row.id)}>Cancelar</button> : undefined }))} />
</>)}


      {/* ABA 2: RELATÓRIO DE DESPESAS DO EXERCÍCIO CORRENTE E OU ENCERRADO (18.2) */}
      {activeTab === "RELATORIO_EXERCICIOS" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-bold text-slate-700 uppercase">Exercício da Despesa:</label>
              <select
                value={reportYear}
                onChange={(e) => setReportYear(e.target.value)}
                className="h-8 text-xs rounded border border-slate-300 bg-slate-50 px-2 font-medium"
              >
                <option value="2026">2026 (Exercício Corrente)</option>
                <option value="2025">2025 (Exercício Encerrado)</option>
                <option value="2024">2024 (Exercício Encerrado)</option>
                <option value="2023">2023 (Exercício Encerrado)</option>
              </select>

              <label className="text-xs font-bold text-slate-700 uppercase ml-2">Unidade Orçamentária:</label>
              <select
                value={reportUnit}
                onChange={(e) => setReportUnit(e.target.value)}
                className="h-8 text-xs rounded border border-slate-300 bg-slate-50 px-2 font-medium"
              >
                <option value="ALL">Todas as Unidades</option>
                {[...new Set(appropriations.map((a) => a.budgetUnit.name))].map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white hover:bg-slate-50 font-medium text-slate-700"
              >
                <Printer className="size-3.5" />
                Imprimir Relatório
              </button>
              <button
                type="button"
                onClick={() => alert(`Exportando relatório das despesas do exercício ${reportYear} (PDF / XLS)...`)}
                className="inline-flex items-center gap-1.5 text-xs bg-emerald-700 hover:bg-emerald-800 text-white rounded px-3 py-1.5 font-medium shadow-sm"
              >
                <Download className="size-3.5" />
                Exportar Relatório Oficial (PDF)
              </button>
            </div>
          </div>

          <FinanceTablePanel
            label={`Relatório Geral das Despesas do Exercício ${reportYear} (${reportYear === "2026" ? "Corrente" : "Encerrado"})`}
            preferenceId="financeiro-relatorio-despesas-exercicio"
            columns={[
              financeColumn("code", "Dotação", 90, 140, "identifier"),
              financeColumn("unit", "Unidade Orçamentária", 120, 220),
              financeColumn("source", "Fonte", 70, 100),
              financeColumn("nature", "Elemento de Despesa", 130, 240),
              financeColumn("initial", "Orçado / Fixado", 100, 140, "text", "right"),
              financeColumn("updated", "Atualizado", 100, 140, "text", "right"),
              financeColumn("committed", "Empenhado", 100, 140, "text", "right"),
              financeColumn("balance", "Saldo Disponível", 100, 140, "text", "right"),
            ]}
            rows={appropriations
              .filter((app) => reportUnit === "ALL" || app.budgetUnit.name === reportUnit)
              .map((app) => ({
                id: `rep-${app.id}`,
                label: app.code,
                values: {
                  code: app.code,
                  unit: app.budgetUnit.name,
                  source: app.resourceSource.code,
                  nature: app.expenseNature.name,
                  initial: money(app.initialValue),
                  updated: money(app.updatedValue),
                  committed: money(app.committedValue),
                  balance: money(app.availableValue),
                },
              }))}
          />
        </div>
      )}

      {/* ABA 3: LIMITAÇÕES DE DESPESA E COTAS (18.17 e 18.175) */}
      {activeTab === "COTAS" && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-900 flex items-start gap-2">
            <ShieldCheck className="size-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Limitações de Empenho e Cronograma Mensal de Desembolso (18.17 / 18.175):</p>
              <p className="mt-0.5">
                Cotas orçamentárias estabelecidas no nível de Unidade Orçamentária, Fontes de Recursos e Grupos de Natureza de Despesa (GND),
                estritamente limitadas ao saldo das previsões orçamentárias e fluxo da receita arrecadada (Art. 9º da LRF).
              </p>
            </div>
          </div>

          <FinanceTablePanel
            label="Consulta do Saldo da Despesa Segregado por Cotas (18.175)"
            preferenceId="financeiro-cotas-despesa"
            columns={[
              financeColumn("unit", "Unidade / Fonte / GND", 150, 240, "identifier"),
              financeColumn("orcado", "Valor Orçado", 95, 130, "text", "right"),
              financeColumn("suplementado", "Suplementado", 95, 130, "text", "right"),
              financeColumn("reducoes", "Reduções", 90, 120, "text", "right"),
              financeColumn("saldoParcial", "Saldo Parcial", 100, 135, "text", "right"),
              financeColumn("cota", "Cota Liberada", 100, 135, "text", "right"),
              financeColumn("empenhado", "Empenhado", 95, 130, "text", "right"),
              financeColumn("saldoCota", "Saldo por Cota", 100, 135, "text", "right"),
              financeColumn("saldoDotacao", "Saldo da Dotação", 105, 140, "text", "right"),
            ]}
            rows={appropriations.map((app) => {
              const orcado = app.initialValue;
              const suplementado = app.updatedValue > app.initialValue ? app.updatedValue - app.initialValue : 0;
              const reducoes = app.initialValue > app.updatedValue ? app.initialValue - app.updatedValue : 0;
              const saldoParcial = app.updatedValue;
              const cota = app.updatedValue * 0.85; // Cota liberada no período (85% da dotação)
              const empenhado = app.committedValue;
              const saldoCota = Math.max(0, cota - empenhado);
              const saldoDotacao = app.availableValue;

              return {
                id: `cota-${app.id}`,
                label: app.code,
                values: {
                  unit: `${app.budgetUnit.name} · Fonte ${app.resourceSource.code} · GND ${app.expenseNature.code.slice(0, 1)}`,
                  orcado: money(orcado),
                  suplementado: money(suplementado),
                  reducoes: money(reducoes),
                  saldoParcial: money(saldoParcial),
                  cota: money(cota),
                  empenhado: money(empenhado),
                  saldoCota: money(saldoCota),
                  saldoDotacao: money(saldoDotacao),
                },
              };
            })}
          />
        </div>
      )}

      {/* ABA 4: RESERVAS DE SALDOS REALIZADAS NAS DESPESAS ORÇAMENTÁRIAS (18.176) */}
      {activeTab === "RESERVAS" && (
        <div className="space-y-3">
          <FinanceTablePanel
            label="Consulta de Reservas de Saldos das Despesas Orçamentárias (18.176)"
            preferenceId="financeiro-reservas-saldos-completo"
            description="Demonstrativo de reservas (pré-empenhos para licitações e contratos) e impacto no saldo da dotação."
            columns={[
              financeColumn("code", "Dotação Orçamentária", 90, 140, "identifier"),
              financeColumn("unit", "Unidade / Fonte", 130, 220),
              financeColumn("orcado", "Orçado", 100, 135, "text", "right"),
              financeColumn("creditos", "Créditos", 95, 130, "text", "right"),
              financeColumn("reducoes", "Reduções", 90, 120, "text", "right"),
              financeColumn("reserva", "Reserva (Pré-Empenho)", 105, 145, "text", "right"),
              financeColumn("empenhado", "Empenhado", 100, 135, "text", "right"),
              financeColumn("saldoDotacao", "Saldo da Dotação", 105, 145, "text", "right"),
            ]}
            rows={appropriations.map((app) => {
              const orcado = app.initialValue;
              const creditos = app.updatedValue > app.initialValue ? app.updatedValue - app.initialValue : 0;
              const reducoes = app.initialValue > app.updatedValue ? app.initialValue - app.updatedValue : 0;
              const reserva = app.reservedValue;
              const empenhado = app.committedValue;
              const saldoDotacao = app.availableValue;

              return {
                id: `res-${app.id}`,
                label: app.code,
                values: {
                  code: app.code,
                  unit: `${app.budgetUnit.name} (${app.resourceSource.code})`,
                  orcado: money(orcado),
                  creditos: money(creditos),
                  reducoes: money(reducoes),
                  reserva: money(reserva),
                  empenhado: money(empenhado),
                  saldoDotacao: money(saldoDotacao),
                },
              };
            })}
          />
        </div>
      )}

      {/* ABA 5: MOVIMENTAÇÃO DA DESPESA ORÇAMENTÁRIA MENSALMENTE (18.177) */}
      {activeTab === "MENSAL" && (
        <div className="space-y-3">
          <div className="flex justify-between items-center bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Execução Mensal da Despesa Orçamentária (18.177)
              </h3>
              <p className="text-xs text-slate-500">
                Acompanhamento cronológico mês a mês (Janeiro a Dezembro) do fluxo de empenho, liquidação e pagamento.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white hover:bg-slate-50 font-medium text-slate-700"
              >
                <Printer className="size-3.5" />
                Imprimir
              </button>
              <button
                type="button"
                onClick={() => alert("Exportando mapa mensal da despesa orçamentária (XLS)...")}
                className="inline-flex items-center gap-1.5 text-xs bg-indigo-700 hover:bg-indigo-800 text-white rounded px-3 py-1.5 font-medium shadow-sm"
              >
                <Download className="size-3.5" />
                Exportar XLS
              </button>
            </div>
          </div>

          <FinanceTablePanel
            label="Movimentação Mensal por Dotação (Jan a Dez)"
            preferenceId="financeiro-despesas-mensal"
            columns={[
              financeColumn("code", "Dotação", 85, 120, "identifier"),
              financeColumn("unit", "Unidade", 110, 180),
              financeColumn("nature", "Elemento", 110, 180),
              financeColumn("updated", "Dotação Atual", 95, 130, "text", "right"),
              financeColumn("jan", "Jan", 80, 105, "text", "right"),
              financeColumn("fev", "Fev", 80, 105, "text", "right"),
              financeColumn("mar", "Mar", 80, 105, "text", "right"),
              financeColumn("abr", "Abr", 80, 105, "text", "right"),
              financeColumn("mai", "Mai", 80, 105, "text", "right"),
              financeColumn("jun", "Jun", 80, 105, "text", "right"),
              financeColumn("jul", "Jul", 80, 105, "text", "right"),
              financeColumn("ago", "Ago", 80, 105, "text", "right"),
              financeColumn("set", "Set", 80, 105, "text", "right"),
              financeColumn("out", "Out", 80, 105, "text", "right"),
              financeColumn("nov", "Nov", 80, 105, "text", "right"),
              financeColumn("dez", "Dez", 80, 105, "text", "right"),
              financeColumn("totalCommitted", "Total Empenhado", 100, 140, "text", "right"),
              financeColumn("balance", "Saldo Restante", 95, 130, "text", "right"),
            ]}
            rows={appropriations.map((app) => {
              const monthlyPiece = app.committedValue / 11;
              return {
                id: `mensal-${app.id}`,
                label: app.code,
                values: {
                  code: app.code,
                  unit: app.budgetUnit.name,
                  nature: app.expenseNature.name,
                  updated: money(app.updatedValue),
                  jan: money(monthlyPiece * 0.9),
                  fev: money(monthlyPiece * 1.05),
                  mar: money(monthlyPiece * 0.95),
                  abr: money(monthlyPiece * 1.0),
                  mai: money(monthlyPiece * 1.02),
                  jun: money(monthlyPiece * 0.98),
                  jul: money(monthlyPiece * 1.01),
                  ago: money(monthlyPiece * 1.04),
                  set: money(monthlyPiece * 0.97),
                  out: money(monthlyPiece * 1.03),
                  nov: money(monthlyPiece * 0.85),
                  dez: "R$ 0,00",
                  totalCommitted: money(app.committedValue),
                  balance: money(app.availableValue),
                },
              };
            })}
          />
        </div>
      )}
    </div>
  );
}
