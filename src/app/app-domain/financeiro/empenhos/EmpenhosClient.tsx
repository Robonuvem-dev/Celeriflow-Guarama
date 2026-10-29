"use client";

import { useState } from "react";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { financeColumn } from "../operational-columns";
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
import { createCommitment, updateCommitment, cancelCommitment } from "./actions";

type Commitment = {
  id: string;
  number: string;
  date: Date;
  value: number;
  type: string;
  history: string;
  status: string;
  supplierId: string;
  appropriationId: string;
  supplier: {
    id: string;
    company?: { corporateName: string } | null;
    person?: { fullName: string } | null;
  };
  appropriation: {
    id: string;
    code: string;
    budgetUnit: { name: string };
  };
  financialDocument: { id: string; number: string; title: string } | null;
  obrasServices: { id: string; protocolo: string }[];
  purchaseReceipt: { number: string } | null;
};

type SupplierOption = {
  id: string;
  company?: { corporateName: string } | null;
  person?: { fullName: string } | null;
};

type AppropriationOption = { id: string; code: string; budgetUnit: { name: string } };
type ReservationOption = {
  id: string;
  number: string;
  value: number;
  appropriationId: string;
  appropriation: { code: string };
  expense: {
    supplierId: string | null;
    sourceModule: string;
    sourceType: string;
    sourceId: string | null;
    purchaseReceipt: { number: string; contractId: string; contract: { supplierId: string } } | null;
  } | null;
};
type ProcessOption = { id: string; protocolNumber: string; description: string | null };
type ContractOption = { id: string; number: string; object: string; supplierId: string; status: string };
type ObrasServiceOption = { id: string; protocolo: string; tipo: string; descricao: string; local: string; budgetAppropriationId: string | null; budgetAppropriation: { code: string } | null };
type CovenantOption = { id: string; number: string; grantor: string | null };
type PublicityCampaignOption = { id: string; name: string; agency: string | null };
type FundedDebtOption = { id: string; lawNumber: string; creditorName: string | null };

const columns = [financeColumn("number", "Número", 70, 90, "identifier"), financeColumn("date", "Data", 90), financeColumn("supplier", "Fornecedor/Credor", 120, 200), financeColumn("unit", "Unidade Orçamentária", 120, 170), financeColumn("value", "Valor (R$)", 110, 130, "text", "right"), financeColumn("receipt", "Recebimento", 95), financeColumn("document", "Documento interno", 110), financeColumn("works", "Obra/OS", 80), financeColumn("status", "Status", 85, 100, "status"), financeColumn("actions", "Ações", 48, 48, "actions")];

