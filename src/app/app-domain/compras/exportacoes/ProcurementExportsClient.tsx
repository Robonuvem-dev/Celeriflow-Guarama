"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { ClipboardCheck, FileDown, FilePlus2, Send, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { notifyPendingPriceResearchInvitationsAction, queueProcurementExportAction, recordProcurementExportOutcomeAction } from "./actions";
import { ComprasOperationalList, comprasColumn } from "../_components/ComprasOperationalList";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";

type ExportStatus = "PENDING_CONFIGURATION" | "QUEUED" | "CONFIRMED" | "REJECTED";
type ExportPackageRow = {
  id: string; packageCode: string; packageName: string; requirementIds: string[];
  integrationCode: string; targetId: string; targetType: string; targetReference: string;
  targetSecondaryReference: string; state: ExportStatus | null; message: string | null;
  blockedReasons: string[]; runId: string | null; hasExportPackage: boolean; externalId: string | null; createdAt: string | null;
};
function stateLabel(state: ExportStatus | null) {
  if (state === "PENDING_CONFIGURATION") return "Pendente de configuracao";
  if (state === "QUEUED") return "Enfileirado";
  if (state === "CONFIRMED") return "Confirmado";
  if (state === "REJECTED") return "Rejeitado";
  return "Sem pacote";
}
const columns = [
  comprasColumn("package", "Pacote", 100, 200, "identifier"), comprasColumn("requirements", "Requisitos", 80, 140),
  comprasColumn("origin", "Origem", 90, 160), comprasColumn("secondary", "Referência de origem", 90, 170),
  comprasColumn("destination", "Destino", 80, 140), comprasColumn("status", "Situação", 90, 160, "status"),
  comprasColumn("evidence", "Última evidência", 110, 170), comprasColumn("external", "Referência externa", 90, 160),
  comprasColumn("message", "Mensagem", 100, 200), comprasColumn("blocked", "Impedimentos", 100, 200),
  comprasColumn("actions", "Ações", 96, 100, "actions"),
];

