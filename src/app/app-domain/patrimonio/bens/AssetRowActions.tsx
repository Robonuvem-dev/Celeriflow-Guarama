"use client";

import Link from "next/link";
import { Pencil, Power, RotateCcw } from "lucide-react";
import { ConfirmActionDialog } from "@/components/app-ui/ConfirmActionDialog";
import { setAssetActiveAction } from "./actions";
import styles from "@/components/app-ui/operational/operational.module.css";

export function AssetRowActions({ asset, canUpdate }: { asset: { id: string; name: string; status: string }; canUpdate: boolean }) {
  if (!canUpdate || asset.status === "Baixado" || asset.status === "Em manutenção") return <span className="text-[10px] text-slate-400">{asset.status === "Baixado" || asset.status === "Em manutenção" ? asset.status : "Leitura"}</span>;

  const isInactive = asset.status === "Inativo";
  return (
    <div className={styles.rowActions}>
      <Link href={`/patrimonio/bens/editar?id=${encodeURIComponent(asset.id)}`} aria-label={`Editar ${asset.name}`} title="Editar bem" className={styles.iconButton}>
        <Pencil className="size-3.5" />
      </Link>
      <ConfirmActionDialog
        title={isInactive ? "Reativar bem patrimonial" : "Inativar bem patrimonial"}
        description={isInactive ? `O bem “${asset.name}” voltará a ficar disponível para as operações patrimoniais.` : `O bem “${asset.name}” ficará indisponível para novas operações, sem apagar seu histórico.`}
        confirmLabel={isInactive ? "Reativar bem" : "Inativar bem"}
        action={() => setAssetActiveAction(asset.id, isInactive)}
        destructive={!isInactive}
        trigger={
          <button type="button" aria-label={`${isInactive ? "Reativar" : "Inativar"} ${asset.name}`} title={isInactive ? "Reativar bem" : "Inativar bem"} className={styles.iconButton}>
            {isInactive ? <RotateCcw className="size-3.5" /> : <Power className="size-3.5" />}
          </button>
        }
      />
    </div>
  );
}
