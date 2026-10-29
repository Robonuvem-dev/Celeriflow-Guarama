"use client";

import { useState } from "react";
import Link from "next/link";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { healthColumn } from "../../operational-columns";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";

type Report = { id: string; patient: string; unit: string; status: string; paid: boolean; authorization: string | null };
export function TreatmentReportsTable({ reports }: { reports: Report[] }) {
  // Kept in the client boundary while route pagination refreshes the server data.
  // Hidden controls submit the complete selection, including other pages.
  const [selection, setSelection] = useState<string[]>([]);
  const selected = selection.filter(id => !reports.some(report => report.id === id && (report.status !== "APROVADA" || report.authorization)));
  return <>
    {selected.length > 0 && <OperationalHeaderActions><button type="button" onClick={() => setSelection([])} className="h-7 rounded border px-2 text-xs">Limpar {selected.length} selecionado(s)</button></OperationalHeaderActions>}
    {selected.map(id => <input key={id} type="hidden" name="reportId" value={id} form="bulk-authorization" />)}
    <OperationalTable preferenceId="saude-producao-laudos" caption="Laudos e autorizações AIH/APAC" columns={[{ ...healthColumn("selection", "Selecionar", 80, 80, "text", "center", 80), resizable: false, details: "none" }, healthColumn("patient", "Paciente", 260, 120), healthColumn("unit", "Unidade", 200, 110), healthColumn("status", "Situação", 150, 100, "status"), healthColumn("paid", "Identificação pagamento", 210, 155), healthColumn("number", "Número", 190, 110, "identifier"), healthColumn("actions", "Laudo", 100, 90, "actions", "right", 120)]} rows={reports.map(report => ({ id: report.id, label: report.patient, values: { selection: selected.includes(report.id) ? "Selecionado" : "", patient: report.patient, unit: report.unit, status: report.status, paid: report.paid ? "Paga (identificação manual)" : "—", number: report.authorization || "Não autorizado" }, cells: { selection: report.status === "APROVADA" && !report.authorization ? <input type="checkbox" checked={selected.includes(report.id)} onChange={event => setSelection(current => event.target.checked ? [...new Set([...current, report.id])] : current.filter(id => id !== report.id))} aria-label={`Autorizar laudo de ${report.patient}`} /> : null }, actions: <Link href={`/saude/producao/laudos/${encodeURIComponent(report.id)}`}>Abrir laudo</Link> }))} />
  </>;
}
