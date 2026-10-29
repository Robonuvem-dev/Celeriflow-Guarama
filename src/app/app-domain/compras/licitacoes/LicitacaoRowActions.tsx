"use client";

import { useState } from "react";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Ban, Edit, FileText } from "lucide-react";
import Link from "next/link";
import { inactivateBidding } from "./actions";

export function LicitacaoRowActions({ id }: { id: string }) {
  const [isInactivating, setIsInactivating] = useState(false);

  async function handleInactivate() {
    if (confirm("Tem certeza que deseja inativar esta licitação?")) {
      setIsInactivating(true);
      try {
        const result = await inactivateBidding(id);
        if (!result.success) alert(result.error);
      } finally {
        setIsInactivating(false);
      }
    }
  }

  return (
    <div className={styles.rowActions}>
      <Link href={`/compras/licitacoes/${id}`} className={styles.iconButton} aria-label="Ver detalhes da licitação" title="Ver Detalhes">
        <FileText className="h-4 w-4 text-blue-500" />
      </Link>
      <Link href={`/compras/licitacoes/${id}/editar`} className={styles.iconButton} aria-label="Editar licitação" title="Editar">
        <Edit className="h-4 w-4 text-amber-500" />
      </Link>
      <button type="button" className={styles.iconButton} onClick={handleInactivate} disabled={isInactivating} aria-label="Inativar licitação" title="Inativar">
        <Ban className="h-4 w-4 text-rose-500" />
      </button>
    </div>
  );
}
