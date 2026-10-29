"use client";

import { Edit, Trash2 } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";
import Link from "next/link";
import { deleteAtoPessoal } from "./actions";
import type { PersonnelAct } from "@/lib/contracts/personnel-pages";

export function AtoRowActions({ ato }: { ato: PersonnelAct }) {
  const handleDelete = async () => {
    if (confirm(`Deseja realmente excluir este ato de pessoal?`)) {
      const result = await deleteAtoPessoal(ato.id);
      if (!result.success) {
        alert(result.error);
      }
    }
  };

  return (
    <div className={styles.rowActions}>
      <Link href={`/rh/atos/${ato.id}/editar`} className={styles.iconButton} aria-label={`Editar ato ${ato.actNumber || ato.id}`} title="Editar ato">
        <Edit className="h-4 w-4" />
      </Link>
      <button type="button"
        aria-label={`Excluir ato ${ato.actNumber || ato.id}`} title="Excluir ato"
        onClick={handleDelete}
        className={styles.iconButton}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
