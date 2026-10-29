"use client";

import { useState } from "react";
import FinanceOperationalList from "../FinanceOperationalList";
import { financeColumn } from "../operational-columns";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { format } from "date-fns";
import { Plus, Ban } from "lucide-react";
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
import { createSettlement, cancelSettlement, updateSettlement } from "./actions";

type Settlement = {
  id: string;
  date: Date;
  value: number;
  documentRef: string | null;
  fiscalDocumentNumber: string | null;
  fiscalDocumentSeries: string | null;
  fiscalDocumentIssueDate: Date | null;
  fiscalDocumentAccessKey: string | null;
  document: { id: string; title: string } | null;
  financialDocument: { id: string; number: string; title: string } | null;
  notes: string | null;
  status: string;
  paidValue: number;
  commitment: {
    id: string;
    number: string;
    supplier: {
      company?: { corporateName: string } | null;
      person?: { fullName: string } | null;
    };
    purchaseReceipt: { number: string } | null;
  };
  author: {
    id: string;
    name: string;
  };
};

type CommitmentOption = { id: string; number: string; availableToSettle: number; purchaseReceipt: { number: string } | null };
type EmployeeOption = { id: string; name: string };
type RetentionRule = { id: string; code: string; type: string; description: string; calculationBasePercentage: number; ratePercentage: number; serviceCode: string | null };
const columns = [financeColumn("date", "Data", 80, 100), financeColumn("commitment", "Empenho", 65, 90), financeColumn("receipt", "Recebimento", 70, 100), financeColumn("supplier", "Fornecedor", 100, 160), financeColumn("document", "Documento (NF/Recibo)", 100, 160), financeColumn("issueDate", "Emissão NF", 80, 100), financeColumn("ged", "Documento GED", 80, 130), financeColumn("author", "Responsável (Ateste)", 90, 140), financeColumn("value", "Valor (R$)", 85, 120, "text", "right"), financeColumn("paid", "Pago (R$)", 85, 120, "text", "right"), financeColumn("internal", "Documento interno", 85, 130), financeColumn("status", "Status", 70, 100, "status"), financeColumn("actions", "Ações", 48, 48, "actions")];
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export default function LiquidacoesClient({
  settlements,
  commitments,
  employees,
  documents,
  retentionRules,
}: {
  settlements: Settlement[];
  commitments: CommitmentOption[];
  employees: EmployeeOption[];
  documents: { id: string; title: string; documentType: string }[];
  retentionRules: RetentionRule[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterMonth, setFilterMonth] = useState("ALL");
  const [filterYear, setFilterYear] = useState("ALL");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().substring(0, 10),
    value: 0,
    documentRef: "",
    fiscalDocumentNumber: "",
    fiscalDocumentSeries: "",
    fiscalDocumentIssueDate: "",
    fiscalDocumentAccessKey: "",
    documentId: "",
    commitmentId: "",
    authorId: "",
    notes: "",
    serviceCode: "",
    retentionRuleIds: [] as string[],
  });

  const filteredSettlements = settlements.filter(s => {
    const matchesSearch = s.commitment.number.includes(searchTerm) || (s.documentRef && s.documentRef.includes(searchTerm));
    const matchesStatus = filterStatus === "ALL" || s.status === filterStatus;

    const d = new Date(s.date);
    const matchesMonth = filterMonth === "ALL" || (d.getMonth() + 1).toString() === filterMonth;
    const matchesYear = filterYear === "ALL" || d.getFullYear().toString() === filterYear;

    return matchesSearch && matchesStatus && matchesMonth && matchesYear;
  });

  const handleOpenNew = () => {
    setEditingId(null);
    setFormData({
      date: new Date().toISOString().substring(0, 10),
      value: 0,
      documentRef: "",
      fiscalDocumentNumber: "",
      fiscalDocumentSeries: "",
      fiscalDocumentIssueDate: "",
      fiscalDocumentAccessKey: "",
      documentId: "",
      commitmentId: "",
      authorId: "",
      notes: "",
      serviceCode: "",
      retentionRuleIds: [],
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const dataToSubmit = {
        ...formData,
        date: new Date(formData.date),
        fiscalDocumentIssueDate: formData.fiscalDocumentIssueDate ? new Date(formData.fiscalDocumentIssueDate) : undefined,
      };

      if (editingId) {
        const result = await updateSettlement(editingId, dataToSubmit);
        if (result.error) throw new Error(result.error);
      } else {
        const result = await createSettlement(dataToSubmit);
        if (result.error) throw new Error(result.error);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving settlement:", error);
      alert(error instanceof Error ? error.message : "Ocorreu um erro ao salvar a liquidação.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSettlement = async (id: string) => {
    if (window.confirm('Deseja realmente cancelar esta liquidação? Esta ação não pode ser desfeita.')) {
      const result = await cancelSettlement(id);
      if (result.error) alert(result.error);
    }
  };

  return (
    <>
      <FinanceOperationalList resetKey={`${searchTerm}:${filterStatus}:${filterMonth}:${filterYear}`} searchable={false} preferenceId="financeiro-liquidacoes" label="Liquidações" columns={columns}
        actions={<button className={styles.newButton} onClick={handleOpenNew}><Plus />Nova Liquidação</button>}
        toolbar={<><input aria-label="Buscar empenho ou documento" placeholder="Empenho ou documento…" className={styles.searchInput} value={searchTerm} onChange={event => setSearchTerm(event.target.value)} /><OperationalFilters activeCount={[filterStatus, filterMonth, filterYear].filter(value => value !== "ALL").length}>
              <Select value={filterStatus} onValueChange={(val) => { setFilterStatus(val as string); }}>
                <SelectTrigger className="w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="Liquidado">Liquidado</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterMonth} onValueChange={(val) => { setFilterMonth(val as string); }}>
                <SelectTrigger className="w-[110px]"><SelectValue placeholder="Mês" /></SelectTrigger>
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
              <Select value={filterYear} onValueChange={(val) => { setFilterYear(val as string); }}>
                <SelectTrigger className="w-[100px]"><SelectValue placeholder="Ano" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Ano</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                </SelectContent>
              </Select>
              <button type="button" className={styles.dialogButton} onClick={() => { setFilterStatus("ALL"); setFilterMonth("ALL"); setFilterYear("ALL"); }}>Limpar filtros</button>
            </OperationalFilters></>}
        rows={filteredSettlements.map(settlement => ({ id: settlement.id, label: settlement.commitment.number, values: {
          date: format(new Date(settlement.date), "dd/MM/yyyy"), commitment: settlement.commitment.number, receipt: settlement.commitment.purchaseReceipt?.number ?? "—", supplier: settlement.commitment.supplier.company?.corporateName || settlement.commitment.supplier.person?.fullName || "Não identificado",
          document: settlement.fiscalDocumentNumber ? `NF ${settlement.fiscalDocumentNumber}${settlement.fiscalDocumentSeries ? ` / Série ${settlement.fiscalDocumentSeries}` : ""}` : settlement.documentRef || "—", issueDate: settlement.fiscalDocumentIssueDate ? format(new Date(settlement.fiscalDocumentIssueDate), "dd/MM/yyyy") : "—", ged: settlement.document?.title || "—", author: settlement.author.name, value: money(settlement.value), paid: money(settlement.paidValue), internal: settlement.financialDocument?.number || "—", status: settlement.status,
        }, actions: <button className={styles.iconButton} aria-label={`Cancelar liquidação de ${settlement.commitment.number}`} title="Cancelar Liquidação" disabled={settlement.status === "Cancelado"} onClick={() => void handleCancelSettlement(settlement.id)}><Ban /></button> }))} />

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Liquidação" : "Nova Liquidação"}</DialogTitle>
            <DialogDescription>Ateste o recebimento de materiais ou serviços vinculados a um empenho.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date">Data da Liquidação</Label>
                <Input id="date" type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="value">Valor (R$)</Label>
                <MoneyInput id="value" required value={formData.value} onChange={val => setFormData({...formData, value: val})} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="commitmentId">Empenho de Referência</Label>
              <Select value={formData.commitmentId} onValueChange={v => setFormData({...formData, commitmentId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Selecione o empenho" /></SelectTrigger>
                <SelectContent>
                  {commitments.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.number}{c.purchaseReceipt ? ` · ${c.purchaseReceipt.number}` : ""} - Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.availableToSettle)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="documentId">Documento GED</Label>
                <Select value={formData.documentId} onValueChange={v => setFormData({...formData, documentId: v as string})}>
                  <SelectTrigger><SelectValue placeholder="Selecione o documento GED" /></SelectTrigger>
                  <SelectContent>
                    {documents.map(document => (
                      <SelectItem key={document.id} value={document.id}>{document.title} ({document.documentType})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="documentRef">Documento Ref. (NF, Recibo)</Label>
                <Input id="documentRef" value={formData.documentRef} onChange={e => setFormData({...formData, documentRef: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="authorId">Responsável pelo Ateste</Label>
                <Select value={formData.authorId} onValueChange={v => setFormData({...formData, authorId: v as string})}>
                  <SelectTrigger><SelectValue placeholder="Selecione o servidor" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Dados do documento fiscal</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fiscalDocumentNumber">Número</Label>
                  <Input id="fiscalDocumentNumber" value={formData.fiscalDocumentNumber} onChange={e => setFormData({ ...formData, fiscalDocumentNumber: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fiscalDocumentSeries">Série</Label>
                  <Input id="fiscalDocumentSeries" value={formData.fiscalDocumentSeries} onChange={e => setFormData({ ...formData, fiscalDocumentSeries: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fiscalDocumentIssueDate">Data de emissão</Label>
                  <Input id="fiscalDocumentIssueDate" type="date" value={formData.fiscalDocumentIssueDate} onChange={e => setFormData({ ...formData, fiscalDocumentIssueDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fiscalDocumentAccessKey">Chave de acesso (quando houver)</Label>
                  <Input id="fiscalDocumentAccessKey" inputMode="numeric" value={formData.fiscalDocumentAccessKey} onChange={e => setFormData({ ...formData, fiscalDocumentAccessKey: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Informe número e data de emissão juntos. A chave é somente registrada, sem consulta externa de NF.</p>
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium">Retenções parametrizadas</p>
              <Input placeholder="Código do serviço (opcional)" value={formData.serviceCode} onChange={event => setFormData({ ...formData, serviceCode: event.target.value })} />
              {retentionRules.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma regra ativa cadastrada.</p>
              ) : (
                <div className="space-y-2">
                  {retentionRules.map((rule) => {
                    const selected = formData.retentionRuleIds.includes(rule.id);
                    const disabled = Boolean(rule.serviceCode && rule.serviceCode !== formData.serviceCode.trim());
                    return <label key={rule.id} className="flex items-start gap-2 rounded border p-2 text-sm"><input type="checkbox" checked={selected} disabled={disabled} onChange={() => setFormData({ ...formData, retentionRuleIds: selected ? formData.retentionRuleIds.filter((id) => id !== rule.id) : [...formData.retentionRuleIds, rule.id] })} /><span><strong>{rule.code} - {rule.type}</strong><br />{rule.description} ({rule.calculationBasePercentage}% x {rule.ratePercentage}%)</span></label>;
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">O cálculo é registrado na liquidação e será rateado nas ordens de pagamento posteriores.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Input id="notes" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : "Confirmar Liquidação"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
