"use client";

import { useState } from "react";
import FinanceOperationalList from "../FinanceOperationalList";
import { financeColumn } from "../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Pencil, Plus, Check, X } from "lucide-react";
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
import { createBankAccount, updateBankAccount, toggleBankAccountStatus } from "./actions";

type BankAccount = {
  id: string;
  bankName: string;
  agency: string;
  bankId: string | null;
  bankBranchId: string | null;
  accountNumber: string;
  accountType: string;
  currentBalance: number;
  resourceSourceId: string | null;
  budgetUnitId: string | null;
  accountingPlanId: string | null;
  purpose: string | null;
  isActive: boolean;
  resourceSource?: { id: string; name: string } | null;
  budgetUnit?: { id: string; code: string; name: string } | null;
};
const columns = [financeColumn("bank", "Banco", 120, 180), financeColumn("agency", "Agência", 75), financeColumn("account", "Conta", 90), financeColumn("type", "Tipo", 90), financeColumn("purpose", "Finalidade", 130, 180), financeColumn("source", "Fonte de Recurso", 120), financeColumn("unit", "Unidade Gestora", 120), financeColumn("balance", "Saldo Atual (R$)", 125, 150, "text", "right"), financeColumn("status", "Status", 75, 90, "status"), financeColumn("actions", "Ações", 64, 64, "actions")];

