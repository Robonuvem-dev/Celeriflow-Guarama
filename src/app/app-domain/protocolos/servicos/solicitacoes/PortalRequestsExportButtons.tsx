"use client";

import { FileSpreadsheet, Printer } from "lucide-react";

export type PortalRequestExportItem = {
  protocolNumber: string;
  serviceName: string;
  status: string;
  departmentName: string;
  createdAt: string;
};

export function PortalRequestsExportButtons({
  data,
  searchParamsString,
}: {
  data: PortalRequestExportItem[];
  searchParamsString: string;
}) {
  const exportCSV = () => {
    const headers = ["Protocolo", "Serviço", "Situação", "Setor", "Data de Abertura"];
    const rows = data.map((d) => [
      d.protocolNumber,
      `"${d.serviceName}"`,
      d.status,
      `"${d.departmentName}"`,
      d.createdAt,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(";"), ...rows.map((row) => row.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `solicitacoes_portal_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openHtmlReport = () => {
    const url = `/protocolos/servicos/solicitacoes?${searchParamsString}&export=html`;
    window.open(url, "_blank");
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={exportCSV}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
        title="Exportar pesquisa para CSV (19.116)"
      >
        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
        Exportar CSV (19.116)
      </button>
      <button
        type="button"
        onClick={openHtmlReport}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
        title="Imprimir relatório HTML (19.116)"
      >
        <Printer className="w-3.5 h-3.5 text-slate-600" />
        Imprimir HTML (19.116)
      </button>
    </div>
  );
}
