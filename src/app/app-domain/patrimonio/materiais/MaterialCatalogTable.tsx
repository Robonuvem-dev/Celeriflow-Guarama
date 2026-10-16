"use client";

import { useEffect, useState, useTransition } from "react";
import { FileText, Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/app-ui/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteMaterialAction, setMaterialActiveAction, updateMaterialAction } from "./catalog-actions";
import { materialUnits, normalizeMaterialUnit } from "@/lib/patrimonio/material-units";

const columns = [
  { label: "Código", width: 120 }, { label: "Nome", width: 240 },
  { label: "Det.", width: 55 }, { label: "Categoria", width: 180 },
  { label: "Status", width: 110 }, { label: "Almoxarifado", width: 190 },
  { label: "Custo est.", width: 110 }, { label: "Validade/Garantia", width: 140 },
  { label: "Un.", width: 65 }, { label: "Mínimo", width: 80 },
  { label: "Saldo", width: 85 }, { label: "Ações", width: 110 },
];
const widthsStorageKey = "almoxarifado-material-column-widths-v1";

type Category = { id: string; name: string };
type Subcategory = { id: string; categoryId: string; name: string };
type MaterialRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: "MATERIAL" | "PATRIMONIO";
  unitOfMeasure: string;
  minStock: number;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  status: "Ativo" | "Inativo" | "Sem estoque";
  totalStock: number;
  warehouseLabel: string;
  unitCost: number | null;
  expirationLabel: string;
};

