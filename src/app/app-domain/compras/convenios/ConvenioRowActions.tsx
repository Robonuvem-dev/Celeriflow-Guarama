"use client";

import Link from "next/link";
import { useState } from "react";
import { Edit, FileText, Trash2 } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";
import { deleteCovenant } from "./actions";

export function ConvenioRowActions({ id }: { id: string }) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Excluir este convênio? Instrumentos com execução ou empenhos vinculados não podem ser excluídos.")) return;
    setIsDeleting(true);
    try {
      const result = await deleteCovenant(id);
      if (!result.success) window.alert(result.error);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className={styles.rowActions}>
      <Link href={`/compras/convenios/${id}`} className={styles.iconButton} aria-label="Ver detalhes do convênio" title="Ver detalhes"><FileText className="size-4 text-blue-500" /></Link>
      <Link href={`/compras/convenios/${id}/editar`} className={styles.iconButton} aria-label="Editar convênio" title="Editar"><Edit className="size-4 text-amber-500" /></Link>
      <button type="button" className={styles.iconButton} onClick={handleDelete} disabled={isDeleting} aria-label="Excluir convênio" title="Excluir"><Trash2 className="size-4 text-rose-500" /></button>
    </div>
  );
}
