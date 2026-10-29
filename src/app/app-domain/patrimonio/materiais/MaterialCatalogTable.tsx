"use client";

import { useState, useTransition } from "react";
import { Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/app-ui/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { deleteMaterialAction, setMaterialActiveAction, updateMaterialAction } from "./catalog-actions";
import { materialUnits, normalizeMaterialUnit } from "@/lib/patrimonio/material-units";

const fields: [string, string, number, number, OperationalColumn["type"]?, OperationalColumn["align"]?][] = [
  ["code", "Código", 90, 65, "identifier"], ["name", "Nome", 180, 95],
  ["description", "Descrição", 160, 65], ["category", "Categoria", 120, 65],
  ["subcategory", "Subclasse", 110, 60], ["status", "Status", 90, 65, "status"],
  ["warehouse", "Almoxarifado", 140, 70], ["cost", "Custo estimado", 110, 75, "text", "right"],
  ["expiration", "Validade/Garantia", 110, 80], ["unit", "Unidade", 60, 48],
  ["minimum", "Mínimo", 70, 55, "text", "right"], ["stock", "Saldo", 80, 55, "text", "right"],
  ["actions", "Ações", 92, 92, "actions", "right"],
];
const columns: OperationalColumn[] = fields.map(([key, label, initialWidth, minWidth, type = "text", align]) => ({
  key, label, initialWidth, minWidth, type, align,
  maxWidth: type === "actions" ? 92 : undefined,
  resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow",
}));

type Category = { id: string; name: string };
type Subcategory = { id: string; categoryId: string; name: string };
type MaterialRow = {
  id: string; code: string; name: string; description: string | null;
  type: "MATERIAL" | "PATRIMONIO"; unitOfMeasure: string; minStock: number;
  categoryId: string; categoryName: string; subcategoryId: string | null; subcategoryName: string | null;
  status: "Ativo" | "Inativo" | "Sem estoque"; totalStock: number;
  warehouseLabel: string; unitCost: number | null; expirationLabel: string;
};

function currency(value: number | null) {
  return value === null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function MaterialCatalogTable({ materials, categories, subcategories, canUpdate, canDelete }: { materials: MaterialRow[]; categories: Category[]; subcategories: Subcategory[]; canUpdate: boolean; canDelete: boolean }) {
  const [editingMaterial, setEditingMaterial] = useState<MaterialRow | null>(null);
  const [editValues, setEditValues] = useState({ description: "", categoryId: "", subcategoryId: "", type: "MATERIAL" as "MATERIAL" | "PATRIMONIO", unitOfMeasure: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit(material: MaterialRow) {
    setEditingMaterial(material);
    setEditValues({ description: material.description || "", categoryId: material.categoryId, subcategoryId: material.subcategoryId ?? "", type: material.type, unitOfMeasure: normalizeMaterialUnit(material.unitOfMeasure) });
    setEditError(null);
  }

  function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingMaterial) return;
    setEditError(null);
    startTransition(async () => {
      const result = await updateMaterialAction(editingMaterial.id, editValues);
      if (result.error) { setEditError(result.error); return; }
      setEditingMaterial(null);
    });
  }

  const rows: OperationalRow[] = materials.map(material => {
    const inactive = material.status === "Inativo";
    const minimum = material.minStock || 0;
    const stock = material.totalStock;
    const stockColor = stock < minimum ? "text-rose-700" : stock <= minimum * 1.2 ? "text-amber-800" : "text-emerald-700";
    return {
      id: material.id, label: `${material.code} · ${material.name}`,
      values: {
        code: material.code, name: material.name, description: material.description || "—",
        category: material.categoryName, subcategory: material.subcategoryName || "—", status: material.status,
        warehouse: material.warehouseLabel, cost: currency(material.unitCost), expiration: material.expirationLabel,
        unit: normalizeMaterialUnit(material.unitOfMeasure), minimum: minimum.toLocaleString("pt-BR"), stock: stock.toLocaleString("pt-BR"),
      },
      cells: { stock: <span className={`font-semibold tabular-nums ${stockColor}`}>{stock.toLocaleString("pt-BR")}</span> },
      actions: (canUpdate || canDelete) ? <div className={styles.rowActions}>
        {canUpdate && <button type="button" aria-label={`Editar ${material.name}`} title="Editar material" onClick={() => startEdit(material)} className={styles.iconButton}><Pencil /></button>}
        {canUpdate && <ConfirmActionDialog title={inactive ? "Reativar material" : "Inativar material"} description={inactive ? `O material “${material.name}” voltará a ficar disponível para novos registros.` : `O material “${material.name}” deixará de ser oferecido para novos registros, preservando seu histórico.`} confirmLabel={inactive ? "Reativar" : "Inativar"} action={() => setMaterialActiveAction(material.id, inactive)} destructive={!inactive} trigger={<button type="button" aria-label={`${inactive ? "Reativar" : "Inativar"} ${material.name}`} title={inactive ? "Reativar material" : "Inativar material"} className={styles.iconButton}>{inactive ? <RotateCcw /> : <Power />}</button>} />}
        {canDelete && <ConfirmActionDialog title="Excluir material" description={`A exclusão de “${material.name}” é permanente e só será concluída se ele não tiver estoque, movimentações ou outros vínculos.`} confirmLabel="Excluir definitivamente" action={() => deleteMaterialAction(material.id)} destructive trigger={<button type="button" aria-label={`Excluir ${material.name}`} title="Excluir material" className={styles.iconButton}><Trash2 /></button>} />}
      </div> : <span>Leitura</span>,
    };
  });

  return <>
    <OperationalTable columns={columns} rows={rows} preferenceId="patrimonio-material-catalog" caption="Estoque de materiais e equipamentos" emptyMessage="Nenhum material encontrado para os filtros informados." />
    <Dialog open={Boolean(editingMaterial)} onOpenChange={open => { if (!open && !isPending) setEditingMaterial(null); }}>
      <DialogContent className="sm:max-w-xl" showCloseButton={!isPending}>
        <DialogHeader><DialogTitle>Editar material</DialogTitle><DialogDescription>{editingMaterial?.code} · {editingMaterial?.name}</DialogDescription></DialogHeader>
        <form onSubmit={saveEdit} className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium">Descrição<textarea rows={4} value={editValues.description} onChange={event => setEditValues(current => ({ ...current, description: event.target.value }))} className="rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">Categoria<select required value={editValues.categoryId} onChange={event => setEditValues(current => ({ ...current, categoryId: event.target.value, subcategoryId: "" }))} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Selecione</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Unidade de medida<select required value={editValues.unitOfMeasure} onChange={event => setEditValues(current => ({ ...current, unitOfMeasure: event.target.value }))} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{!materialUnits.some(unit => unit.value === editValues.unitOfMeasure) && <option value={editValues.unitOfMeasure}>{editValues.unitOfMeasure} — Unidade do registro integrado</option>}{materialUnits.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></label>
          </div>
          <label className="grid gap-1 text-sm font-medium">Subclasse<select value={editValues.subcategoryId} onChange={event => setEditValues({ ...editValues, subcategoryId: event.target.value })} className="h-9 rounded-md border px-3"><option value="">Sem subclasse</option>{subcategories.filter(row => row.categoryId === editValues.categoryId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          {editError && <p role="alert" className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{editError}</p>}
          <DialogFooter><Button type="button" variant="outline" disabled={isPending} onClick={() => setEditingMaterial(null)}>Cancelar</Button><Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar alterações"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
