"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckSquare, Eye, Plus } from "lucide-react";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame, OperationalLinkPagination, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import type { OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { ProcessListFilters } from "@/lib/protocols/process-listing-policy";
import { receiveProcess, receiveProcessesBatch } from "../actions";

type Processo = { id: string; protocolNumber: string; status: string; createdAt: Date; currentDepartmentId: string | null; processType: { name: string }; subject: { name: string }; person: { fullName: string } | null; company: { corporateName: string } | null };
const columns: OperationalColumn[] = [
  { key: "selection", label: "Selecionar", type: "text", initialWidth: 45, minWidth: 40, maxWidth: 65, resizable: false, sortable: false, details: "none", align: "center" },
  ...([["protocol", "Protocolo", 150, 110], ["origin", "Origem", 90, 70], ["type", "Tipo", 170, 100], ["subject", "Assunto", 230, 110], ["interested", "Interessado", 210, 110], ["date", "Data", 110, 95], ["status", "Status", 140, 90]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 650, type: key === "status" ? "status" : key === "protocol" ? "identifier" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ação", type: "actions", initialWidth: 72, minWidth: 72, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];
export default function ProcessosClient({ processos, filters, total, page, canReceive, currentDepartmentId, canCreate, returnTo }: { processos: Processo[]; filters: ProcessListFilters; total: number; page: number; pageSize: number; canReceive: boolean; currentDepartmentId: string | null; canCreate: boolean; returnTo: string }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const receivableIds = processos.filter(processo => canReceive && processo.currentDepartmentId === currentDepartmentId && processo.status === "Aguardando Recebimento").map(processo => processo.id);
  const selectedReceivableIds = selectedIds.filter(id => receivableIds.includes(id));
  function setSelected(processId: string, selected: boolean) { setSelectedIds(current => selected ? [...new Set([...current, processId])] : current.filter(id => id !== processId)); }
  function processHref(processId: string) { return `/protocolos/processos/${processId}?returnTo=${encodeURIComponent(returnTo)}`; }
  function handleReceive(processId: string) {
    setNotice(null);
    startTransition(async () => { const result = await receiveProcess(processId); if (result.error) { setNotice(result.error); return; } setSelectedIds(current => current.filter(id => id !== processId)); setNotice("Recebimento registrado."); router.refresh(); });
  }
  function handleBatchReceive() {
    if (!selectedReceivableIds.length) return;
    setNotice(null);
    startTransition(async () => { const { results } = await receiveProcessesBatch(selectedReceivableIds); const failed = results.filter(result => result.error); const received = results.length - failed.length; setSelectedIds([]); setNotice(failed.length ? `${received} processo(s) recebido(s). ${failed.length} item(ns) precisa(m) de revisão: ${failed.map(item => item.error).join(" ")}` : `${received} processo(s) recebido(s) com sucesso.`); router.refresh(); });
  }
  return <OperationalListFrame label="Protocolos" actions={<>{canCreate && <Link className={styles.newButton} href="/protocolos/processos/novo"><Plus />Novo protocolo</Link>}{selectedReceivableIds.length > 0 && <button type="button" disabled={isPending} onClick={handleBatchReceive} className={styles.dialogButton}><CheckSquare />Receber ({selectedReceivableIds.length})</button>}{notice && <OperationalFilters label="Resultado"><p role="status">{notice}</p></OperationalFilters>}</>}
    toolbar={<form action="/protocolos/processos" method="GET" className={styles.searchForm}><input aria-label="Buscar processo" name="q" defaultValue={filters.q} placeholder="Buscar protocolo, interessado, tipo ou assunto…" className={styles.searchInput} /><select name="status" aria-label="Status do processo" defaultValue={filters.status || "ATIVOS"}><option value="ATIVOS">Todos ativos</option><option value="Aguardando Recebimento">Aguardando recebimento</option><option value="Recebido">Recebido</option><option value="Em Analise">Em análise</option><option value="Concluido">Concluído</option><option value="Arquivado">Arquivado</option><option value="Cancelado">Cancelado</option></select><button className={styles.filterButton}>Filtrar</button><Link className={styles.filterButton} href="/protocolos/processos">Limpar</Link></form>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/protocolos/processos" values={{ q: filters.q, status: filters.status }} />}>
    <OperationalTable columns={columns} preferenceId="protocolos.processos" caption="Caixa do setor — protocolos" emptyMessage="Nenhum protocolo encontrado." rows={processos.map(processo => ({ id: processo.id, label: processo.protocolNumber, values: { selection: selectedIds.includes(processo.id) ? "Selecionado" : "", protocol: processo.protocolNumber, origin: "Digital", type: processo.processType.name, subject: processo.subject.name, interested: processo.person?.fullName || processo.company?.corporateName || "Não informado", date: new Date(processo.createdAt).toLocaleDateString("pt-BR"), status: processo.status }, cells: { selection: receivableIds.includes(processo.id) ? <input aria-label={`Selecionar ${processo.protocolNumber}`} type="checkbox" checked={selectedIds.includes(processo.id)} onChange={event => setSelected(processo.id, event.target.checked)} /> : null }, actions: <div className={styles.rowActions}><Link className={styles.iconButton} aria-label={`Ver atendimento ${processo.protocolNumber}`} href={processHref(processo.id)}><Eye /></Link>{receivableIds.includes(processo.id) && <button type="button" aria-label={`Receber ${processo.protocolNumber}`} disabled={isPending} onClick={() => handleReceive(processo.id)} className={styles.iconButton}><CheckSquare /></button>}</div> }))} />
  </OperationalListFrame>;
}
