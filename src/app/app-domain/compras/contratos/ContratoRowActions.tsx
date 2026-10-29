"use client";

import { useState } from "react";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Trash, Edit, FileText } from "lucide-react";
import Link from "next/link";
import { deleteContract } from "./actions";

export function ContratoRowActions({ id }: { id: string }) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (confirm("Tem certeza que deseja excluir este contrato?")) {
      setIsDeleting(true);
      const result = await deleteContract(id);
      setIsDeleting(false);
      if (!result.success) alert(result.error || "Nao foi possivel excluir o contrato.");
    }
  }

  return (
    <div className={styles.rowActions}>
      <Link href={`/compras/contratos/${id}`} className={styles.iconButton} aria-label="Ver detalhes do contrato" title="Ver Detalhes">
        <FileText className="h-4 w-4 text-blue-500" />
      </Link>
      <Link href={`/compras/contratos/${id}/editar`} className={styles.iconButton} aria-label="Editar contrato" title="Editar">
        <Edit className="h-4 w-4 text-amber-500" />
      </Link>
      <button type="button" className={styles.iconButton} onClick={handleDelete} disabled={isDeleting} aria-label="Excluir contrato" title="Excluir">
        <Trash className="h-4 w-4 text-rose-500" />
      </button>
    </div>
  );
}
