"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import { deleteDiary } from "./actions";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";

type Diary = { id: string; editionNumber: number; publishDate: string; status: string; pdfUrl: string };
const columns: OperationalColumn[] = [
  ...([["edition", "Edição", 110, 80], ["date", "Data", 110, 95], ["type", "Tipo", 160, 110], ["status", "Situação", 130, 85], ["publication", "Publicação", 350, 120]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 900, type: key === "status" ? "status" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ações", type: "actions", initialWidth: 80, minWidth: 70, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];
export default function DiarioTable({ diaries }: { diaries: Diary[] }) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const router = useRouter();
  const statuses = Array.from(new Set(diaries.map(diary => diary.status))).sort();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = diaries.filter(diary => (!term || [String(diary.editionNumber), diary.status, new Date(diary.publishDate).toLocaleDateString("pt-BR")].some(value => value.toLocaleLowerCase("pt-BR").includes(term))) && (!status || diary.status === status));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const handleDelete = (id: string) => { if (confirm("Tem certeza que deseja excluir esta edição?")) startTransition(async () => { await deleteDiary(id); router.refresh(); }); };
  return <OperationalListFrame label="Diário Oficial" toolbar={<><input aria-label="Buscar edições" type="search" className={styles.searchInput} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar edição, data ou situação…" /><select aria-label="Situação da edição" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></>} pagination={<OperationalPagination page={activePage} total={filtered.length} pending={isPending} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="transparencia.diario" caption="Diário Oficial" emptyMessage="Nenhuma edição encontrada." rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(diary => ({ id: diary.id, label: `Edição ${diary.editionNumber}`, values: { edition: `Nº ${diary.editionNumber}`, date: new Date(diary.publishDate).toLocaleDateString("pt-BR"), type: "Edição regular", status: diary.status, publication: diary.pdfUrl }, actions: <div className={styles.rowActions}><Link href={diary.pdfUrl} target="_blank" rel="noopener noreferrer" className={styles.iconButton} aria-label={`Ler edição ${diary.editionNumber}`}><ExternalLink /></Link><button type="button" className={styles.iconButton} aria-label={`Excluir edição ${diary.editionNumber}`} disabled={isPending} onClick={() => handleDelete(diary.id)}><Trash2 /></button></div> }))} />
  </OperationalListFrame>;
}
