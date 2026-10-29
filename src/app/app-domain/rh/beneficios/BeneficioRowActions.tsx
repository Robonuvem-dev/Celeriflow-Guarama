"use client";

import { Edit, PowerOff, Power, Trash2 } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";
import Link from "next/link";
import { toggleBeneficioStatus, deleteBeneficio } from "./actions";
import { useRouter } from "next/navigation";
import type { BenefitConfig } from "@/lib/contracts/personnel-pages";

export function BeneficioRowActions({ beneficio }: { beneficio: BenefitConfig }) {
  const router = useRouter();

  const handleToggleStatus = async () => {
    if (confirm(`Tem certeza que deseja ${beneficio.isActive ? 'inativar' : 'ativar'} o benefício ${beneficio.name}?`)) {
      const result = await toggleBeneficioStatus(beneficio.id, !beneficio.isActive);
      if (!result.success) {
        alert(result.error);
      } else {
        router.refresh();
      }
    }
  };

  const handleDelete = async () => {
    if (confirm(`Deseja realmente excluir o benefício ${beneficio.name} do sistema? (Apenas permitido se não estiver sendo usado por servidores)`)) {
      const result = await deleteBeneficio(beneficio.id);
      if (!result.success) {
        alert(result.error);
      } else {
        router.refresh();
      }
    }
  };

  return (
    <div className={styles.rowActions}>
      <Link href={`/rh/beneficios/${beneficio.id}/editar`} className={styles.iconButton} aria-label={`Editar benefício ${beneficio.name}`} title="Editar">
        <Edit className="h-4 w-4" />
      </Link>
      <button type="button" className={styles.iconButton}
        aria-label={`${beneficio.isActive ? "Inativar" : "Ativar"} benefício ${beneficio.name}`}
        title={beneficio.isActive ? "Inativar" : "Ativar"}
        onClick={handleToggleStatus}
      >
        {beneficio.isActive ? (
          <PowerOff className="h-4 w-4 text-orange-500" />
        ) : (
          <Power className="h-4 w-4 text-emerald-500" />
        )}
      </button>
      <button type="button"
        aria-label={`Excluir benefício ${beneficio.name}`}
        title="Excluir"
        onClick={handleDelete}
        className={styles.iconButton}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
