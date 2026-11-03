"use client";

import { Edit, PowerOff, Power, Trash2 } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";
import Link from "next/link";
import { toggleServidorStatus, deleteServidor } from "./actions";
import { useRouter } from "next/navigation";
import type { Employee } from "@/lib/contracts/personnel-pages";

export function ServidorRowActions({ employee, canDelete = false }: { employee: Employee; canDelete?: boolean }) {
  const router = useRouter();
  async function removeUnused() {
    if (!confirm(`Excluir o cadastro indevido de ${employee.name}? Cadastros com uso operacional serão preservados.`)) return;
    const result = await deleteServidor(employee.id);
    if (!result.success) alert(result.error); else router.refresh();
  }
  const handleToggleStatus = async () => {
    if (confirm(`Tem certeza que deseja ${employee.isActive ? 'inativar' : 'ativar'} o servidor ${employee.name}?`)) {
      const result = await toggleServidorStatus(employee.id, !employee.isActive);
      if (!result.success) {
        alert(result.error);
      }
    }
  };

  return (
    <div className={styles.rowActions}>
      <Link href={`/rh/servidores/${employee.id}/editar`} className={styles.iconButton} aria-label={`Editar servidor ${employee.name}`} title="Editar">
        <Edit className="h-4 w-4" />
      </Link>
      <button type="button" className={styles.iconButton}
        aria-label={`${employee.isActive ? "Inativar" : "Ativar"} servidor ${employee.name}`}
        title={employee.isActive ? "Inativar" : "Ativar"}
        onClick={handleToggleStatus}
      >
        {employee.isActive ? (
          <PowerOff className="h-4 w-4 text-orange-500" />
        ) : (
          <Power className="h-4 w-4 text-emerald-500" />
        )}
      </button>
      {canDelete && <button type="button" className={styles.iconButton} onClick={removeUnused} title="Excluir cadastro sem uso" aria-label={`Excluir cadastro sem uso de ${employee.name}`}><Trash2 className="h-4 w-4" /></button>}
    </div>
  );
}
