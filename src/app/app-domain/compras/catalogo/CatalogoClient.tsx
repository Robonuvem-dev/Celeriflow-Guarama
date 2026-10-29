"use client";

import { useState } from "react";
import { Plus, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoneyInput } from "@/components/ui/MoneyInput";
import type { ProcurementItemKind } from "@/lib/compras/shared-catalog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { saveCatalogItem, toggleCatalogItemStatus } from "./actions";
import { ComprasOperationalList, comprasColumn } from "../_components/ComprasOperationalList";
import styles from "@/components/app-ui/operational/operational.module.css";

type CatalogItem = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  estimatedValue: number | null;
  isActive: boolean;
  productKind: string;
  externalCode?: string | null;
};

const columns = [
  comprasColumn("code", "Código", 100, 120, "identifier"), comprasColumn("name", "Nome", 160, 260),
  comprasColumn("kind", "Tipo", 90, 110), comprasColumn("description", "Descrição", 160, 260),
  comprasColumn("category", "Categoria", 100, 140), comprasColumn("unit", "Unidade", 65, 80),
  comprasColumn("value", "Valor estimado", 110, 130, "text", "right"), comprasColumn("status", "Status", 70, 90, "status"),
  comprasColumn("actions", "Ações", 64, 72, "actions"),
];

export default function CatalogoClient({ items, initialKind = "MATERIAL", openNew = false }: { items: CatalogItem[]; initialKind?: ProcurementItemKind; openNew?: boolean }) {
  const [isModalOpen, setIsModalOpen] = useState(openNew);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    productKind: initialKind,
    code: "",
    name: "",
    description: "",
    category: "",
    unit: "UN",
    estimatedValue: 0,
    isActive: true
  });

  const handleOpenNew = () => {
    setEditingId(null);
    setFormData({
      productKind: initialKind,
      code: "",
      name: "",
      description: "",
      category: "",
      unit: "UN",
      estimatedValue: 0,
      isActive: true
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: CatalogItem) => {
    setEditingId(item.id);
    setFormData({
      productKind: (item.productKind === "SERVICO" || item.productKind === "PATRIMONIO" ? item.productKind : "MATERIAL") as ProcurementItemKind,
      code: item.code || "",
      name: item.name,
      description: item.description || "",
      category: item.category || "",
      unit: item.unit,
      estimatedValue: item.estimatedValue || 0,
      isActive: item.isActive
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const dataToSave = {
        id: editingId,
        ...formData
      };
      const result = await saveCatalogItem(dataToSave);
      if (result.success) {
        setIsModalOpen(false);
      } else {
        alert(result.error);
      }
    } catch (error) {
      console.error("Error saving catalog item:", error);
      alert("Ocorreu um erro ao salvar o item do catálogo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    if (window.confirm(`Deseja ${currentStatus ? 'inativar' : 'ativar'} este item?`)) {
      await toggleCatalogItemStatus(id, !currentStatus);
    }
  };

  return (
    <>
      <ComprasOperationalList label="Catálogo de Itens" preferenceId="compras-catalogo" columns={columns}
        description="Materiais e equipamentos compartilham código e cadastro com o Almoxarifado. Serviços não geram estoque."
        actions={<button type="button" className={styles.newButton} onClick={handleOpenNew} aria-label="Novo item" title="Novo item"><Plus /><span className={styles.newLabel}>Novo item</span></button>}
        filters={[
          { key: "kind", label: "Tipo", options: [{ value: "MATERIAL", label: "Materiais" }, { value: "PATRIMONIO", label: "Equipamentos" }, { value: "SERVICO", label: "Serviços a contratar" }] },
          { key: "status", label: "Situação", options: [{ value: "ACTIVE", label: "Ativos" }, { value: "INACTIVE", label: "Inativos" }] },
        ]}
        rows={items.map((item) => ({ id: item.id, label: item.name,
          search: [item.name, item.code, item.category, item.description, item.externalCode].filter(Boolean).join(" "),
          filters: { kind: item.productKind, status: item.isActive ? "ACTIVE" : "INACTIVE" },
          values: { code: item.code || "-", name: item.name, kind: item.productKind === "SERVICO" ? "Serviço" : item.productKind === "PATRIMONIO" ? "Equipamento" : "Material", description: item.description || "Sem descrição", category: item.category || "-", unit: item.unit, value: item.estimatedValue ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.estimatedValue) : "-", status: item.isActive ? "Ativo" : "Inativo" },
          actions: <span className={styles.rowActions}><button type="button" className={styles.iconButton} onClick={() => handleToggleStatus(item.id, item.isActive)} aria-label={`${item.isActive ? "Inativar" : "Ativar"} ${item.name}`} title={item.isActive ? "Inativar" : "Ativar"}>{item.isActive ? <X /> : <Check />}</button><button type="button" className={styles.iconButton} onClick={() => handleOpenEdit(item)} aria-label={`Editar ${item.name}`} title="Editar"><Pencil /></button></span>,
        }))} />

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Item do Catálogo" : "Novo Item do Catálogo"}</DialogTitle>
            <DialogDescription>Preencha as informações do produto, material ou serviço.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="grid gap-1 text-sm font-medium">Tipo do item<select aria-label="Tipo do cadastro" disabled={Boolean(editingId)} value={formData.productKind} onChange={event => setFormData({ ...formData, productKind: event.target.value as ProcurementItemKind, unit: "UN" })} className="h-9 rounded border bg-white px-2"><option value="MATERIAL">Material</option><option value="PATRIMONIO">Equipamento</option><option value="SERVICO">Serviço a contratar</option></select></label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                 <Label htmlFor="code">Código compartilhado</Label>
                 <Input id="code" readOnly value={formData.code} placeholder={formData.productKind === "SERVICO" ? "SRV000001 — automático" : formData.productKind === "PATRIMONIO" ? "EQP000001 — automático" : "MAT000001 — automático"} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Categoria (Opcional)</Label>
                <Input id="category" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} placeholder="Ex: Material de Expediente" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Item *</Label>
              <Input id="name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: Papel Sulfite A4" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição Detalhada</Label>
              <Textarea id="description" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Especificações técnicas ou detalhes adicionais..." className="min-h-[80px]" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">Unidade de Medida *</Label>
                 <Input id="unit" required value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} placeholder={formData.productKind === "SERVICO" ? "Ex.: H, DIA, MES ou UN" : "UN, KG, m ou KT"} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedValue">Valor Estimado (R$)</Label>
                <MoneyInput id="estimatedValue" value={formData.estimatedValue} onChange={val => setFormData({...formData, estimatedValue: val})} />
              </div>
            </div>

            <div className="space-y-2 flex items-center gap-2 pt-2">
              <input type="checkbox" id="isActive" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="rounded border-slate-300" />
              <Label htmlFor="isActive" className="mb-0 cursor-pointer">Item Ativo no Catálogo</Label>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Salvando..." : "Salvar Item"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
