"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Boxes, MapPin, Maximize2, Minimize2, Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/app-ui/ConfirmActionDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteWarehouseAction, setWarehouseActiveAction } from "./actions";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

const columns = operationalColumns([
  ["name", "Nome", 210, 120, "identifier"],
  ["type", "Tipo", 100, 75],
  ["materials", "Materiais", 100, 80],
  ["address", "Endereço", 90, 75],
  ["manager", "Responsável", 180, 110],
  ["costCenter", "Centro de custo", 170, 110],
  ["status", "Situação", 90, 75, "status"],
  ["actions", "Ações", 100, 100, "actions", "right"],
]);

type WarehouseRow = {
  id: string;
  name: string;
  type: string;
  address: string | null;
  zipCode: string | null;
  streetName: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  isActive: boolean;
  managerName: string | null;
  costCenterName: string | null;
};

type MaterialStockItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  batchNumber?: string | null;
};

export function WarehouseTable({
  warehouses,
  canUpdate,
  canDelete,
}: {
  warehouses: WarehouseRow[];
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const [addressWarehouse, setAddressWarehouse] = useState<WarehouseRow | null>(null);
  const [stockWarehouse, setStockWarehouse] = useState<WarehouseRow | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [stockItems, setStockItems] = useState<MaterialStockItem[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);

  useEffect(() => {
    if (!stockWarehouse) {
      setStockItems([]);
      return;
    }
    let cancelled = false;
    setLoadingStock(true);
    fetch(`/api/patrimonio/estoque-almoxarifado?warehouseId=${encodeURIComponent(stockWarehouse.id)}`)
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        if (!cancelled) {
          setStockItems(data.items || []);
          setLoadingStock(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingStock(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stockWarehouse]);

  return (
    <>
      <OperationalTable
        columns={columns}
        preferenceId="patrimonio-almoxarifados"
        caption="Almoxarifados"
        emptyMessage="Nenhum almoxarifado encontrado."
        rows={warehouses.map((warehouse) => {
          const inactive = !warehouse.isActive;
          return {
            id: warehouse.id,
            label: warehouse.name,
            values: {
              name: warehouse.name,
              type: warehouse.type,
              materials: "Consultar",
              address:
                [
                  warehouse.streetName || warehouse.address,
                  warehouse.number,
                  warehouse.neighborhood,
                  warehouse.city,
                  warehouse.state,
                  warehouse.zipCode,
                ]
                  .filter(Boolean)
                  .join(", ") || "Não informado",
              manager: warehouse.managerName || "Sem responsável definido",
              costCenter: warehouse.costCenterName || "Não vinculado",
              status: inactive ? "Inativo" : "Ativo",
            },
            cells: {
              materials: (
                <button
                  type="button"
                  onClick={() => {
                    setStockWarehouse(warehouse);
                    setIsFullScreen(false);
                  }}
                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  title={`Ver materiais e estoque virtual de ${warehouse.name}`}
                >
                  <Boxes className="size-3.5 text-slate-600" />
                  Materiais
                </button>
              ),
              address: (
                <button
                  type="button"
                  aria-label={`Ver endereço de ${warehouse.name}`}
                  title="Ver endereço completo"
                  onClick={() => setAddressWarehouse(warehouse)}
                  className="inline-flex size-6 items-center justify-center rounded focus-visible:ring-2"
                >
                  <MapPin className="size-4" />
                </button>
              ),
            },
            actions:
              canUpdate || canDelete ? (
                <div className={styles.rowActions}>
                  {canUpdate && (
                    <Link
                      href={`/patrimonio/almoxarifados/${encodeURIComponent(warehouse.id)}/editar`}
                      aria-label={`Editar ${warehouse.name}`}
                      title="Editar almoxarifado"
                      className={styles.iconButton}
                    >
                      <Pencil />
                    </Link>
                  )}
                  {canUpdate && (
                    <ConfirmActionDialog
                      title={inactive ? "Reativar almoxarifado" : "Inativar almoxarifado"}
                      description={
                        inactive
                          ? `O almoxarifado “${warehouse.name}” voltará a ficar disponível para movimentações.`
                          : `O almoxarifado “${warehouse.name}” deixará de aceitar novas movimentações. Seu histórico será preservado.`
                      }
                      confirmLabel={inactive ? "Reativar" : "Inativar"}
                      action={() => setWarehouseActiveAction(warehouse.id, inactive)}
                      destructive={!inactive}
                      trigger={
                        <button
                          type="button"
                          aria-label={`${inactive ? "Reativar" : "Inativar"} ${warehouse.name}`}
                          title={inactive ? "Reativar almoxarifado" : "Inativar almoxarifado"}
                          className={styles.iconButton}
                        >
                          {inactive ? <RotateCcw /> : <Power />}
                        </button>
                      }
                    />
                  )}
                  {canDelete && (
                    <ConfirmActionDialog
                      title="Excluir almoxarifado"
                      description={`A exclusão de “${warehouse.name}” é permanente e só será concluída se não houver estoque, movimentações ou outros registros vinculados.`}
                      confirmLabel="Excluir definitivamente"
                      action={() => deleteWarehouseAction(warehouse.id)}
                      destructive
                      trigger={
                        <button
                          type="button"
                          aria-label={`Excluir ${warehouse.name}`}
                          title="Excluir almoxarifado"
                          className={styles.iconButton}
                        >
                          <Trash2 />
                        </button>
                      }
                    />
                  )}
                </div>
              ) : (
                <span>Leitura</span>
              ),
          };
        })}
      />

      <Dialog
        open={Boolean(stockWarehouse)}
        onOpenChange={(open) => {
          if (!open) {
            setStockWarehouse(null);
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
                Estoque Virtual e Materiais — {stockWarehouse?.name}
              </DialogTitle>
              <DialogDescription>
                Consulta detalhada de saldos físicos, reservados e disponíveis no estoque virtual.
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
            {loadingStock ? (
              <p className="p-4 text-center text-xs text-slate-500">Carregando estoque dos materiais...</p>
            ) : stockItems.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-500">
                Nenhum material com saldo registrado neste almoxarifado.
              </p>
            ) : (
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 sticky top-0">
                  <tr>
                    <th className="p-2">Código</th>
                    <th className="p-2">Material</th>
                    <th className="p-2">Unidade</th>
                    <th className="p-2">Lote</th>
                    <th className="p-2 text-right">Saldo Físico</th>
                    <th className="p-2 text-right">Reservado</th>
                    <th className="p-2 text-right">Disponível (Virtual)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50">
                      <td className="p-2 font-mono font-medium">{item.code}</td>
                      <td className="p-2 font-semibold text-slate-900">{item.name}</td>
                      <td className="p-2">{item.unit}</td>
                      <td className="p-2">{item.batchNumber || "—"}</td>
                      <td className="p-2 text-right font-medium">{item.physicalQuantity}</td>
                      <td className="p-2 text-right text-amber-600 font-medium">{item.reservedQuantity}</td>
                      <td className="p-2 text-right text-emerald-700 font-bold">{item.availableQuantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                setStockWarehouse(null);
                setIsFullScreen(false);
              }}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(addressWarehouse)}
        onOpenChange={(open) => {
          if (!open) setAddressWarehouse(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Endereço do almoxarifado</DialogTitle>
            <DialogDescription>{addressWarehouse?.name}</DialogDescription>
          </DialogHeader>
          {addressWarehouse && (
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">CEP</dt>
                <dd>{addressWarehouse.zipCode || "Não informado"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">UF</dt>
                <dd>{addressWarehouse.state || "Não informada"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Rua e número</dt>
                <dd>
                  {[addressWarehouse.streetName, addressWarehouse.number]
                    .filter(Boolean)
                    .join(", ") ||
                    addressWarehouse.address ||
                    "Não informado"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Bairro</dt>
                <dd>{addressWarehouse.neighborhood || "Não informado"}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Cidade</dt>
                <dd>{addressWarehouse.city || "Não informada"}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
