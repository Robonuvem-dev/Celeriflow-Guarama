"use client";

import Link from "next/link";
import { Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import { ConfirmActionDialog } from "@/components/app-ui/ConfirmActionDialog";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import styles from "@/components/app-ui/operational/operational.module.css";
import { operationalColumns } from "../_components/operational-columns";
import { deleteCostCenterAction, setCostCenterActiveAction } from "./actions";

type CostCenterRow = { id: string; code: string; name: string; description: string | null; isActive: boolean; warehouseCount: number };
const columns = operationalColumns([
  ["code", "Código", 140, 90, "identifier"], ["name", "Nome", 230, 120], ["description", "Descrição", 300, 140],
  ["links", "Vínculos", 150, 110], ["status", "Situação", 100, 80, "status"], ["actions", "Ações", 100, 100, "actions", "right"],
]);

export function CostCenterTable({ costCenters, canUpdate, canDelete }: { costCenters: CostCenterRow[]; canUpdate: boolean; canDelete: boolean }) {
  return <OperationalTable columns={columns} preferenceId="patrimonio-centros-custo" caption="Centros de custo" emptyMessage="Nenhum centro de custo encontrado." rows={costCenters.map(costCenter => {
    const inactive = !costCenter.isActive;
    return { id: costCenter.id, label: costCenter.name, values: { code: costCenter.code, name: costCenter.name, description: costCenter.description || "—", links: `${costCenter.warehouseCount} almoxarifado(s)`, status: inactive ? "Inativo" : "Ativo" }, actions: (canUpdate || canDelete) ? <div className={styles.rowActions}>
      {canUpdate && <Link href={`/patrimonio/centros-custo/${encodeURIComponent(costCenter.id)}/editar`} aria-label={`Editar ${costCenter.name}`} title="Editar centro de custo" className={styles.iconButton}><Pencil /></Link>}
      {canUpdate && <ConfirmActionDialog title={inactive ? "Reativar centro de custo" : "Inativar centro de custo"} description={`Confirme a ${inactive ? "reativação" : "inativação"} de “${costCenter.name}”. O histórico será preservado.`} confirmLabel={inactive ? "Reativar" : "Inativar"} action={() => setCostCenterActiveAction(costCenter.id, inactive)} destructive={!inactive} trigger={<button type="button" aria-label={`${inactive ? "Reativar" : "Inativar"} ${costCenter.name}`} className={styles.iconButton}>{inactive ? <RotateCcw /> : <Power />}</button>} />}
      {canDelete && <ConfirmActionDialog title="Excluir centro de custo" description={`A exclusão de “${costCenter.name}” é permanente e depende da ausência de registros vinculados.`} confirmLabel="Excluir definitivamente" action={() => deleteCostCenterAction(costCenter.id)} destructive trigger={<button type="button" aria-label={`Excluir ${costCenter.name}`} className={styles.iconButton}><Trash2 /></button>} />}
    </div> : <span>Leitura</span> };
  })} />;
}
