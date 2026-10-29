"use client";

import { useDeferredValue, useState } from "react";
import { Eye } from "lucide-react";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type RecordKind = "Agente" | "Espaço" | "Patrimônio";
export type CulturalRecord = { id: string; kind: RecordKind; name: string; classification: string; status: string; active: boolean; references: { label: string; value: string }[] };
const columns: OperationalColumn[] = [
  { key: "name", label: "Identificação", type: "identifier", initialWidth: 280, minWidth: 120, maxWidth: 700, resizable: true, sortable: false, details: "overflow" },
  { key: "kind", label: "Categoria", type: "text", initialWidth: 120, minWidth: 85, maxWidth: 250, resizable: true, sortable: false, details: "overflow" },
  { key: "classification", label: "Classificação", type: "text", initialWidth: 220, minWidth: 110, maxWidth: 600, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 130, minWidth: 85, maxWidth: 300, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 65, minWidth: 50, maxWidth: 80, resizable: false, sortable: false, details: "none" },
];

export function GestaoCulturalClient({ records }: { records: CulturalRecord[] }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<RecordKind | "Todos">("Todos");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<CulturalRecord | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLocaleLowerCase("pt-BR"));
  const filtered = records.filter((record) => {
    const text = [record.name, record.classification, record.status, ...record.references.map((reference) => reference.value)].join(" ").toLocaleLowerCase("pt-BR");
    return (kind === "Todos" || record.kind === kind) && (!deferredSearch || text.includes(deferredSearch));
  });
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visible = filtered.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  return <>
    <OperationalListFrame label="Registros culturais" toolbar={<><input aria-label="Buscar registros culturais" type="search" className={styles.searchInput} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar nome, referência ou status…" /><select aria-label="Categoria cultural" value={kind} onChange={(event) => { setKind(event.target.value as RecordKind | "Todos"); setPage(1); }}><option>Todos</option><option>Agente</option><option>Espaço</option><option>Patrimônio</option></select></>} pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
      <OperationalTable columns={columns} preferenceId="cultura.gestao" caption="Registros culturais" emptyMessage="Nenhum registro encontrado." rows={visible.map((record) => ({ id: record.kind + record.id, label: record.name, values: { name: record.name, kind: record.kind, classification: record.classification, status: record.status }, actions: <button type="button" className={styles.iconButton} onClick={() => setDetail(record)} aria-label={`Ver referências de ${record.name}`}><Eye /></button> }))} />
    </OperationalListFrame>
    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}><DialogContent><DialogHeader><DialogTitle>{detail?.name}</DialogTitle><DialogDescription>{detail?.kind} · {detail?.classification}</DialogDescription></DialogHeader><dl className="space-y-3">{detail?.references.map((reference) => <div key={reference.label}><dt className="text-xs font-semibold text-slate-500">{reference.label}</dt><dd className="mt-0.5 break-words text-sm text-slate-700">{reference.value}</dd></div>)}</dl><DialogFooter><Button onClick={() => setDetail(null)}>Fechar</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
