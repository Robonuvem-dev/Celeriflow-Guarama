"use client";

import { useState } from "react";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Trash, Edit, FileText } from "lucide-react";
import Link from "next/link";
import { deleteDispensa } from "./actions";

export function DispensaRowActions({ id }: { id: string }) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (confirm("Tem certeza que deseja excluir esta dispensa?")) {
      setIsDeleting(true);
      await deleteDispensa(id);
      setIsDeleting(false);
    }
  }

  return (
    <div className={styles.rowActions}>
      <Link href={`/compras/dispensas/${id}`} className={styles.iconButton} aria-label="Ver detalhes da dispensa" title="Ver Detalhes">
        <FileText className="h-4 w-4 text-blue-500" />
      </Link>
      <Link href={`/compras/dispensas/${id}/editar`} className={styles.iconButton} aria-label="Editar dispensa" title="Editar">
        <Edit className="h-4 w-4 text-amber-500" />
      </Link>
      <button type="button" className={styles.iconButton} onClick={handleDelete} disabled={isDeleting} aria-label="Excluir dispensa" title="Excluir">
        <Trash className="h-4 w-4 text-rose-500" />
      </button>
    </div>
  );
}
