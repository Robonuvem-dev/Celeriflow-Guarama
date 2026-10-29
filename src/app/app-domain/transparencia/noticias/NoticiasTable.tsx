"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteNews } from "./actions";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { ContentPreview } from "../ContentPreview";

type News = { id: string; title: string; subtitle: string | null; content: string; imageUrl: string | null; status: string; publishedAt: string | null; createdAt: string; authorName: string | null; category: string };
const columns: OperationalColumn[] = [
  ...([["title", "Título", 300, 120], ["category", "Categoria", 160, 100], ["date", "Publicação", 120, 100], ["author", "Responsável", 190, 110], ["status", "Situação", 120, 85]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 800, type: key === "status" ? "status" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ações", type: "actions", initialWidth: 80, minWidth: 70, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];
export default function NoticiasTable({ news }: { news: News[] }) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const router = useRouter();
  const categories = Array.from(new Set(news.map(item => item.category))).sort();
  const statuses = Array.from(new Set(news.map(item => item.status))).sort();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = news.filter(item => (!term || [item.title, item.subtitle || "", item.content, item.authorName || ""].some(value => value.toLocaleLowerCase("pt-BR").includes(term))) && (!category || item.category === category) && (!status || item.status === status));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const handleDelete = (id: string) => { if (confirm("Tem certeza que deseja excluir esta notícia?")) startTransition(async () => { await deleteNews(id); router.refresh(); }); };
  return <OperationalListFrame label="Notícias" toolbar={<><input aria-label="Buscar notícias" type="search" className={styles.searchInput} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar título, texto ou autor…" /><OperationalFilters activeCount={Number(!!category) + Number(!!status)}><label>Categoria<select value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">Todas as categorias</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label><label>Situação<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={() => { setCategory(""); setStatus(""); setPage(1); }}>Limpar filtros</button></OperationalFilters></>} pagination={<OperationalPagination page={activePage} total={filtered.length} pending={isPending} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="transparencia.noticias" caption="Notícias" emptyMessage="Nenhuma notícia encontrada." rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(item => ({ id: item.id, label: item.title, values: { title: item.title, category: item.category, date: new Date(item.publishedAt || item.createdAt).toLocaleDateString("pt-BR"), author: item.authorName || "Sem responsável", status: item.status }, actions: <div className={styles.rowActions}><ContentPreview title={item.title} description="Prévia integral da notícia" text={`${item.category}\n${item.authorName || "Sem responsável"}\n${item.status}\n${item.subtitle ? `${item.subtitle}\n\n` : ""}${item.content}`} imageUrl={item.imageUrl} /><button type="button" disabled={isPending} className={styles.iconButton} aria-label={`Excluir ${item.title}`} onClick={() => handleDelete(item.id)}><Trash2 /></button></div> }))} />
  </OperationalListFrame>;
}
