"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, Ban, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";

interface ActionButtonsProps {
  id: string;
  /** Callback chamado quando usuario clica em Editar. Abre o sheet externamente. */
  onEdit?: () => void;
  /** Action de excluir permanentemente */
  onDelete?: (id: string) => Promise<{ success?: boolean; error?: string }>;
  /** Action de inativar (muda status, nao exclui) */
  onInactivate?: (id: string) => Promise<{ success?: boolean; error?: string }>;
  deleteLabel?: string;
  inactivateLabel?: string;
}

export function ActionButtons({
  id,
  onEdit,
  onDelete,
  onInactivate,
  deleteLabel = "Excluir",
  inactivateLabel = "Inativar",
}: ActionButtonsProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const handleAction = (action: (id: string) => Promise<{ success?: boolean; error?: string }>, label: string) => {
    if (!confirm(`Tem certeza que deseja ${label.toLowerCase()} este registro?`)) return;
    setError("");
    startTransition(async () => {
      const result = await action(id);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className={styles.rowActions}>
      <Dialog open={Boolean(error)} onOpenChange={(open) => { if (!open) setError(""); }}>
        <DialogContent className={styles.dialog}>
          <DialogHeader><DialogTitle>Não foi possível atualizar o registro</DialogTitle><DialogDescription>{error}</DialogDescription></DialogHeader>
          <button type="button" className={styles.dialogButton} onClick={() => setError("")}>Fechar</button>
        </DialogContent>
      </Dialog>

      {/* Editar */}
      {onEdit && (
        <button
          onClick={onEdit}
          className={styles.iconButton}
          title="Editar"
          aria-label="Editar registro"
          type="button"
        >
          <Pencil className="w-4 h-4" />
        </button>
      )}

      {/* Inativar */}
      {onInactivate && (
        <button
          onClick={() => handleAction(onInactivate, inactivateLabel)}
          disabled={isPending}
          className={styles.iconButton}
          title={inactivateLabel}
          aria-label={inactivateLabel}
          type="button"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
        </button>
      )}

      {/* Excluir */}
      {onDelete && (
        <button
          onClick={() => handleAction(onDelete, deleteLabel)}
          disabled={isPending}
          className={styles.iconButton}
          title={deleteLabel}
          aria-label={deleteLabel}
          type="button"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}
