"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpDown, Boxes, ExternalLink, History, Maximize2, Minimize2, Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/app-ui/ConfirmActionDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { deleteMaterialAction, setMaterialActiveAction, updateMaterialAction } from "./catalog-actions";
import { materialUnits, normalizeMaterialUnit } from "@/lib/patrimonio/material-units";

const fields: [string, string, number, number, OperationalColumn["type"]?, OperationalColumn["align"]?][] = [
  ["code", "Código", 90, 65, "identifier"],
  ["name", "Nome", 170, 95],
  ["materials", "Materiais", 90, 75],
  ["movements", "Movimentações", 110, 85],
  ["description", "Descrição", 140, 65],
  ["category", "Categoria", 110, 65],
  ["subcategory", "Subclasse", 100, 60],
  ["status", "Status", 85, 65, "status"],
  ["warehouse", "Almoxarifado", 130, 70],
  ["cost", "Custo estimado", 100, 75, "text", "right"],
  ["expiration", "Validade/Garantia", 100, 80],
  ["unit", "Unidade", 60, 48],
  ["minimum", "Mínimo", 70, 55, "text", "right"],
  ["stock", "Saldo", 75, 55, "text", "right"],
  ["actions", "Ações", 115, 115, "actions", "right"],
];

const columns: OperationalColumn[] = fields.map(([key, label, initialWidth, minWidth, type = "text", align]) => ({
  key,
  label,
  initialWidth,
  minWidth,
  type,
  align,
  maxWidth: type === "actions" ? 120 : undefined,
  resizable: type !== "actions",
  sortable: false,
  details: type === "actions" ? "none" : "overflow",
}));

type Category = { id: string; name: string };
type Subcategory = { id: string; categoryId: string; name: string };
export type MaterialRow = {
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

type AnalyticalMovement = {
  id: string;
  date: string;
  type: string;
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  notes: string;
  warehouseName: string;
  batchNumber: string;
};

type VirtualStockItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  batchNumber?: string | null;
};

