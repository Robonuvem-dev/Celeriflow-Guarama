"use client";

import { Edit, Trash2 } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";
import Link from "next/link";
import { deleteLicenca } from "./actions";
import type { Leave } from "@/lib/contracts/personnel-pages";

export function LicencaRowActions({ leave }: { leave: Leave }) {
  const handleDelete = async () => {
    if (confirm(`Deseja realmente excluir o registro desta licença?`)) {
      const result = await deleteLicenca(leave.id);
      if (!result.success) {
        alert(result.error);
      }
    }
  };

  return (
    <div className={styles.rowActions}>
      <Link href={`/rh/licencas/${leave.id}/editar`} className={styles.iconButton} aria-label={`Editar licença ${leave.id}`} title="Editar licença">
        <Edit className="h-4 w-4" />
      </Link>
      <button type="button" aria-label={`Excluir licença ${leave.id}`} title="Excluir licença"
        onClick={handleDelete}
        className={styles.iconButton}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
