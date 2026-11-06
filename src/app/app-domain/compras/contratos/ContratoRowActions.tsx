"use client";

import { useState } from "react";
import { deleteContract } from "./actions";
import { Trash2, Edit, Eye, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/components/app-ui/operational/operational.module.css";

export default function ContratoRowActions({
  id,
  number,
  onQuickEdit,
}: {
  id: string;
  number: string;
  onQuickEdit?: (trigger: HTMLButtonElement) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (
      !confirm(
        `Tem certeza que deseja excluir o Contrato Nº ${number}? Esta ação não pode ser desfeita.`,
      )
    ) {
      return;
    }

    setIsDeleting(true);
    const res = await deleteContract(id);
    if (!res.success) {
      alert(res.error || "Erro ao excluir contrato.");
      setIsDeleting(false);
    } else {
      router.refresh();
    }
  }

  return (
    <div className={styles.rowActions}>
      {onQuickEdit ? (
        <button
          type="button"
          onClick={(e) => onQuickEdit(e.currentTarget)}
          className="inline-flex h-7 items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
          title={`Edição rápida de responsáveis, representantes e signatários do contrato ${number}`}
        >
          <Users className="size-3.5" />
          Edição rápida
        </button>
      ) : null}
      <Link
        href={`/compras/contratos/${encodeURIComponent(id)}`}
        className={styles.iconButton}
        title="Ver Detalhes do Contrato"
        aria-label={`Ver detalhes do contrato ${number}`}
      >
        <Eye />
      </Link>
      <Link
        href={`/compras/contratos/${encodeURIComponent(id)}/editar`}
        className={styles.iconButton}
        title="Editar Contrato"
        aria-label={`Editar contrato ${number}`}
      >
        <Edit />
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className={styles.iconButton}
        title="Excluir Contrato"
        aria-label={`Excluir contrato ${number}`}
      >
        {isDeleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </button>
    </div>
  );
}
