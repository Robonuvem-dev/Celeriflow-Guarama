"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPin, Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/app-ui/ConfirmActionDialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteWarehouseAction, setWarehouseActiveAction } from "./actions";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { operationalColumns } from "../_components/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

const columns = operationalColumns([
  ["name", "Nome", 220, 120, "identifier"], ["type", "Tipo", 110, 75], ["address", "Endereço", 90, 75],
  ["manager", "Responsável", 190, 110], ["costCenter", "Centro de custo", 180, 110],
  ["status", "Situação", 100, 80, "status"], ["actions", "Ações", 100, 100, "actions", "right"],
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

export function WarehouseTable({ warehouses, canUpdate, canDelete }: { warehouses: WarehouseRow[]; canUpdate: boolean; canDelete: boolean }) {
  const [addressWarehouse, setAddressWarehouse] = useState<WarehouseRow | null>(null);

  return (
    <>
      <OperationalTable columns={columns} preferenceId="patrimonio-almoxarifados" caption="Almoxarifados" emptyMessage="Nenhum almoxarifado encontrado." rows={warehouses.map((warehouse) => {
              const inactive = !warehouse.isActive;
              return { id: warehouse.id, label: warehouse.name,
                values: { name: warehouse.name, type: warehouse.type, address: [warehouse.streetName || warehouse.address, warehouse.number, warehouse.neighborhood, warehouse.city, warehouse.state, warehouse.zipCode].filter(Boolean).join(", ") || "Não informado", manager: warehouse.managerName || "Sem responsável definido", costCenter: warehouse.costCenterName || "Não vinculado", status: inactive ? "Inativo" : "Ativo" },
                cells: { address: <button type="button" aria-label={`Ver endereço de ${warehouse.name}`} title="Ver endereço completo" onClick={() => setAddressWarehouse(warehouse)} className="inline-flex size-6 items-center justify-center rounded focus-visible:ring-2"><MapPin className="size-4" /></button> },
                actions: (canUpdate || canDelete) ? (
                      <div className={styles.rowActions}>
                         {canUpdate && <Link href={`/patrimonio/almoxarifados/${encodeURIComponent(warehouse.id)}/editar`} aria-label={`Editar ${warehouse.name}`} title="Editar almoxarifado" className={styles.iconButton}><Pencil /></Link>}
                         {canUpdate && <ConfirmActionDialog title={inactive ? "Reativar almoxarifado" : "Inativar almoxarifado"} description={inactive ? `O almoxarifado “${warehouse.name}” voltará a ficar disponível para movimentações.` : `O almoxarifado “${warehouse.name}” deixará de aceitar novas movimentações. Seu histórico será preservado.`} confirmLabel={inactive ? "Reativar" : "Inativar"} action={() => setWarehouseActiveAction(warehouse.id, inactive)} destructive={!inactive} trigger={<button type="button" aria-label={`${inactive ? "Reativar" : "Inativar"} ${warehouse.name}`} title={inactive ? "Reativar almoxarifado" : "Inativar almoxarifado"} className={styles.iconButton}>{inactive ? <RotateCcw /> : <Power />}</button>} />}
                         {canDelete && <ConfirmActionDialog title="Excluir almoxarifado" description={`A exclusão de “${warehouse.name}” é permanente e só será concluída se não houver estoque, movimentações ou outros registros vinculados.`} confirmLabel="Excluir definitivamente" action={() => deleteWarehouseAction(warehouse.id)} destructive trigger={<button type="button" aria-label={`Excluir ${warehouse.name}`} title="Excluir almoxarifado" className={styles.iconButton}><Trash2 /></button>} />}
                      </div>
                    ) : <span>Leitura</span> };
            })} />
      <Dialog open={Boolean(addressWarehouse)} onOpenChange={(open) => { if (!open) setAddressWarehouse(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Endereço do almoxarifado</DialogTitle>
            <DialogDescription>{addressWarehouse?.name}</DialogDescription>
          </DialogHeader>
          {addressWarehouse && <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">CEP</dt><dd>{addressWarehouse.zipCode || "Não informado"}</dd></div><div><dt className="text-xs text-slate-500">UF</dt><dd>{addressWarehouse.state || "Não informada"}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">Rua e número</dt><dd>{[addressWarehouse.streetName, addressWarehouse.number].filter(Boolean).join(", ") || addressWarehouse.address || "Não informado"}</dd></div><div><dt className="text-xs text-slate-500">Bairro</dt><dd>{addressWarehouse.neighborhood || "Não informado"}</dd></div><div><dt className="text-xs text-slate-500">Cidade</dt><dd>{addressWarehouse.city || "Não informada"}</dd></div></dl>}
        </DialogContent>
      </Dialog>
    </>
  );
}