export default function ContasBancariasClient({
  accounts,
  resourceSources,
  budgetUnits,
  accountingPlans,
  banks,
}: {
  accounts: BankAccount[];
  resourceSources: { id: string; name: string }[];
  budgetUnits: { id: string; code: string; name: string }[];
  accountingPlans: { id: string; code: string; name: string }[];
  banks: { id: string; compe: string; name: string; shortName: string; branches: { id: string; code: string; name: string }[] }[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    bankName: "",
    agency: "",
    bankId: "",
    bankBranchId: "",
    accountNumber: "",
    accountType: "Movimento",
    currentBalance: 0,
    resourceSourceId: "",
    budgetUnitId: "",
    accountingPlanId: "",
    isActive: true
  });

  const filteredAccounts = accounts.filter(account =>
    account.bankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.agency.includes(searchTerm) ||
    account.accountNumber.includes(searchTerm) ||
    account.purpose?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenNew = () => {
    setEditingId(null);
    setFormData({
      bankName: "",
      agency: "",
      bankId: "",
      bankBranchId: "",
      accountNumber: "",
      accountType: "Movimento",
      currentBalance: 0,
      resourceSourceId: "",
      budgetUnitId: "",
      accountingPlanId: "",
      isActive: true
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (account: BankAccount) => {
    setEditingId(account.id);
    setFormData({
      bankName: account.bankName,
      agency: account.agency,
      bankId: account.bankId || "",
      bankBranchId: account.bankBranchId || "",
      accountNumber: account.accountNumber,
      accountType: account.accountType,
      currentBalance: 0,
      resourceSourceId: account.resourceSourceId || "",
      budgetUnitId: account.budgetUnitId || "",
      accountingPlanId: account.accountingPlanId || "",
      isActive: account.isActive
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateBankAccount(editingId, formData);
      } else {
        await createBankAccount(formData);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving account:", error);
      alert("Ocorreu um erro ao salvar a conta bancária.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    if (window.confirm(`Deseja ${currentStatus ? 'inativar' : 'ativar'} esta conta?`)) {
      await toggleBankAccountStatus(id, !currentStatus);
    }
  };

  const selectedBank = banks.find((bank) => bank.id === formData.bankId);

  return (
    <>
      <FinanceOperationalList label="Contas Bancárias" preferenceId="financeiro-contas" columns={columns} searchable={false} resetKey={searchTerm}
        actions={<button className={styles.newButton} onClick={handleOpenNew}><Plus />Nova Conta</button>}
        toolbar={<input aria-label="Buscar banco, agência, conta ou finalidade" placeholder="Buscar banco, agência, conta ou finalidade…" className={styles.searchInput} value={searchTerm} onChange={event => setSearchTerm(event.target.value)} />}
        rows={filteredAccounts.map(account => ({ id: account.id, label: `${account.bankName} / ${account.accountNumber}`, values: { bank: account.bankName, agency: account.agency, account: account.accountNumber, type: account.accountType, purpose: account.purpose || "Finalidade não informada", source: account.resourceSource?.name || "Não vinculada", unit: account.budgetUnit ? `${account.budgetUnit.code} - ${account.budgetUnit.name}` : "Não vinculada", balance: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(account.currentBalance), status: account.isActive ? "Ativa" : "Inativa" }, actions: <div className={styles.rowActions}><button className={styles.iconButton} aria-label={`${account.isActive ? "Inativar" : "Ativar"} conta ${account.accountNumber}`} title={account.isActive ? "Inativar" : "Ativar"} onClick={() => void handleToggleStatus(account.id, account.isActive)}>{account.isActive ? <X /> : <Check />}</button><button className={styles.iconButton} aria-label={`Editar conta ${account.accountNumber}`} title="Editar" onClick={() => handleOpenEdit(account)}><Pencil /></button></div> }))} />

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Conta Bancária" : "Nova Conta Bancária"}</DialogTitle>
            <DialogDescription>O saldo é derivado dos movimentos. O saldo de abertura só pode ser informado na inclusão e fica auditado.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bankId">Banco do Cadastro Único</Label>
                <Select value={formData.bankId || "legacy"} onValueChange={(value) => {
                  const bankId = value === "legacy" ? "" : String(value);
                  const bank = banks.find((item) => item.id === bankId);
                  setFormData({ ...formData, bankId, bankBranchId: "", bankName: bank?.name || formData.bankName, agency: "" });
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="legacy">Sem vínculo canônico</SelectItem>
                    {banks.map((bank) => <SelectItem key={bank.id} value={bank.id}>{bank.compe} - {bank.shortName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankBranchId">Agência do Cadastro Único</Label>
                <Select value={formData.bankBranchId || "legacy"} onValueChange={(value) => {
                  const bankBranchId = value === "legacy" ? "" : String(value);
                  const branch = selectedBank?.branches.find((item) => item.id === bankBranchId);
                  setFormData({ ...formData, bankBranchId, agency: branch?.code || formData.agency });
                }} disabled={!selectedBank}>
                  <SelectTrigger><SelectValue placeholder="Selecione a agência" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="legacy">Sem vínculo canônico</SelectItem>
                    {selectedBank?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.code} - {branch.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankName">Nome do Banco (snapshot)</Label>
              <Input id="bankName" required value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} readOnly={Boolean(selectedBank)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="agency">Agência (snapshot)</Label>
                <Input id="agency" required value={formData.agency} onChange={e => setFormData({...formData, agency: e.target.value})} readOnly={Boolean(formData.bankBranchId)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="accountNumber">Conta</Label>
                <Input id="accountNumber" required value={formData.accountNumber} onChange={e => setFormData({...formData, accountNumber: e.target.value})} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="accountType">Tipo de Conta</Label>
                <Select value={formData.accountType} onValueChange={v => setFormData({...formData, accountType: v as string})}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Movimento">Movimento</SelectItem>
                    <SelectItem value="Vinculada">Vinculada</SelectItem>
                    <SelectItem value="Arrecadação">Arrecadação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!editingId && <div className="space-y-2">
                <Label htmlFor="currentBalance">Saldo Atual (R$)</Label>
                <MoneyInput id="currentBalance" required value={formData.currentBalance} onChange={val => setFormData({...formData, currentBalance: val})} />
              </div>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="resourceSourceId">Fonte de Recurso</Label>
              <Select value={formData.resourceSourceId} onValueChange={v => setFormData({...formData, resourceSourceId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Selecione a fonte" /></SelectTrigger>
                <SelectContent>
                  {resourceSources.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budgetUnitId">Unidade Gestora</Label>
              <Select value={formData.budgetUnitId} onValueChange={v => setFormData({...formData, budgetUnitId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Selecione a Unidade Gestora" /></SelectTrigger>
                <SelectContent>
                  {budgetUnits.map(unit => (
                    <SelectItem key={unit.id} value={unit.id}>{unit.code} - {unit.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountingPlanId">Conta Analítica do Razão Bancário</Label>
              <Select value={formData.accountingPlanId} onValueChange={v => setFormData({...formData, accountingPlanId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Selecione a conta analítica" /></SelectTrigger>
                <SelectContent>
                  {accountingPlans.map(plan => (
                    <SelectItem key={plan.id} value={plan.id}>{plan.code} - {plan.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="rounded border-slate-300" />
              <Label htmlFor="isActive" className="mb-0 cursor-pointer">Conta Ativa</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : "Salvar Conta"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