function currency(value: number | null) {
  return value === null ? "-" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function MaterialCatalogTable({ materials, categories, subcategories, canUpdate, canDelete }: { materials: MaterialRow[]; categories: Category[]; subcategories: Subcategory[]; canUpdate: boolean; canDelete: boolean }) {
  const [descriptionMaterial, setDescriptionMaterial] = useState<MaterialRow | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<MaterialRow | null>(null);
  const [editValues, setEditValues] = useState({ description: "", categoryId: "", subcategoryId: "", type: "MATERIAL" as "MATERIAL" | "PATRIMONIO", unitOfMeasure: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [widths, setWidths] = useState(columns.map(column => column.width));

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(widthsStorageKey) || "null");
        if (Array.isArray(saved) && saved.length === columns.length && saved.every(width => typeof width === "number" && width >= 50 && width <= 800)) setWidths(saved);
      } catch { /* Usa as larguras padrão quando o armazenamento não estiver disponível. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function storeWidths(next: number[]) {
    try { localStorage.setItem(widthsStorageKey, JSON.stringify(next)); } catch { /* O ajuste permanece nesta sessão. */ }
  }

  function resizeColumn(index: number, event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = widths[index];
    let next = widths;
    const move = (pointer: PointerEvent) => {
      next = widths.map((width, position) => position === index ? Math.min(800, Math.max(50, startWidth + pointer.clientX - startX)) : width);
      setWidths(next);
    };
    const finish = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("lostpointercapture", finish);
      storeWidths(next);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("lostpointercapture", finish);
  }

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
      if (result.error) {
        setEditError(result.error);
        return;
      }
      setEditingMaterial(null);
    });
  }

  return (
    <>
      <table style={{ width: widths.reduce((sum, width) => sum + width, 0) }} className="table-fixed text-left text-[11px] leading-4 text-slate-700">
        <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
        <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <tr className="h-7">
            {columns.map((column, index) => <th key={column.label} className="relative overflow-hidden px-3 text-left">
              <span className="block truncate">{column.label}</span>
              <button type="button" aria-label={`Ajustar largura da coluna ${column.label}`} title="Arraste para ajustar; use as setas para ajuste fino; clique duas vezes para restaurar" onPointerDown={event => resizeColumn(index, event)} onDoubleClick={() => { const next = widths.map((width, position) => position === index ? column.width : width); setWidths(next); storeWidths(next); }} onKeyDown={event => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const next = widths.map((width, position) => position === index ? Math.min(800, Math.max(50, width + (event.key === "ArrowRight" ? 10 : -10))) : width);
                setWidths(next); storeWidths(next);
              }} className="absolute inset-y-0 right-0 w-2 touch-none cursor-col-resize border-r border-slate-300 hover:bg-emerald-200 focus-visible:bg-emerald-200" />
            </th>)}
          </tr>
        </thead>
        <tbody>
          {materials.length === 0 ? <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-500">Nenhum material encontrado para os filtros informados.</td></tr> : materials.map((material) => {
            const inactive = material.status === "Inativo";
            const minStock = material.minStock || 0;
            const stock = material.totalStock;

            let stockColorClass = "text-emerald-700 bg-emerald-50 border-emerald-200";
            if (stock < minStock) {
              stockColorClass = "text-rose-700 bg-rose-50 border-rose-200 font-bold";
            } else if (stock <= minStock * 1.2) {
              stockColorClass = "text-amber-800 bg-amber-50 border-amber-200 font-bold";
            }

            return (
              <tr key={material.id} className="h-7 border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-0 font-semibold text-emerald-800"><span className="block truncate">{material.code}</span></td>
                <td className="px-3 py-0 font-medium"><span className="block truncate">{material.name}</span></td>
                <td className="px-1 py-0 text-center"><button type="button" aria-label={`Ver descrição de ${material.name}`} title="Ver descrição detalhada" onClick={() => setDescriptionMaterial(material)} className="inline-flex size-6 items-center justify-center rounded text-slate-500 outline-none hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600"><FileText className="size-3.5" /></button></td>
                <td className="px-3 py-0"><span className="block truncate">{material.categoryName}{material.subcategoryName ? ` / ${material.subcategoryName}` : ""}</span></td>
                <td className="px-3 py-0"><span className={`font-semibold ${material.status === "Ativo" ? "text-emerald-700" : material.status === "Inativo" ? "text-rose-700" : "text-amber-700"}`}>{material.status}</span></td>
                <td className="px-3 py-0"><span className="block truncate">{material.warehouseLabel}</span></td>
                <td className="px-3 py-0 text-right tabular-nums">{currency(material.unitCost)}</td>
                <td className="px-2 py-0 tabular-nums"><span className="block truncate">{material.expirationLabel}</span></td>
                <td className="px-2 py-0 text-center font-semibold text-slate-600">{normalizeMaterialUnit(material.unitOfMeasure)}</td>
                <td className="px-2 py-0 text-center tabular-nums text-slate-500">{minStock.toLocaleString("pt-BR")}</td>
                <td className="px-2 py-0 text-center tabular-nums">
                  <span className={`inline-block rounded border px-2 py-0.5 text-center text-xs tabular-nums ${stockColorClass}`}>
                    {stock.toLocaleString("pt-BR")}
                  </span>
                </td>
                <td className="px-2 py-0">
                  {(canUpdate || canDelete) ? <div className="flex items-center justify-end gap-0.5">
                    {canUpdate && <button type="button" aria-label={`Editar ${material.name}`} title="Editar material" onClick={() => startEdit(material)} className="inline-flex size-7 items-center justify-center rounded text-slate-500 outline-none hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-600"><Pencil className="size-3.5" /></button>}
                    {canUpdate && <ConfirmActionDialog title={inactive ? "Reativar material" : "Inativar material"} description={inactive ? `O material “${material.name}” voltará a ficar disponível para novos registros.` : `O material “${material.name}” deixará de ser oferecido para novos registros, preservando seu histórico.`} confirmLabel={inactive ? "Reativar" : "Inativar"} action={() => setMaterialActiveAction(material.id, inactive)} destructive={!inactive} trigger={<button type="button" aria-label={`${inactive ? "Reativar" : "Inativar"} ${material.name}`} title={inactive ? "Reativar material" : "Inativar material"} className={`inline-flex size-7 items-center justify-center rounded outline-none focus-visible:ring-2 ${inactive ? "text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-emerald-600" : "text-slate-500 hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-rose-600"}`}>{inactive ? <RotateCcw className="size-3.5" /> : <Power className="size-3.5" />}</button>} />}
                    {canDelete && <ConfirmActionDialog title="Excluir material" description={`A exclusão de “${material.name}” é permanente e só será concluída se ele não tiver estoque, movimentações ou outros vínculos.`} confirmLabel="Excluir definitivamente" action={() => deleteMaterialAction(material.id)} destructive trigger={<button type="button" aria-label={`Excluir ${material.name}`} title="Excluir material" className="inline-flex size-7 items-center justify-center rounded text-slate-500 outline-none hover:bg-rose-50 hover:text-rose-700 focus-visible:ring-2 focus-visible:ring-rose-600"><Trash2 className="size-3.5" /></button>} />}
                  </div> : <span className="text-[10px] text-slate-400">Leitura</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Dialog open={Boolean(descriptionMaterial)} onOpenChange={(open) => { if (!open) setDescriptionMaterial(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ficha do material</DialogTitle>
            <DialogDescription>{descriptionMaterial?.code} · {descriptionMaterial?.name}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 text-xs text-slate-700">
            <div className="rounded border bg-slate-50 p-2.5">
              <span className="font-semibold text-slate-900 block mb-1">Descrição detalhada:</span>
              <p className="whitespace-pre-wrap">{descriptionMaterial?.description || "Nenhuma descrição detalhada foi cadastrada."}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded border p-2.5 bg-white">
              <div><span className="text-slate-500 block">Categoria:</span> <span className="font-semibold">{descriptionMaterial?.categoryName}</span></div>
               <div><span className="text-slate-500 block">Unidade de medida:</span> <span className="font-semibold">{descriptionMaterial ? normalizeMaterialUnit(descriptionMaterial.unitOfMeasure) : ""}</span></div>
              <div><span className="text-slate-500 block">Estoque mínimo:</span> <span className="font-semibold">{descriptionMaterial?.minStock}</span></div>
              <div><span className="text-slate-500 block">Saldo atual:</span> <span className="font-semibold">{descriptionMaterial?.totalStock}</span></div>
              <div><span className="text-slate-500 block">Custo estimado:</span> <span className="font-semibold">{currency(descriptionMaterial?.unitCost ?? null)}</span></div>
              <div><span className="text-slate-500 block">Validade/Garantia:</span> <span className="font-semibold">{descriptionMaterial?.expirationLabel}</span></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingMaterial)} onOpenChange={(open) => { if (!open && !isPending) setEditingMaterial(null); }}>
        <DialogContent className="sm:max-w-xl" showCloseButton={!isPending}>
          <DialogHeader><DialogTitle>Editar material</DialogTitle><DialogDescription>{editingMaterial?.code} · {editingMaterial?.name}</DialogDescription></DialogHeader>
          <form onSubmit={saveEdit} className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">Descrição<textarea rows={4} value={editValues.description} onChange={(event) => setEditValues((current) => ({ ...current, description: event.target.value }))} className="rounded-md border border-input bg-background px-3 py-2 text-sm" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">Categoria<select required value={editValues.categoryId} onChange={(event) => setEditValues((current) => ({ ...current, categoryId: event.target.value, subcategoryId: "" }))} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="">Selecione</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-medium">Unidade de medida<select required value={editValues.unitOfMeasure} onChange={(event) => setEditValues((current) => ({ ...current, unitOfMeasure: event.target.value }))} className="h-9 rounded-md border border-input bg-background px-3 text-sm">{!materialUnits.some(unit => unit.value === editValues.unitOfMeasure) && <option value={editValues.unitOfMeasure}>{editValues.unitOfMeasure} — Unidade do registro integrado</option>}{materialUnits.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></label>
            </div>
            <label className="grid gap-1 text-sm font-medium">Subclasse<select value={editValues.subcategoryId} onChange={event => setEditValues({ ...editValues, subcategoryId: event.target.value })} className="h-9 rounded-md border px-3"><option value="">Sem subclasse</option>{subcategories.filter(row => row.categoryId === editValues.categoryId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            {editError && <p role="alert" className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{editError}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={isPending} onClick={() => setEditingMaterial(null)}>Cancelar</Button><Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar alterações"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
