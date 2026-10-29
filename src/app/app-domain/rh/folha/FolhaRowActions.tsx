"use client";

import { Edit, Trash2 } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";
import Link from "next/link";
import { deleteFolha } from "./actions";
import type { Payroll } from "@/lib/contracts/personnel-pages";

export function FolhaRowActions({ folha }: { folha: Payroll }) {
  const handleDelete = async () => {
    if (confirm(`Deseja realmente excluir a folha de pagamento ${folha.competence}?`)) {
      const result = await deleteFolha(folha.id);
      if (!result.success) {
        alert(result.error);
      }
    }
  };

  return (
    <div className={styles.rowActions}>
      <Link href={`/rh/folha/${folha.id}/editar`} className={styles.iconButton} aria-label={`Editar folha ${folha.competence}`} title="Editar folha">
        <Edit className="h-4 w-4" />
      </Link>
      <button type="button" aria-label={`Excluir folha ${folha.competence}`} title="Excluir folha"
        onClick={handleDelete}
        className={styles.iconButton}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
