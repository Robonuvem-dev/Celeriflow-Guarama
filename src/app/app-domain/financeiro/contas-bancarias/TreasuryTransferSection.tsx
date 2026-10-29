"use client";

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import FinanceTablePanel from "../FinanceTablePanel";
import { financeColumn } from "../operational-columns";
import { createTreasuryTransferAction } from "./actions";

type BankAccountOption = {
  id: string;
  bankName: string;
  agency: string;
  accountNumber: string;
  isActive: boolean;
  sourceIds?: string[];
};

type TreasuryTransfer = {
  id: string;
  date: string;
  value: number;
  history: string | null;
  sourceBankAccount: BankAccountOption;
  destinationBankAccount: BankAccountOption;
};

const formatMoney = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const accountLabel = (account: BankAccountOption) => `${account.bankName} - Ag. ${account.agency} / ${account.accountNumber}`;

export default function TreasuryTransferSection({ accounts, transfers, sources }: { accounts: BankAccountOption[]; transfers: TreasuryTransfer[]; sources: { id: string; code: string; name: string }[] }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0, 10),
    value: 0,
    sourceBankAccountId: "",
    destinationBankAccountId: "",
    resourceSourceId: "",
    history: "",
  });
  const activeAccounts = accounts.filter((account) => account.isActive);
  const sourceAccount = accounts.find(account => account.id === formData.sourceBankAccountId);
  const destinationAccount = accounts.find(account => account.id === formData.destinationBankAccountId);
  const commonSources = sources.filter(source => sourceAccount?.sourceIds?.includes(source.id) && destinationAccount?.sourceIds?.includes(source.id));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const result = await createTreasuryTransferAction(formData);
    setIsSubmitting(false);
    if (result.error) {
      alert(result.error);
      return;
    }
    setFormData({
      date: new Date().toISOString().slice(0, 10),
      value: 0,
      sourceBankAccountId: "",
      destinationBankAccountId: "",
      resourceSourceId: "",
      history: "",
    });
  }

  return (
    <Card size="sm" className="rounded-md shadow-none">
      <CardHeader className="border-b pb-2">
        <CardTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" />Transferência entre contas</CardTitle>
        <CardDescription>Movimente valores entre contas acessíveis com a mesma fonte de recursos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="transfer-date">Data</Label>
            <Input id="transfer-date" type="date" required value={formData.date} onChange={(event) => setFormData({ ...formData, date: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer-value">Valor</Label>
            <MoneyInput id="transfer-value" required value={formData.value} onChange={(value) => setFormData({ ...formData, value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source-bank-account">Conta de origem</Label>
            <Select value={formData.sourceBankAccountId} onValueChange={(value) => setFormData({ ...formData, sourceBankAccountId: value as string, resourceSourceId: "" })}>
              <SelectTrigger id="source-bank-account"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>{activeAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{accountLabel(account)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="destination-bank-account">Conta de destino</Label>
            <Select value={formData.destinationBankAccountId} onValueChange={(value) => setFormData({ ...formData, destinationBankAccountId: value as string, resourceSourceId: "" })}>
              <SelectTrigger id="destination-bank-account"><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
              <SelectContent>{activeAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{accountLabel(account)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="transfer-source">Fonte de recursos</Label>
            <select id="transfer-source" required value={formData.resourceSourceId} onChange={event => setFormData({ ...formData, resourceSourceId: event.target.value })} className="w-full rounded border p-2 text-sm"><option value="">Selecione uma fonte permitida nas duas contas</option>{commonSources.map(source => <option key={source.id} value={source.id}>{source.code} · {source.name}</option>)}</select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="transfer-history">Histórico</Label>
            <Input id="transfer-history" maxLength={500} value={formData.history} onChange={(event) => setFormData({ ...formData, history: event.target.value })} placeholder="Motivo ou referência da transferência" />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={isSubmitting || activeAccounts.length < 2}>{isSubmitting ? "Transferindo..." : "Registrar transferência"}</Button>
          </div>
        </form>

        <FinanceTablePanel label="Transferências recentes" preferenceId="financeiro-transferencias"
          columns={[financeColumn("date", "Data", 80, 110), financeColumn("origin", "Origem", 100, 260), financeColumn("destination", "Destino", 100, 260), financeColumn("history", "Histórico", 100, 280), financeColumn("value", "Valor", 90, 140, "text", "right")]}
          rows={transfers.map(transfer => ({ id: transfer.id, label: transfer.history || transfer.id, values: { date: new Date(transfer.date).toLocaleDateString("pt-BR", { timeZone: "UTC" }), origin: accountLabel(transfer.sourceBankAccount), destination: accountLabel(transfer.destinationBankAccount), history: transfer.history || "—", value: formatMoney(transfer.value) } }))} />
      </CardContent>
    </Card>
  );
}
