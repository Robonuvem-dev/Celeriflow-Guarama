"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { updateItbiParty, type ItbiPartyDraft } from "./party-drafts";

const columns: OperationalColumn[] = [
  { key: "order", label: "Parte", type: "text", initialWidth: 70, minWidth: 56, resizable: true, sortable: false, details: "overflow" },
  { key: "document", label: "CPF/CNPJ", type: "identifier", initialWidth: 400, minWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "share", label: "Participação na fração (%)", type: "text", initialWidth: 260, minWidth: 150, resizable: true, sortable: false, details: "none", align: "right" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 90, minWidth: 90, maxWidth: 90, resizable: false, sortable: false, details: "none" },
];
const input = "h-6 w-full min-w-0 rounded border bg-white px-1 text-sm";

export function OnlineItbiPartyEditor({ title, rows, update, pending }: {
  title: string; rows: ItbiPartyDraft[]; update: Dispatch<SetStateAction<ItbiPartyDraft[]>>; pending: boolean;
}) {
  const [search, setSearch] = useState("");
  const [requestedPage, setPage] = useState(1);
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = rows.map((row, index) => ({ row, index })).filter(({ row, index }) => !term || `${index + 1} ${row.document} ${row.sharePercent}`.toLocaleLowerCase("pt-BR").includes(term));
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const totalShare = rows.reduce((total, row) => total + row.sharePercent, 0);
  const change = (id: string, patch: Parameters<typeof updateItbiParty>[2]) => update((current) => updateItbiParty(current, id, patch));

  return <OperationalTablePanel title={title} triggerLabel={`Editar partes (${rows.length})`} description="A paginação e o filtro alteram somente a visualização. Todas as partes e suas participações permanecem na declaração ao fechar o painel.">
    <OperationalListFrame label={title} actions={<button type="button" className={styles.dialogButton} disabled={pending || rows.length >= 100} onClick={() => { update((current) => current.length < 100 ? [...current, { draftId: crypto.randomUUID(), document: "", sharePercent: 0 }] : current); setSearch(""); setPage(Math.ceil((rows.length + 1) / OPERATIONAL_PAGE_SIZE)); }}>Adicionar parte</button>}
      toolbar={<><input aria-label={`Filtrar ${title}`} className={styles.searchInput} type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar CPF/CNPJ ou número da parte" /><span className="whitespace-nowrap text-sm" role="status">Participação total: {totalShare.toLocaleString("pt-BR", { maximumFractionDigits: 6 })}%</span></>}
      pagination={<OperationalPagination page={page} total={filtered.length} pending={pending} onPageChange={setPage} />}>
      <OperationalTable preferenceId="portal-itbi-partes-edicao" caption={title} columns={columns} rows={filtered.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE).map(({ row, index }) => ({
        id: row.draftId, label: `${title} — parte ${index + 1}`, values: { order: String(index + 1), document: row.document || "Não informado", share: String(row.sharePercent) }, cells: {
          document: <input aria-label={`CPF/CNPJ da parte ${index + 1}`} disabled={pending} required maxLength={20} className={input} value={row.document} onChange={(event) => change(row.draftId, { document: event.target.value })} />,
          share: <input aria-label={`Participação da parte ${index + 1} (%)`} disabled={pending} required type="number" min="0.000001" max="100" step="0.000001" className={input} value={row.sharePercent} onChange={(event) => change(row.draftId, { sharePercent: Number(event.target.value) })} />,
        }, actions: <button type="button" disabled={pending || rows.length === 1} onClick={() => update((current) => current.length > 1 ? current.filter((item) => item.draftId !== row.draftId) : current)}>Remover</button>,
      }))} />
    </OperationalListFrame>
  </OperationalTablePanel>;
}
