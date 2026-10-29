"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { actionCreateCreditRequest } from "./planejamento-actions";
import { PlusCircle, ShieldAlert } from "lucide-react";
import FinanceTablePanel from "../FinanceTablePanel";
import { financeColumn } from "../operational-columns";
import { creditItemsError, draftField } from "../draft-rows";

type AppropriationOption = {
  id: string;
  code: string;
  availableValue: number;
};

type CreditItem = {
  appropriationId: string;
  type: "Acréscimo" | "Anulação";
  value: number;
};
type ResourceSourceOption = { id: string; code: string; name: string };
type LegalDocumentOption = { id: string; title: string };

export function CreditRequestDialog({
  financialYearId,
  appropriations,
  resourceSources,
  legalDocuments,
}: {
  financialYearId: string;
  appropriations: AppropriationOption[];
  resourceSources: ResourceSourceOption[];
  legalDocuments: LegalDocumentOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [number, setNumber] = useState("");
  const [type, setType] = useState<"Suplementar" | "Especial" | "Extraordinário" | "Remanejamento" | "Transposição" | "Transferência">("Suplementar");
  const [lawNumber, setLawNumber] = useState("");
  const [legalActDate, setLegalActDate] = useState("");
  const [legalDocumentId, setLegalDocumentId] = useState("");
  const [fundingSourceId, setFundingSourceId] = useState("");
  const [justification, setJustification] = useState("");
  const [items, setItems] = useState<CreditItem[]>([
    { appropriationId: "", type: "Acréscimo", value: 0 },
  ]);

  const addItem = () => {
    setItems([...items, { appropriationId: "", type: "Acréscimo", value: 0 }]);
  };

  const updateItem = <K extends keyof CreditItem>(index: number, field: K, value: CreditItem[K]) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    setItems(next);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = creditItemsError(items);
    if (error) { alert(error); return; }
    setPending(true);

    const result = await actionCreateCreditRequest({
      number,
      financialYearId,
      type,
      lawNumber: lawNumber || undefined,
      legalActNumber: lawNumber,
      legalActDate,
      legalDocumentId,
      fundingSourceId,
      justification,
      items,
    });

    setPending(false);

    if (result.error) {
      alert(result.error);
      return;
    }

    setOpen(false);
    setNumber("");
    setJustification("");
    setItems([{ appropriationId: "", type: "Acréscimo", value: 0 }]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">
        <PlusCircle className="h-4 w-4" /> Solicitar Crédito Adicional
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Nova Solicitação de Crédito Adicional
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Número do Crédito</Label>
              <Input
                required
                placeholder="Ex: CA-001/2026"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Crédito</Label>
                <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Suplementar">Suplementar</SelectItem>
                  <SelectItem value="Especial">Especial</SelectItem>
                  <SelectItem value="Extraordinário">Extraordinário</SelectItem>
                  <SelectItem value="Remanejamento">Remanejamento</SelectItem>
                  <SelectItem value="Transposição">Transposição</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Lei / Decreto Autorizador</Label>
            <Input
              placeholder="Ex: Lei Municipal N.º 1.420/2026"
              value={lawNumber}
              onChange={(e) => setLawNumber(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2"><Label>Data do Ato Legal</Label><Input required type="date" value={legalActDate} onChange={(e) => setLegalActDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Fonte de Recursos</Label><Select value={fundingSourceId} onValueChange={(value) => setFundingSourceId(value ?? "")}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{resourceSources.map((source) => <SelectItem key={source.id} value={source.id}>{source.code} - {source.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label>Documento GED Final</Label><Select value={legalDocumentId} onValueChange={(value) => setLegalDocumentId(value ?? "")}><SelectTrigger><SelectValue placeholder="Selecione o ato finalizado" /></SelectTrigger><SelectContent>{legalDocuments.map((document) => <SelectItem key={document.id} value={document.id}>{document.title}</SelectItem>)}</SelectContent></Select></div>

          <div className="space-y-2">
            <Label>Justificativa Legal / Técnica</Label>
            <Input
              required
              placeholder="Descreva o motivo e a necessidade da alteração orçamentária"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
            />
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Itens da Alteração (Acréscimos e Anulações)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                + Adicionar Item
              </Button>
            </div>

            <FinanceTablePanel label="Itens da alteração orçamentária" preferenceId="financeiro-credito-itens-rascunho" searchable={false}
              columns={[financeColumn("appropriation", "Dotação", 150, 450), financeColumn("type", "Tipo", 120, 250), financeColumn("value", "Valor", 100, 200), financeColumn("actions", "Ações", 80, 80, "actions")]}
              rows={items.map((item, index) => ({ id: String(index), label: `Item ${index + 1}`, values: { appropriation: appropriations.find(row => row.id === item.appropriationId)?.code ?? item.appropriationId, type: item.type, value: String(item.value) }, cells: {
                appropriation: <select aria-label={`Dotação ${index + 1}`} className={draftField} disabled={pending} value={item.appropriationId} onChange={event => updateItem(index, "appropriationId", event.target.value)}><option value="">Selecione a Dotação</option>{appropriations.map(row => <option key={row.id} value={row.id}>{row.code}</option>)}</select>,
                type: <select aria-label={`Tipo ${index + 1}`} className={draftField} disabled={pending} value={item.type} onChange={event => updateItem(index, "type", event.target.value as CreditItem["type"])}><option value="Acréscimo">Acréscimo (+)</option><option value="Anulação">Anulação (-)</option></select>,
                value: <MoneyInput aria-label={`Valor ${index + 1}`} className={draftField} disabled={pending} value={item.value} onChange={value => updateItem(index, "value", value)} />,
              }, actions: <button type="button" disabled={pending || items.length === 1} onClick={() => removeItem(index)}>Remover</button> }))} />
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando..." : "Submeter para Aprovação"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