function currency(value: number | null) {
  return value === null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function MaterialCatalogTable({
  materials,
  categories,
  subcategories,
  canUpdate,
  canDelete,
  periodStart = "",
  periodEnd = "",
}: {
  materials: MaterialRow[];
  categories: Category[];
  subcategories: Subcategory[];
  canUpdate: boolean;
  canDelete: boolean;
  periodStart?: string;
  periodEnd?: string;
}) {
  const [editingMaterial, setEditingMaterial] = useState<MaterialRow | null>(null);
  const [editValues, setEditValues] = useState({
    description: "",
    categoryId: "",
    subcategoryId: "",
    type: "MATERIAL" as "MATERIAL" | "PATRIMONIO",
    unitOfMeasure: "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [movementMaterial, setMovementMaterial] = useState<MaterialRow | null>(null);
  const [movements, setMovements] = useState<AnalyticalMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);

  const [historyMaterial, setHistoryMaterial] = useState<MaterialRow | null>(null);

  const [virtualMaterial, setVirtualMaterial] = useState<MaterialRow | null>(null);
  const [virtualStock, setVirtualStock] = useState<VirtualStockItem[]>([]);
  const [loadingVirtual, setLoadingVirtual] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!movementMaterial) {
      setMovements([]);
      return;
    }
    let cancelled = false;
    setLoadingMovements(true);
    const query = new URLSearchParams({
      materialId: movementMaterial.id,
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
    });
    fetch(`/api/patrimonio/movimentacoes-material?${query.toString()}`)
      .then((res) => (res.ok ? res.json() : { movements: [] }))
      .then((data) => {
        if (!cancelled) {
          setMovements(data.movements || []);
          setLoadingMovements(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingMovements(false);
      });
    return () => {
      cancelled = true;
    };
  }, [movementMaterial, periodStart, periodEnd]);

  useEffect(() => {
    if (!virtualMaterial) {
      setVirtualStock([]);
      return;
    }
    let cancelled = false;
    setLoadingVirtual(true);
    fetch(`/api/patrimonio/estoque-virtual?materialId=${encodeURIComponent(virtualMaterial.id)}`)
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        if (!cancelled) {
          setVirtualStock(data.items || []);
          setLoadingVirtual(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingVirtual(false);
      });
    return () => {
      cancelled = true;
    };
  }, [virtualMaterial]);

  function startEdit(material: MaterialRow) {
    setEditingMaterial(material);
    setEditValues({
      description: material.description || "",
      categoryId: material.categoryId,
      subcategoryId: material.subcategoryId ?? "",
      type: material.type,
      unitOfMeasure: normalizeMaterialUnit(material.unitOfMeasure),
    });
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

  const rows: OperationalRow[] = materials.map((material) => {
    const inactive = material.status === "Inativo";
    const minimum = material.minStock || 0;
    const stock = material.totalStock;
    const stockColor =
      stock < minimum ? "text-rose-700" : stock <= minimum * 1.2 ? "text-amber-800" : "text-emerald-700";

    return {
      id: material.id,
      label: `${material.code} · ${material.name}`,
      values: {
        code: material.code,
        name: material.name,
        materials: "Ver",
        movements: "Ver",
        description: material.description || "—",
        category: material.categoryName,
        subcategory: material.subcategoryName || "—",
        status: material.status,
        warehouse: material.warehouseLabel,
        cost: currency(material.unitCost),
        expiration: material.expirationLabel,
        unit: normalizeMaterialUnit(material.unitOfMeasure),
        minimum: minimum.toLocaleString("pt-BR"),
        stock: stock.toLocaleString("pt-BR"),
      },
      cells: {
        materials: (
          <button
            type="button"
            onClick={() => {
              setVirtualMaterial(material);
              setIsFullScreen(false);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
            title="Ver saldo em estoque virtual"
          >
            <Boxes className="size-3.5" />
            Materiais
          </button>
        ),
        movements: (
          <button
            type="button"
            onClick={() => setMovementMaterial(material)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0e4c7e] hover:underline"
            title="Ver movimentações analíticas"
          >
            Ver
          </button>
        ),
        stock: <span className={`font-semibold tabular-nums ${stockColor}`}>{stock.toLocaleString("pt-BR")}</span>,
      },
      actions: (
        <div className={styles.rowActions}>
          <button
            type="button"
            aria-label={`Histórico de ${material.name}`}
            title="Ver conversões de unidade e histórico de alterações"
            onClick={() => setHistoryMaterial(material)}
            className={styles.iconButton}
          >
            <History className="size-4 text-slate-600" />
          </button>
          {canUpdate && (
            <button
              type="button"
              aria-label={`Editar ${material.name}`}
              title="Editar material"
              onClick={() => startEdit(material)}
              className={styles.iconButton}
            >
              <Pencil />
            </button>
          )}
          {canUpdate && (
            <ConfirmActionDialog
              title={inactive ? "Reativar material" : "Inativar material"}
              description={
                inactive
                  ? `O material “${material.name}” voltará a ficar disponível para novos registros.`
                  : `O material “${material.name}” deixará de ser oferecido para novos registros, preservando seu histórico.`
              }
              confirmLabel={inactive ? "Reativar" : "Inativar"}
              action={() => setMaterialActiveAction(material.id, inactive)}
              destructive={!inactive}
              trigger={
                <button
                  type="button"
                  aria-label={`${inactive ? "Reativar" : "Inativar"} ${material.name}`}
                  title={inactive ? "Reativar material" : "Inativar material"}
                  className={styles.iconButton}
                >
                  {inactive ? <RotateCcw /> : <Power />}
                </button>
              }
            />
          )}
          {canDelete && (
            <ConfirmActionDialog
              title="Excluir material"
              description={`A exclusão de “${material.name}” é permanente e só será concluída se ele não tiver estoque, movimentações ou outros vínculos.`}
              confirmLabel="Excluir definitivamente"
              action={() => deleteMaterialAction(material.id)}
              destructive
              trigger={
                <button
                  type="button"
                  aria-label={`Excluir ${material.name}`}
                  title="Excluir material"
                  className={styles.iconButton}
                >
                  <Trash2 />
                </button>
              }
            />
          )}
        </div>
      ),
    };
  });

  return (
    <>
      <OperationalTable
        columns={columns}
        rows={rows}
        preferenceId="patrimonio-material-catalog"
        caption="Estoque de materiais e equipamentos"
        emptyMessage="Nenhum material encontrado para os filtros informados."
      />

      {/* Modal 1: Movimentações Analíticas do Material (15.1) */}
      <Dialog open={Boolean(movementMaterial)} onOpenChange={(open) => { if (!open) setMovementMaterial(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader className="border-b pb-2">
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpDown className="size-4 text-[#0e4c7e]" />
              Movimentações Analíticas — {movementMaterial?.name} ({movementMaterial?.code})
            </DialogTitle>
            <DialogDescription>
              {periodStart || periodEnd
                ? `Exibindo movimentações no período de ${periodStart || "início"} até ${periodEnd || "hoje"}`
                : "Todas as movimentações analíticas registradas para este material."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto py-2">
            {loadingMovements ? (
              <p className="p-4 text-center text-xs text-slate-500">Buscando movimentações analíticas...</p>
            ) : movements.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500">
                Nenhuma movimentação registrada para este material no período informado.
              </p>
            ) : (
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase text-slate-500 sticky top-0">
                  <tr>
                    <th className="p-2">Data/Hora</th>
                    <th className="p-2">Tipo</th>
                    <th className="p-2">Almoxarifado</th>
                    <th className="p-2 text-right">Qtd</th>
                    <th className="p-2 text-right">Custo Unit.</th>
                    <th className="p-2 text-right">Custo Total</th>
                    <th className="p-2">Lote</th>
                    <th className="p-2">Obs</th>
                    <th className="p-2">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-50/50">
                      <td className="p-2 whitespace-nowrap">{mov.date}</td>
                      <td className="p-2 font-semibold">{mov.type}</td>
                      <td className="p-2">{mov.warehouseName}</td>
                      <td className="p-2 text-right font-bold">{mov.quantity}</td>
                      <td className="p-2 text-right">{mov.unitCost ? currency(mov.unitCost) : "—"}</td>
                      <td className="p-2 text-right font-medium">{mov.totalCost ? currency(mov.totalCost) : "—"}</td>
                      <td className="p-2">{mov.batchNumber}</td>
                      <td className="p-2 truncate max-w-xs">{mov.notes}</td>
                      <td className="p-2">
                        <Link
                          href={`/patrimonio/materiais/movimentos/${encodeURIComponent(mov.id)}`}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                        >
                          <ExternalLink className="size-3" />
                          Detalhes
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t">
            <button
              type="button"
              onClick={() => setMovementMaterial(null)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Conversões de Unidade e Histórico de Alterações (15.5) */}
      <Dialog open={Boolean(historyMaterial)} onOpenChange={(open) => { if (!open) setHistoryMaterial(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-4 text-indigo-600" />
              Conversões de Unidade e Histórico — {historyMaterial?.name}
            </DialogTitle>
            <DialogDescription>
              Código: {historyMaterial?.code} • Categoria: {historyMaterial?.categoryName}
            </DialogDescription>
          </DialogHeader>

          {historyMaterial && (
            <div className="space-y-4 text-xs text-slate-700">
              <div className="rounded border border-indigo-100 bg-indigo-50/50 p-3">
                <h4 className="font-bold text-indigo-900 mb-2">Conversão e Unidades de Medida</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase text-slate-500">Unidade Base (Estoque)</span>
                    <span className="font-semibold text-slate-900">{normalizeMaterialUnit(historyMaterial.unitOfMeasure)}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase text-slate-500">Estoque Mínimo Definido</span>
                    <span className="font-semibold text-slate-900">{historyMaterial.minStock} {historyMaterial.unitOfMeasure}</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase text-slate-500">Fator de Conversão Padrão</span>
                    <span className="text-slate-800">1:1 (Equivalência direta na dispensação)</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase text-slate-500">Status no Cadastro</span>
                    <span className="font-semibold text-slate-800">{historyMaterial.status}</span>
                  </div>
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white p-3">
                <h4 className="font-bold text-slate-800 mb-2">Registro de Alterações do Material</h4>
                <ul className="space-y-2 border-l-2 border-slate-200 pl-3">
                  <li className="relative">
                    <span className="block text-[10px] text-slate-400">Parâmetros Atuais</span>
                    <p className="font-medium text-slate-800">
                      Saldo em estoque: {historyMaterial.totalStock} {historyMaterial.unitOfMeasure} • Custo estimado: {currency(historyMaterial.unitCost)}
                    </p>
                    <p className="text-[11px] text-slate-500">Almoxarifados alocados: {historyMaterial.warehouseLabel}</p>
                  </li>
                  <li className="relative">
                    <span className="block text-[10px] text-slate-400">Classificação</span>
                    <p className="text-slate-700">
                      Subclasse: {historyMaterial.subcategoryName || "Sem subclasse"} • Validade: {historyMaterial.expirationLabel}
                    </p>
                  </li>
                </ul>
              </div>

              <div className="flex justify-end pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setHistoryMaterial(null)}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal 3: Estoque Virtual e Materiais Vinculados (15.54) */}
      <Dialog
        open={Boolean(virtualMaterial)}
        onOpenChange={(open) => {
          if (!open) {
            setVirtualMaterial(null);
            setIsFullScreen(false);
          }
        }}
      >
        <DialogContent
          className={
            isFullScreen
              ? "fixed inset-2 max-w-none w-auto h-auto flex flex-col p-4 bg-white z-50 overflow-hidden"
              : "max-w-3xl max-h-[85vh] flex flex-col"
          }
        >
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <Boxes className="size-4 text-emerald-600" />
                Estoque Virtual — {virtualMaterial?.name} ({virtualMaterial?.code})
              </DialogTitle>
              <DialogDescription>
                Consulta de saldos físico, reservado e disponível para o material nos almoxarifados.
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => setIsFullScreen((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {isFullScreen ? (
                <>
                  <Minimize2 className="size-3.5" />
                  Restaurar
                </>
              ) : (
                <>
                  <Maximize2 className="size-3.5" />
                  Tela Cheia
                </>
              )}
            </button>
          </DialogHeader>

          <div className="flex-1 overflow-auto py-2">
            {loadingVirtual ? (
              <p className="p-4 text-center text-xs text-slate-500">Carregando estoque virtual...</p>
            ) : virtualStock.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500">Nenhum estoque virtual disponível para o material.</p>
            ) : (
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase text-slate-500 sticky top-0">
                  <tr>
                    <th className="p-2">Código</th>
                    <th className="p-2">Material</th>
                    <th className="p-2">Unidade</th>
                    <th className="p-2">Lote</th>
                    <th className="p-2 text-right">Saldo Físico</th>
                    <th className="p-2 text-right">Reservado</th>
                    <th className="p-2 text-right">Disponível Virtual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {virtualStock.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50/50">
                      <td className="p-2 font-mono font-medium">{it.code}</td>
                      <td className="p-2 font-semibold text-slate-900">{it.name}</td>
                      <td className="p-2">{it.unit}</td>
                      <td className="p-2">{it.batchNumber || "—"}</td>
                      <td className="p-2 text-right font-medium">{it.physicalQuantity}</td>
                      <td className="p-2 text-right text-amber-600 font-medium">{it.reservedQuantity}</td>
                      <td className="p-2 text-right text-emerald-700 font-bold">{it.availableQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t">
            <button
              type="button"
              onClick={() => {
                setVirtualMaterial(null);
                setIsFullScreen(false);
              }}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Edição Básica */}
      <Dialog
        open={Boolean(editingMaterial)}
        onOpenChange={(open) => {
          if (!open && !isPending) setEditingMaterial(null);
        }}
      >
        <DialogContent className="sm:max-w-xl" showCloseButton={!isPending}>
          <DialogHeader>
            <DialogTitle>Editar material</DialogTitle>
            <DialogDescription>
              {editingMaterial?.code} · {editingMaterial?.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} className="grid gap-3">
            <label className="grid gap-1 text-sm font-medium">
              Descrição
              <textarea
                rows={4}
                value={editValues.description}
                onChange={(event) =>
                  setEditValues((current) => ({ ...current, description: event.target.value }))
                }
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Categoria
                <select
                  required
                  value={editValues.categoryId}
                  onChange={(event) =>
                    setEditValues((current) => ({
                      ...current,
                      categoryId: event.target.value,
                      subcategoryId: "",
                    }))
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Selecione</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Unidade de medida
                <select
                  required
                  value={editValues.unitOfMeasure}
                  onChange={(event) =>
                    setEditValues((current) => ({ ...current, unitOfMeasure: event.target.value }))
                  }
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {!materialUnits.some((unit) => unit.value === editValues.unitOfMeasure) && (
                    <option value={editValues.unitOfMeasure}>
                      {editValues.unitOfMeasure} — Unidade do registro integrado
                    </option>
                  )}
                  {materialUnits.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              Subclasse
              <select
                value={editValues.subcategoryId}
                onChange={(event) =>
                  setEditValues({ ...editValues, subcategoryId: event.target.value })
                }
                className="h-9 rounded-md border px-3"
              >
                <option value="">Sem subclasse</option>
                {subcategories
                  .filter((row) => row.categoryId === editValues.categoryId)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </label>
            {editError && (
              <p
                role="alert"
                className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
              >
                {editError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setEditingMaterial(null)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
