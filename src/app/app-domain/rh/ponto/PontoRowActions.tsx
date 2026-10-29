"use client";

import { Edit, Trash2 } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";
import Link from "next/link";
import { deletePonto } from "./actions";
import type { AttendanceRecord } from "@/lib/contracts/personnel-pages";

export function PontoRowActions({ record }: { record: AttendanceRecord }) {
  const handleDelete = async () => {
    if (confirm(`Deseja realmente excluir este registro de ponto?`)) {
      const result = await deletePonto(record.id);
      if (!result.success) {
        alert(result.error);
      }
    }
  };

  return (
    <div className={styles.rowActions}>
      <Link href={`/rh/ponto/${record.id}/editar`} className={styles.iconButton} aria-label={`Editar apontamento ${record.id}`} title="Editar apontamento">
        <Edit className="h-4 w-4" />
      </Link>
      <button type="button" aria-label={`Excluir apontamento ${record.id}`} title="Excluir apontamento"
        onClick={handleDelete}
        className={styles.iconButton}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
