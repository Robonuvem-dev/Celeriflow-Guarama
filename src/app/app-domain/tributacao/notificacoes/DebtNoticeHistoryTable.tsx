"use client";

import { useState } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { TaxOperationalTable, TaxRowActions, TaxRowAction } from "../TaxOperationalTable";
import { TaxDraftText } from "../TaxDraftControls";

type Notice = { id: string; batchId: string; issuedAt: string; title: string; taxpayer: string; inscription: string; balance: string; cancelled: boolean };
export function DebtNoticeHistoryTable({ rows, pending, notice, resetKey, onCancel, onNotice }: { rows: Notice[]; pending: boolean; notice: string; resetKey: string; onCancel: (id: string, reason: string) => void; onNotice: (message: string) => void }) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const url = (id: string, format: string, batch = false) => `/api/tributacao/notificacoes?${batch ? "lote" : "id"}=${encodeURIComponent(id)}&formato=${format}`;
  return <OperationalTablePanel title="Notificações emitidas — consulta e cancelamento" triggerLabel={`Consultar documentos (${rows.length})`}>
    <TaxOperationalTable id="notificacoes-historico" resetKey={resetKey} toolbar={notice && <OperationalFilters label="Resultado"><p role="status">{notice}</p></OperationalFilters>}
      columns={[["date", "Emissão", 80, 130], ["title", "Título", 100, 200], ["taxpayer", "Contribuinte", 100, 200], ["inscription", "Inscrição", 80, 130, "identifier"], ["balance", "Saldo R$", 80, 120, "text", "right"], ["status", "Situação", 64, 110, "status"], ["reason", "Fundamento do cancelamento", 100, 230], ["actions", "Ações", 48, 48, "actions"]]}
      rows={rows.map(row => ({ id: row.id, label: row.title, values: { date: row.issuedAt, title: row.title, taxpayer: row.taxpayer, inscription: row.inscription, balance: row.balance, status: row.cancelled ? "Cancelada" : "Emitida", reason: reasons[row.id] ?? "" }, cells: { reason: row.cancelled ? "Documento cancelado" : <TaxDraftText label={`Fundamento do cancelamento — ${row.title}`} value={reasons[row.id] ?? ""} onChange={value => setReasons(current => ({ ...current, [row.id]: value }))} /> }, actions: <TaxRowActions label={row.title}>{["pdf", "txt", "xml"].map(format => <TaxRowAction key={format} href={url(row.id, format)}>Documento {format.toUpperCase()}</TaxRowAction>)}{["pdf", "txt", "xml"].map(format => <TaxRowAction key={`batch:${format}`} href={url(row.batchId, format, true)}>Lote {format.toUpperCase()}</TaxRowAction>)}{!row.cancelled && <TaxRowAction disabled={pending} onClick={() => { const reason = (reasons[row.id] ?? "").trim(); if (!reason) { onNotice("Informe o fundamento do cancelamento do documento."); return; } onCancel(row.id, reason); }}>Cancelar documento</TaxRowAction>}</TaxRowActions> }))} />
  </OperationalTablePanel>;
}
