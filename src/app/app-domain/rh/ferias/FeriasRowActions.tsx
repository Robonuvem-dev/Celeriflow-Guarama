"use client";

import { Edit, Trash2 } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";
import Link from "next/link";
import { deleteFerias } from "./actions";
import type { Vacation } from "@/lib/contracts/personnel-pages";

export function FeriasRowActions({ vacation }: { vacation: Vacation }) {
  const handleDelete = async () => {
    if (confirm(`Deseja realmente excluir o registro de férias deste servidor?`)) {
      const result = await deleteFerias(vacation.id);
      if (!result.success) {
        alert(result.error);
      }
    }
  };

  return (
    <div className={styles.rowActions}>
      <Link href={`/rh/ferias/${vacation.id}/editar`} className={styles.iconButton} aria-label={`Editar férias ${vacation.id}`} title="Editar férias">
        <Edit className="h-4 w-4" />
      </Link>
      <button type="button" aria-label={`Excluir férias ${vacation.id}`} title="Excluir férias"
        onClick={handleDelete}
        className={styles.iconButton}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
