"use client";
import { useCallback, useEffect, useState } from "react";
import { gedManage } from "./ged-management-client";
import { gedCommand } from "./ged-client";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
type Queue = { page: number; total: number; rows: { id: string; title: string; status: string; attempts: number; error: string | null; nextAttemptAt: string; steps: Record<string, string>; versionNumber: number }[] };
const columns: OperationalColumn[] = [
  { key: "title", label: "Documento", type: "text", initialWidth: 230, minWidth: 110, resizable: true, sortable: false, details: "overflow" },
  { key: "version", label: "Versão", type: "identifier", initialWidth: 65, minWidth: 50, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Estado", type: "status", initialWidth: 100, minWidth: 75, resizable: true, sortable: false, details: "overflow" },
  { key: "steps", label: "Etapas", type: "text", initialWidth: 180, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "attempts", label: "Tentativas", type: "identifier", align: "right", initialWidth: 80, minWidth: 60, resizable: true, sortable: false, details: "overflow" },
  { key: "next", label: "Próxima tentativa", type: "text", initialWidth: 150, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "error", label: "Falha", type: "text", initialWidth: 180, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ação", type: "actions", initialWidth: 105, minWidth: 95, resizable: false, sortable: false, details: "none" },
];
export function GedQueuePanel() {
  const [queue, setQueue] = useState<Queue>({ page: 1, total: 0, rows: [] }), [status, setStatus] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const read = useCallback((page = 1) => gedManage<Queue>("jobs", { page: String(page), status }), [status]);
  async function load(page = 1) { setBusy(true); try { setQueue(await read(page)); } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na consulta."); } finally { setBusy(false); } }
  useEffect(() => { let active = true; void read().then(result => { if (active) setQueue(result); }).catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Falha na consulta."); }); return () => { active = false; }; }, [read]);
  return <OperationalTablePanel title="Fila de processamento" triggerLabel="Consultar fila de processamento">
    <OperationalListFrame label="Fila de processamento" actions={<button type="button" disabled={busy} className={styles.dialogButton} onClick={() => void load(queue.page)}>Atualizar fila</button>}
      toolbar={<><select aria-label="Estado da fila" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os estados</option>{["PENDING", "RUNNING", "SUCCEEDED", "FAILED"].map(value => <option key={value}>{value}</option>)}</select>{message && <span role="status">{message}</span>}</>}
      pagination={<OperationalPagination page={queue.page} total={queue.total} onPageChange={page => { if (!busy) void load(page); }} />}>
      <OperationalTable columns={columns} preferenceId="ged.processing.queue.v1" state={busy ? "loading" : "ready"} rows={queue.rows.slice(0, OPERATIONAL_PAGE_SIZE).map(job => ({ id: job.id, label: job.title,
        values: { title: job.title, version: String(job.versionNumber), status: job.status, steps: Object.entries(job.steps).map(([step, state]) => `${step}: ${state}`).join(" · "), attempts: String(job.attempts), next: new Date(job.nextAttemptAt).toLocaleString("pt-BR"), error: job.error ?? "" },
        actions: <button type="button" className={styles.dialogButton} disabled={busy || job.status === "RUNNING"} onClick={async () => { setBusy(true); try { await gedCommand("process", job.id); await load(queue.page); } catch (error) { setMessage(error instanceof Error ? error.message : "Falha no processamento."); } finally { setBusy(false); } }}>Reprocessar</button>,
      }))} />
    </OperationalListFrame>
  </OperationalTablePanel>;
}
