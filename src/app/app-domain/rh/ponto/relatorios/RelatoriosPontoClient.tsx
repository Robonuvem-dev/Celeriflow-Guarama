"use client";

import { Printer, Download } from "lucide-react";
import styles from "@/components/app-ui/operational/operational.module.css";

export function RelatoriosPontoClient({
  reportTitle,
  headers,
  rows,
}: {
  reportTitle: string;
  headers: string[];
  rows: string[][];
}) {
  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const csvContent = [
      headers.join(";"),
      ...rows.map((row) =>
        row.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(";")
      ),
    ].join("\r\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `${reportTitle.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={handlePrint}
        className={styles.dialogButton}
        title="Imprimir relatório formatado para conferência oficial"
      >
        <Printer className="w-3.5 h-3.5 inline mr-1 text-slate-700" />
        Imprimir
      </button>

      <button
        type="button"
        onClick={handleExportCSV}
        className={styles.dialogButton}
        title="Exportar dados do relatório em CSV (Excel)"
      >
        <Download className="w-3.5 h-3.5 inline mr-1 text-emerald-700" />
        Exportar CSV
      </button>
    </div>
  );
}
