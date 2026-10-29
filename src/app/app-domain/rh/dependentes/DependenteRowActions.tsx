"use client";

import { Edit, Trash2 } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";
import Link from "next/link";
import { deleteDependente } from "./actions";
import { useRouter } from "next/navigation";
import type { Dependent } from "@/lib/contracts/personnel-pages";

export function DependenteRowActions({ dependent }: { dependent: Dependent }) {
  const router = useRouter();

  const handleDelete = async () => {
    if (confirm(`Deseja realmente excluir o dependente ${dependent.name}?`)) {
      const result = await deleteDependente(dependent.id);
      if (!result.success) {
        alert(result.error);
      } else {
        router.refresh();
      }
    }
  };

  return (
    <div className={styles.rowActions}>
      <Link href={`/rh/dependentes/${dependent.id}/editar`} className={styles.iconButton} aria-label={`Editar dependente ${dependent.name}`} title="Editar">
        <Edit className="h-4 w-4" />
      </Link>
      <button type="button"
        aria-label={`Excluir dependente ${dependent.name}`}
        title="Excluir"
        onClick={handleDelete}
        className={styles.iconButton}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
