"use client";

import { useState } from "react";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { financeColumn } from "../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import FinanceOperationalList from "../FinanceOperationalList";
import { format } from "date-fns";
import { Wallet, Plus, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { createPayment, cancelPayment, updatePaymentStatus, reversePaymentAction, settleWithholdingPayableAction } from "./actions";

type PendingWithholding = {
  id: string;
  type: string;
  description: string | null;
  value: number;
  orderNumber: string;
  dueDate: string | null;
};

type Payment = {
  id: string;
  orderNumber: string;
  date: Date;
  value: number;
  netValue: number;
  retentionValue: number;
  paymentMethod: string;
  status: string;
  isExceptional: boolean;
  financialDocument: { id: string; number: string; title: string } | null;
  settlement: { id: string; documentRef: string | null } | null;
  commitment: {
    id: string;
    number: string;
    purchaseReceipt: { number: string } | null;
  };
  bankAccount: {
    id: string;
    bankName: string;
    agency: string;
    accountNumber: string;
  };
  supplier: {
    id: string;
    company?: { corporateName: string } | null;
    person?: { fullName: string } | null;
  };
};

type CommitmentOption = { id: string; number: string; value: number; supplierId: string; purchaseReceipt: { number: string } | null };
type SettlementOption = { id: string; commitmentId: string; documentRef: string | null; availableToPay: number };
type BankAccountOption = { id: string; bankName: string; agency: string; accountNumber: string; cashBalance: string; sourceBalances: { sourceCode: string; balance: string | null }[] };
type SupplierOption = { id: string; company?: { corporateName: string } | null; person?: { fullName: string } | null };
const columns = [financeColumn("order", "Ordem", 70, 100), financeColumn("date", "Data", 80, 100), financeColumn("supplier", "Fornecedor", 90, 150), financeColumn("commitment", "Empenho", 65, 90), financeColumn("receipt", "Recebimento", 75, 100), financeColumn("account", "Conta Bancária", 100, 170), financeColumn("method", "Forma Pgto.", 75, 110), financeColumn("gross", "Bruto (R$)", 85, 120, "text", "right"), financeColumn("net", "Líquido (R$)", 85, 120, "text", "right"), financeColumn("retained", "Retido (R$)", 85, 120, "text", "right"), financeColumn("exception", "Exceção justificada", 75, 120), financeColumn("document", "Documento interno", 80, 120), financeColumn("status", "Status", 70, 100, "status"), financeColumn("actions", "Ações", 80, 80, "actions")];
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export default function PagamentosClient({
  payments,
  commitments,
  settlements,
  bankAccounts,
  suppliers,
  pendingWithholdings = [],
  receiptDocuments,
}: {
  payments: Payment[];
  commitments: CommitmentOption[];
  settlements: SettlementOption[];
  bankAccounts: BankAccountOption[];
  suppliers: SupplierOption[];
  pendingWithholdings?: PendingWithholding[];
  receiptDocuments: { id: string; title: string; documentType: string }[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterMonth, setFilterMonth] = useState("ALL");
  const [filterYear, setFilterYear] = useState("ALL");
  const [filterAccount, setFilterAccount] = useState("ALL");
  const [filterMethod, setFilterMethod] = useState("ALL");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRetentionModalOpen, setIsRetentionModalOpen] = useState(false);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState(bankAccounts[0]?.id || "");
  const [receiptDocumentId, setReceiptDocumentId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    orderNumber: "",
    date: new Date().toISOString().substring(0, 10),
    value: 0,
    commitmentId: "",
    settlementId: "",
    bankAccountId: "",
      supplierId: "",
      paymentMethod: "Transferência",
  });

  const filteredPayments = payments.filter(p => {
    const matchesSearch = p.orderNumber.includes(searchTerm) ||
      (p.supplier.company?.corporateName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.supplier.person?.fullName || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === "ALL" || p.status === filterStatus;
    const matchesAccount = filterAccount === "ALL" || p.bankAccount.id === filterAccount;
    const matchesMethod = filterMethod === "ALL" || p.paymentMethod === filterMethod;

    const d = new Date(p.date);
    const matchesMonth = filterMonth === "ALL" || (d.getMonth() + 1).toString() === filterMonth;
    const matchesYear = filterYear === "ALL" || d.getFullYear().toString() === filterYear;

    return matchesSearch && matchesStatus && matchesMonth && matchesYear && matchesAccount && matchesMethod;
  });
  const pageSize = OPERATIONAL_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedPayments = filteredPayments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleOpenNew = () => {
    setFormData({
      orderNumber: "",
      date: new Date().toISOString().substring(0, 10),
      value: 0,
      commitmentId: "",
      settlementId: "",
      bankAccountId: "",
      supplierId: "",
      paymentMethod: "Transferência",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.settlementId) {
      alert("Selecione uma liquidação ativa vinculada ao empenho.");
      return;
    }
    setIsSubmitting(true);
    try {
      const dataToSubmit = {
        orderNumber: formData.orderNumber,
        date: new Date(formData.date),
        value: formData.value,
        commitmentId: formData.commitmentId,
        settlementId: formData.settlementId,
        bankAccountId: formData.bankAccountId,
        supplierId: formData.supplierId,
        paymentMethod: formData.paymentMethod,
      };

      const result = await createPayment(dataToSubmit);
      if (result.error) throw new Error(result.error);
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error creating payment:", error);
      alert(error instanceof Error ? error.message : "Ocorreu um erro ao salvar o pagamento.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeStatus = async (id: string, newStatus: string) => {
    if (newStatus === "Cancelada") {
      if (window.confirm('Deseja realmente cancelar este pagamento? Esta ação não pode ser desfeita.')) {
        const result = await cancelPayment(id);
        if (result.error) alert(result.error);
      }
    } else {
      const result = await updatePaymentStatus(id, newStatus);
      if (result.error) alert(result.error);
    }
  };

  const handleReversePayment = async (id: string) => {
    const justification = window.prompt("Informe a justificativa obrigatória para o estorno do pagamento:");
    if (!justification || !justification.trim()) return;
    const result = await reversePaymentAction(id, justification.trim());
    if (result.error) alert(result.error);
  };

  const handleSettleWithholding = async (withholdingPayableId: string) => {
    if (!selectedBankAccountId) {
      alert("Selecione uma conta bancária ativa para o recolhimento.");
      return;
    }
    if (!receiptDocumentId) {
      alert("Selecione o comprovante de recolhimento cadastrado no GED.");
      return;
    }
    const result = await settleWithholdingPayableAction(withholdingPayableId, selectedBankAccountId, receiptDocumentId);
    if (result.error) alert(result.error);
  };

  if (isRetentionModalOpen) return <FinanceOperationalList label="Recolhimento de Retenções Tributárias" preferenceId="financeiro-retencoes"
    columns={[financeColumn("order", "Ordem", 90), financeColumn("type", "Tipo", 100), financeColumn("description", "Descrição", 170, 280), financeColumn("value", "Valor", 110, 140, "text", "right"), financeColumn("actions", "Ação", 90, 90, "actions")]}
    actions={<button className={styles.dialogButton} onClick={() => setIsRetentionModalOpen(false)}>Voltar aos pagamentos</button>}
    toolbar={<OperationalFilters label="Conta e comprovante de recolhimento" activeCount={Number(Boolean(selectedBankAccountId)) + Number(Boolean(receiptDocumentId))}>
      <div className={styles.filterFields}><label>Conta Bancária para Débito do Recolhimento<select className="block w-full rounded border p-2" value={selectedBankAccountId} onChange={event => setSelectedBankAccountId(event.target.value)}><option value="">Selecione a conta</option>{bankAccounts.map(account => <option key={account.id} value={account.id}>{account.bankName} (Ag: {account.agency} Cc: {account.accountNumber})</option>)}</select></label>
      <label>Comprovante de Recolhimento (GED)<select className="block w-full rounded border p-2" value={receiptDocumentId} onChange={event => setReceiptDocumentId(event.target.value)}><option value="">Selecione o comprovante válido</option>{receiptDocuments.map(document => <option key={document.id} value={document.id}>{document.title} ({document.documentType})</option>)}</select></label><p>O recolhimento gera um registro interno vinculado a este comprovante, à retenção e à ordem de pagamento de origem.</p></div>
    </OperationalFilters>}
    rows={pendingWithholdings.map(row => ({ id: row.id, label: row.orderNumber, values: { order: row.orderNumber, type: row.type, description: row.description || "—", value: money(row.value) }, actions: <button className={styles.dialogButton} onClick={() => void handleSettleWithholding(row.id)}>Recolher</button> }))} />;

  return (
    <>
      <OperationalListFrame label="Pagamentos" actions={<>
          {pendingWithholdings.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setIsRetentionModalOpen(true)}>
              <Wallet className="mr-2 h-4 w-4 text-amber-500" />
              Recolher Retenções Pendentes ({pendingWithholdings.length})
            </Button>
          )}
          <Button size="sm" onClick={handleOpenNew}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Ordem de Pagamento
          </Button>
      </>} toolbar={<><input aria-label="Buscar fornecedor ou ordem" placeholder="Buscar fornecedor ou ordem…" className={styles.searchInput} value={searchTerm} onChange={event => { setSearchTerm(event.target.value); setPage(1); }} /><OperationalFilters activeCount={[filterStatus, filterMonth, filterYear, filterAccount, filterMethod].filter(value => value !== "ALL").length}>
              <Select value={filterStatus} onValueChange={(val) => { setFilterStatus(val as string); setPage(1); }}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos (Status)</SelectItem>
                  <SelectItem value="Emitida">Emitida</SelectItem>
                  <SelectItem value="Paga">Paga</SelectItem>
                  <SelectItem value="Cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterMonth} onValueChange={(val) => { setFilterMonth(val as string); setPage(1); }}>
                <SelectTrigger className="w-[100px]"><SelectValue placeholder="Mês" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Mês</SelectItem>
                  <SelectItem value="1">Jan</SelectItem>
                  <SelectItem value="2">Fev</SelectItem>
                  <SelectItem value="3">Mar</SelectItem>
                  <SelectItem value="4">Abr</SelectItem>
                  <SelectItem value="5">Mai</SelectItem>
                  <SelectItem value="6">Jun</SelectItem>
                  <SelectItem value="7">Jul</SelectItem>
                  <SelectItem value="8">Ago</SelectItem>
                  <SelectItem value="9">Set</SelectItem>
                  <SelectItem value="10">Out</SelectItem>
                  <SelectItem value="11">Nov</SelectItem>
                  <SelectItem value="12">Dez</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterYear} onValueChange={(val) => { setFilterYear(val as string); setPage(1); }}>
                <SelectTrigger className="w-[100px]"><SelectValue placeholder="Ano" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Ano</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterAccount} onValueChange={(val) => { setFilterAccount(val as string); setPage(1); }}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas Contas</SelectItem>
                  {bankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.bankName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterMethod} onValueChange={(val) => { setFilterMethod(val as string); setPage(1); }}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Forma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas Formas</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                  <SelectItem value="Boleto">Boleto</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                  <SelectItem value="PIX">PIX</SelectItem>
                </SelectContent>
              </Select>
              <button type="button" className={styles.dialogButton} onClick={() => { setFilterStatus("ALL"); setFilterMonth("ALL"); setFilterYear("ALL"); setFilterAccount("ALL"); setFilterMethod("ALL"); setPage(1); }}>Limpar filtros</button>
            </OperationalFilters></>}
        pagination={<OperationalPagination page={currentPage} total={filteredPayments.length} onPageChange={setPage} />}>
        <OperationalTable preferenceId="financeiro-pagamentos" caption="Ordens de pagamento" emptyMessage="Nenhum pagamento encontrado." columns={columns}
          rows={pagedPayments.map(payment => ({ id: payment.id, label: payment.orderNumber, values: { order: payment.orderNumber, date: format(new Date(payment.date), "dd/MM/yyyy"), supplier: payment.supplier.company?.corporateName || payment.supplier.person?.fullName || "Não identificado", commitment: payment.commitment.number, receipt: payment.commitment.purchaseReceipt?.number ?? "—", account: `${payment.bankAccount.bankName} - Ag: ${payment.bankAccount.agency} Cc: ${payment.bankAccount.accountNumber}`, method: payment.paymentMethod, gross: money(payment.value), net: money(payment.netValue), retained: money(payment.retentionValue), exception: payment.isExceptional ? "Exceção justificada" : "—", document: payment.financialDocument?.number || "—", status: payment.status }, actions: <div className={styles.rowActions}>{payment.status === "Paga" && <button className={styles.dialogButton} onClick={() => void handleReversePayment(payment.id)}>Estornar</button>}{payment.status === "Emitida" && <button className={styles.iconButton} aria-label={`Cancelar pagamento ${payment.orderNumber}`} title="Cancelar Pagamento" onClick={() => void handleChangeStatus(payment.id, "Cancelada")}><Ban /></button>}</div> }))} />
      </OperationalListFrame>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Nova Ordem de Pagamento</DialogTitle>
            <DialogDescription>Crie uma ordem de pagamento vinculada a um empenho.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="orderNumber">Número da Ordem</Label>
                <Input id="orderNumber" required value={formData.orderNumber} onChange={e => setFormData({...formData, orderNumber: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Data do Pagamento</Label>
                <Input id="date" type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Forma de Pagamento</Label>
                <Select value={formData.paymentMethod} onValueChange={v => setFormData({...formData, paymentMethod: v as string})}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Transferência">Transferência</SelectItem>
                    <SelectItem value="Boleto">Boleto</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="PIX">PIX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
                <div className="space-y-2">
                  <Label htmlFor="value">Valor (R$)</Label>
                  <MoneyInput id="value" required value={formData.value} onChange={val => setFormData({...formData, value: val})} />
                </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplierId">Fornecedor / Credor</Label>
              <Select value={formData.supplierId} onValueChange={v => setFormData({...formData, supplierId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Selecione o fornecedor" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.company?.corporateName || s.person?.fullName || 'Fornecedor Sem Nome'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="commitmentId">Empenho de Referência</Label>
              <Select value={formData.commitmentId} onValueChange={v => {
                const commitment = commitments.find(c => c.id === v);
                setFormData({...formData, commitmentId: v as string, settlementId: "", supplierId: commitment?.supplierId ?? formData.supplierId});
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione o empenho" /></SelectTrigger>
                <SelectContent>
                  {commitments.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.number}{c.purchaseReceipt ? ` · ${c.purchaseReceipt.number}` : ""} - Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settlementId">Liquidação de Referência *</Label>
              <Select value={formData.settlementId} onValueChange={v => setFormData({...formData, settlementId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Selecione a liquidação" /></SelectTrigger>
                <SelectContent>
                  {settlements.filter(s => !formData.commitmentId || s.commitmentId === formData.commitmentId).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.documentRef || "Liquidação"} - Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(s.availableToPay)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-muted-foreground">As retenções são calculadas na liquidação selecionada e rateadas automaticamente nesta ordem de pagamento.</p>

            <div className="space-y-2">
              <Label htmlFor="bankAccountId">Conta Bancária Pagadora</Label>
              {formData.bankAccountId && <div className="rounded border bg-slate-50 p-2 text-xs"><p>Saldo bancário: R$ {bankAccounts.find(account => account.id === formData.bankAccountId)?.cashBalance}</p>{bankAccounts.find(account => account.id === formData.bankAccountId)?.sourceBalances.map(source => <p key={source.sourceCode}>Fonte {source.sourceCode}: {source.balance === null ? "Conciliação documental pendente" : `R$ ${source.balance}`}</p>)}</div>}
              <Select value={formData.bankAccountId} onValueChange={v => setFormData({...formData, bankAccountId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.bankName} (Ag: {b.agency} Cc: {b.accountNumber})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : "Confirmar Pagamento"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </>
  );
}
