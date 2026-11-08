"use client";

import { useState } from "react";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Trash, Edit, FileText, Ban, RotateCcw, Copy } from "lucide-react";
import Link from "next/link";
import { deletePurchaseRequest, cancelPurchaseRequest, restorePurchaseRequest, clonePurchaseRequest } from "./actions";

export function SolicitacaoRowActions({
  id,
  status,
  canManage,
}: {
  id: string;
  status?: string;
  canManage: boolean;
}) {
  const [isBusy, setIsBusy] = useState(false);

  async function handleDelete() {
    if (confirm("Tem certeza que deseja excluir esta solicitação?")) {
      setIsBusy(true);
      const result = await deletePurchaseRequest(id);
      setIsBusy(false);
      if (!result.success) alert(result.error || "Não foi possível excluir a solicitação.");
    }
  }

  async function handleCancel() {
    const reason = prompt("Informe a justificativa do cancelamento da SD:");
    if (reason !== null) {
      setIsBusy(true);
      const result = await cancelPurchaseRequest(id, reason);
      setIsBusy(false);
      if (!result.success) alert(result.error || "Não foi possível cancelar a solicitação.");
    }
  }

  async function handleRestore() {
    if (confirm("Deseja estornar o cancelamento desta SD e retorná-la ao status de Rascunho?")) {
      setIsBusy(true);
      const result = await restorePurchaseRequest(id);
      setIsBusy(false);
      if (!result.success) alert(result.error || "Não foi possível estornar o cancelamento.");
    }
  }

  async function handleClone() {
    if (confirm("Deseja clonar esta solicitação gerando um novo registro com mesmos itens e dotações?")) {
      setIsBusy(true);
      const result = await clonePurchaseRequest(id);
      setIsBusy(false);
      if (result.success) {
        alert("Solicitação clonada com sucesso!");
      } else {
        alert(result.error || "Não foi possível clonar a solicitação.");
      }
    }
  }

  const isCancelled = status === "Cancelada";

  return (
    <div className={styles.rowActions}>
      <Link
        href={`/compras/solicitacoes/${id}`}
        className={styles.iconButton}
        aria-label="Ver detalhes da solicitação"
        title="Ver Detalhes"
      >
        <FileText className="h-4 w-4 text-blue-500" />
      </Link>

      {canManage && !isCancelled && (
        <Link
          href={`/compras/solicitacoes/${id}/editar`}
          className={styles.iconButton}
          aria-label="Editar solicitação"
          title="Editar"
        >
          <Edit className="h-4 w-4 text-amber-500" />
        </Link>
      )}

      {/* 12.122: Clonagem de requisições */}
      <button
        type="button"
        className={styles.iconButton}
        onClick={handleClone}
        disabled={isBusy}
        aria-label="Clonar solicitação"
        title="Clonar Solicitação"
      >
        <Copy className="h-4 w-4 text-sky-600" />
      </button>

      {/* 12.33 / 12.119: Cancelamento */}
      {!isCancelled && (
        <button
          type="button"
          className={styles.iconButton}
          onClick={handleCancel}
          disabled={isBusy}
          aria-label="Cancelar solicitação"
          title="Cancelar Solicitação (12.33)"
        >
          <Ban className="h-4 w-4 text-amber-600" />
        </button>
      )}

      {/* 12.34 / 12.120: Estorno de cancelamento */}
      {isCancelled && (
        <button
          type="button"
          className={styles.iconButton}
          onClick={handleRestore}
          disabled={isBusy}
          aria-label="Estornar cancelamento"
          title="Estornar Cancelamento (12.34)"
        >
          <RotateCcw className="h-4 w-4 text-emerald-600" />
        </button>
      )}

      {canManage && (
        <button
          type="button"
          className={styles.iconButton}
          onClick={handleDelete}
          disabled={isBusy}
          aria-label="Excluir solicitação"
          title="Excluir"
        >
          <Trash className="h-4 w-4 text-rose-500" />
        </button>
      )}
    </div>
  );
}