export default function EmpenhosClient({
  commitments,
  suppliers,
  appropriations,
  reservations,
  processes,
  contracts,
  obrasServices,
  covenants,
  publicityCampaigns,
  fundedDebts,
}: {
  commitments: Commitment[];
  suppliers: SupplierOption[];
  appropriations: AppropriationOption[];
  reservations: ReservationOption[];
  processes: ProcessOption[];
  contracts: ContractOption[];
  obrasServices: ObrasServiceOption[];
  covenants: CovenantOption[];
  publicityCampaigns: PublicityCampaignOption[];
  fundedDebts: FundedDebtOption[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    number: "",
    date: new Date().toISOString().substring(0, 10),
    value: 0,
    type: "Ordinário",
    history: "",
    supplierId: "",
    appropriationId: "",
    reservationId: "",
    processId: "",
    contractId: "",
    obrasServiceId: "",
    covenantId: "",
    publicityCampaignId: "",
    fundedDebtId: "",
  });

  const filteredCommitments = commitments.filter(c =>
    c.number.includes(searchTerm) ||
    c.supplier.company?.corporateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.supplier.person?.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const pageSize = OPERATIONAL_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filteredCommitments.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedCommitments = filteredCommitments.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleOpenNew = () => {
    setEditingId(null);
    setFormData({
      number: "",
      date: new Date().toISOString().substring(0, 10),
      value: 0,
      type: "Ordinário",
      history: "",
      supplierId: "",
      appropriationId: "",
      reservationId: "",
      processId: "",
      contractId: "",
      obrasServiceId: "",
      covenantId: "",
      publicityCampaignId: "",
      fundedDebtId: "",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const dataToSubmit = {
        ...formData,
        date: new Date(formData.date)
      };

      if (editingId) {
        const result = await updateCommitment(editingId, dataToSubmit);
        if (result.error) throw new Error(result.error);
      } else {
        const result = await createCommitment(dataToSubmit);
        if (result.error) throw new Error(result.error);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error saving commitment:", error);
      alert("Ocorreu um erro ao salvar o empenho.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelCommitment = async (id: string) => {
    if (window.confirm('Deseja realmente anular este empenho? Esta ação não pode ser desfeita.')) {
      const result = await cancelCommitment(id);
      if (result.error) alert(result.error);
    }
  };

  return (
    <>
      <OperationalListFrame label="Empenhos" actions={<button className={styles.newButton} onClick={handleOpenNew}><Plus />Novo Empenho</button>}
        toolbar={<input aria-label="Buscar por fornecedor ou número" placeholder="Buscar por fornecedor ou número…" className={styles.searchInput} value={searchTerm} onChange={event => { setSearchTerm(event.target.value); setPage(1); }} />}
        pagination={<OperationalPagination page={currentPage} total={filteredCommitments.length} onPageChange={setPage} />}>
        <OperationalTable preferenceId="financeiro-empenhos" columns={columns} caption="Empenhos" emptyMessage="Nenhum empenho encontrado." rows={pagedCommitments.map(commitment => ({ id: commitment.id, label: commitment.number, values: {
          number: commitment.number, date: format(new Date(commitment.date), "dd/MM/yyyy"), supplier: commitment.supplier.company?.corporateName || commitment.supplier.person?.fullName || "Não identificado", unit: commitment.appropriation.budgetUnit.name,
          value: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(commitment.value), receipt: commitment.purchaseReceipt?.number ?? "—", document: commitment.financialDocument?.number || "—", works: commitment.obrasServices.map(service => service.protocolo).join(", ") || "—", status: commitment.status,
        }, actions: <button className={styles.iconButton} aria-label={`Anular empenho ${commitment.number}`} title="Anular" disabled={commitment.status === "Anulado"} onClick={() => void handleCancelCommitment(commitment.id)}><Ban /></button> }))} />
      </OperationalListFrame>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Empenho" : "Novo Empenho"}</DialogTitle>
            <DialogDescription>Todo empenho novo deve consumir uma reserva ativa de mesmo valor.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="number">Número do Empenho</Label>
                <Input id="number" required value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Data</Label>
                <Input id="date" type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="obrasServiceId">Obra / ordem de serviço (opcional)</Label>
              <Select value={formData.obrasServiceId} onValueChange={v => setFormData({...formData, obrasServiceId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Sem obra/ordem de serviço" /></SelectTrigger>
                <SelectContent>
                  {obrasServices.filter((service) => !service.budgetAppropriationId || service.budgetAppropriationId === formData.appropriationId).map((service) => <SelectItem key={service.id} value={service.id}>{service.protocolo} - {service.tipo}: {service.descricao}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Somente ordens ativas e ainda não vinculadas podem ser selecionadas.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="covenantId">Convênio (opcional)</Label>
                <Select value={formData.covenantId} onValueChange={value => setFormData({ ...formData, covenantId: value ?? "" })}>
                  <SelectTrigger><SelectValue placeholder="Sem convênio" /></SelectTrigger>
                  <SelectContent>{covenants.map((covenant) => <SelectItem key={covenant.id} value={covenant.id}>{covenant.number} - {covenant.grantor ?? "Concedente não informado"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="publicityCampaignId">Campanha (opcional)</Label>
                <Select value={formData.publicityCampaignId} onValueChange={value => setFormData({ ...formData, publicityCampaignId: value ?? "" })}>
                  <SelectTrigger><SelectValue placeholder="Sem campanha" /></SelectTrigger>
                  <SelectContent>{publicityCampaigns.map((campaign) => <SelectItem key={campaign.id} value={campaign.id}>{campaign.name} - {campaign.agency ?? "Agência não informada"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fundedDebtId">Dívida fundada (opcional)</Label>
                <Select value={formData.fundedDebtId} onValueChange={value => setFormData({ ...formData, fundedDebtId: value ?? "" })}>
                  <SelectTrigger><SelectValue placeholder="Sem dívida" /></SelectTrigger>
                  <SelectContent>{fundedDebts.map((debt) => <SelectItem key={debt.id} value={debt.id}>{debt.lawNumber} - {debt.creditorName ?? "Credor não informado"}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo</Label>
                <Select value={formData.type} onValueChange={v => setFormData({...formData, type: v as string})}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ordinário">Ordinário</SelectItem>
                    <SelectItem value="Estimativo">Estimativo</SelectItem>
                    <SelectItem value="Global">Global</SelectItem>
                  </SelectContent>
                </Select>
              </div>
                <div className="space-y-2">
                  <Label htmlFor="value">Valor (R$)</Label>
                  <MoneyInput id="value" required value={formData.value} onChange={val => setFormData({...formData, value: val})} />
                </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="appropriationId">Dotação Orçamentária</Label>
              <Select value={formData.appropriationId} onValueChange={v => setFormData({...formData, appropriationId: v as string})}>
                <SelectTrigger><SelectValue placeholder="Selecione a dotação" /></SelectTrigger>
                <SelectContent>
                  {appropriations.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.code} - {a.budgetUnit.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!editingId && (
              <div className="space-y-2">
                 <Label htmlFor="reservationId">Reserva Orçamentária</Label>
                 <Select value={formData.reservationId} onValueChange={v => {
                   const reservation = reservations.find(r => r.id === v);
                   const expense = reservation?.expense;
                   const receipt = expense?.purchaseReceipt;
                   const contract = expense?.sourceModule === "COMPRAS" && expense.sourceType === "CONTRACT" && expense.sourceId
                     ? contracts.find((item) => item.id === expense.sourceId)
                     : null;
                   setFormData({
                     ...formData,
                     reservationId: v as string,
                     appropriationId: reservation?.appropriationId ?? formData.appropriationId,
                     value: reservation?.value ?? formData.value,
                     supplierId: receipt?.contract.supplierId ?? expense?.supplierId ?? formData.supplierId,
                     contractId: receipt?.contractId ?? contract?.id ?? formData.contractId,
                     history: receipt ? `Recebimento ${receipt.number}` : contract ? `AE do contrato ${contract.number}` : formData.history,
                   });
                 }}>
                  <SelectTrigger><SelectValue placeholder="Selecione a reserva ativa" /></SelectTrigger>
                  <SelectContent>
                     {reservations.map(r => (
                       <SelectItem key={r.id} value={r.id}>{r.number} - {r.appropriation.code} - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.value)}{r.expense?.purchaseReceipt ? ` · ${r.expense.purchaseReceipt.number}` : r.expense?.sourceModule === "COMPRAS" && r.expense.sourceType === "CONTRACT" ? " · AE contratual" : ""}</SelectItem>
                     ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
              <Label htmlFor="history">Histórico / Descrição</Label>
              <Input id="history" required value={formData.history} onChange={e => setFormData({...formData, history: e.target.value})} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="processId">Processo (opcional)</Label>
                <Select value={formData.processId} onValueChange={v => setFormData({...formData, processId: v as string})}>
                  <SelectTrigger><SelectValue placeholder="Sem processo" /></SelectTrigger>
                  <SelectContent>
                    {processes.map(process => <SelectItem key={process.id} value={process.id}>{process.protocolNumber}{process.description ? ` - ${process.description}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractId">Contrato (opcional)</Label>
                <Select value={formData.contractId} onValueChange={v => setFormData({...formData, contractId: v as string})}>
                  <SelectTrigger><SelectValue placeholder="Sem contrato" /></SelectTrigger>
                  <SelectContent>
                    {contracts.filter(contract => !formData.supplierId || contract.supplierId === formData.supplierId).map(contract => <SelectItem key={contract.id} value={contract.id}>{contract.number} - {contract.object}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : "Salvar Empenho"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