export default function ProcurementExportsClient({ rows, pendingInvitationCount }: { rows: ExportPackageRow[]; pendingInvitationCount: number }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [outcomeRow, setOutcomeRow] = useState<ExportPackageRow | null>(null);
  const [outcomeStatus, setOutcomeStatus] = useState<"CONFIRMED" | "REJECTED">("CONFIRMED");
  const [externalReference, setExternalReference] = useState("");
  const [pending, startTransition] = useTransition();

  function prepare(row: ExportPackageRow) {
    setError(""); setNotice("");
    startTransition(async () => {
      const result = await queueProcurementExportAction({ packageCode: row.packageCode, targetId: row.targetId });
      if (result.error) { setError(result.error); return; }
      setNotice(result.data?.message ?? "Pacote atualizado."); router.refresh();
    });
  }
  function notifyPendingInvitations() {
    setError(""); setNotice("");
    startTransition(async () => {
      const result = await notifyPendingPriceResearchInvitationsAction();
      if (result.error) { setError(result.error); return; }
      setNotice(result.data?.message ?? "Lembretes internos atualizados."); router.refresh();
    });
  }
  function openOutcome(row: ExportPackageRow) {
    setOutcomeRow(row); setOutcomeStatus("CONFIRMED"); setExternalReference(""); setError(""); setNotice("");
  }
  function submitOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!outcomeRow?.runId) return;
    setError(""); setNotice("");
    startTransition(async () => {
      const result = await recordProcurementExportOutcomeAction({ runId: outcomeRow.runId!, status: outcomeStatus, externalReference });
      if (result.error) { setError(result.error); return; }
      setNotice(result.data?.message ?? "Retorno externo registrado."); setOutcomeRow(null); router.refresh();
    });
  }

  return <>
    <ComprasOperationalList label="Pacotes de Exportação de Compras" preferenceId="compras-exportacoes" columns={columns}
      description="CLC-038, CLC-040, CLC-048 e CLC-079. O fluxo prepara pacotes e registra retornos; não transmite automaticamente."
      actions={<><Link href="/configuracoes/integracoes" className={styles.filterButton}><Settings2 />Configurações</Link><button type="button" className={styles.newButton} onClick={notifyPendingInvitations} disabled={pending} aria-label={`Lembretes internos (${pendingInvitationCount})`} title={`Lembretes internos (${pendingInvitationCount})`}><Send /><span className={styles.newLabel}>Lembretes internos ({pendingInvitationCount})</span></button></>}
      filters={[
        { key: "integration", label: "Destino", options: [{ value: "TCE_PB_SAGRES", label: "TCE" }, { value: "PNCP", label: "PNCP" }] },
        { key: "state", label: "Situação", options: ["NONE", "PENDING_CONFIGURATION", "QUEUED", "CONFIRMED", "REJECTED"].map((value) => ({ value, label: stateLabel(value === "NONE" ? null : value as ExportStatus) })) },
      ]}
      rows={rows.map((row) => ({ id: row.id, label: `${row.packageName} · ${row.targetReference}`,
        search: [row.packageName, row.packageCode, row.targetReference, row.targetSecondaryReference, row.requirementIds.join(" ")].join(" "), filters: { integration: row.integrationCode, state: row.state ?? "NONE" },
        values: { package: row.packageName, requirements: row.requirementIds.join(" · "), origin: row.targetReference, secondary: row.targetSecondaryReference, destination: row.integrationCode === "PNCP" ? "PNCP" : "TCE-PB / SAGRES", status: stateLabel(row.state), evidence: row.createdAt ? new Date(row.createdAt).toLocaleString("pt-BR") : "-", external: row.externalId || "-", message: row.message || "-", blocked: row.blockedReasons.join("; ") || "-" },
        actions: <div className={styles.rowActions}>
          {row.state === "PENDING_CONFIGURATION" ? <Link href="/configuracoes/integracoes" className={styles.iconButton} aria-label={`Configurar ${row.packageName}`} title="Configurar"><Settings2 /></Link> : row.state !== "QUEUED" && row.state !== "CONFIRMED" && row.state !== "REJECTED" ? <button type="button" onClick={() => prepare(row)} disabled={pending} className={styles.iconButton} aria-label={`Preparar ${row.packageName}`} title="Preparar"><FilePlus2 /></button> : null}
          {row.runId && row.hasExportPackage && <a href={`/compras/exportacoes/${encodeURIComponent(row.runId)}/download`} className={styles.iconButton} aria-label={`Baixar ${row.packageName}`} title="Baixar"><FileDown /></a>}
          {row.runId && row.state === "QUEUED" && <button type="button" onClick={() => openOutcome(row)} disabled={pending} className={styles.iconButton} aria-label={`Registrar retorno de ${row.packageName}`} title="Registrar retorno"><ClipboardCheck /></button>}
        </div>,
      }))} />
    <Dialog open={Boolean(outcomeRow || error || notice)} onOpenChange={(open) => { if (!open && !pending) { setOutcomeRow(null); setError(""); setNotice(""); } }}>
      <DialogContent><DialogHeader><DialogTitle>{outcomeRow ? `Registrar retorno externo: ${outcomeRow.targetReference}` : "Exportação de compras"}</DialogTitle><DialogDescription>Confirme somente com referência recebida fora do sistema. Este registro não comprova transmissão automática.</DialogDescription></DialogHeader>
        {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
        {outcomeRow && <form onSubmit={submitOutcome} className={styles.filterFields}>
          <label>Resultado<select aria-label="Resultado" value={outcomeStatus} onChange={(event) => setOutcomeStatus(event.target.value as "CONFIRMED" | "REJECTED")}><option value="CONFIRMED">Confirmado</option><option value="REJECTED">Rejeitado</option></select></label>
          <label>Referência externa<input required value={externalReference} onChange={(event) => setExternalReference(event.target.value)} placeholder="recibo-ou-protocolo" /></label>
          <div className={styles.dialogButtons}><button type="submit" disabled={pending || !externalReference.trim()} className={styles.primaryButton}>Registrar</button><button type="button" onClick={() => setOutcomeRow(null)} disabled={pending} className={styles.dialogButton}>Cancelar</button></div>
        </form>}
      </DialogContent>
    </Dialog>
  </>;
}
