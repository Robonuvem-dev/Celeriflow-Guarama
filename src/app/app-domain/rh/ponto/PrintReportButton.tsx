"use client";

import { Printer, AlertTriangle, FileSpreadsheet } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";

export function PrintReportButton({
  label = "Emitir Espelho / Relatório",
  inconsistenciesOnly = false,
}: {
  label?: string;
  inconsistenciesOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={styles.dialogButton}
      title={inconsistenciesOnly ? "Imprimir relatório de inconsistências para ajuste (20.7)" : "Imprimir espelho de marcações de ponto (20.6)"}
    >
      {inconsistenciesOnly ? <AlertTriangle className="text-amber-500" /> : <Printer />}
      {label}
    </button>
  );
}
