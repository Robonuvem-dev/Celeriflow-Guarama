"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deletePage } from "./actions";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { ContentPreview } from "../ContentPreview";

type PortalPage = { id: string; title: string; slug: string; content: string; status: string; updatedAt: string; section: string };
const columns: OperationalColumn[] = [
  ...([["title", "Título", 260, 120], ["route", "Rota", 260, 120], ["section", "Seção", 140, 90], ["date", "Atualização", 120, 100], ["status", "Situação", 120, 85]] as [string, string, number, number][]).map(([key, label, initialWidth, minWidth]): OperationalColumn => ({ key, label, initialWidth, minWidth, maxWidth: 800, type: key === "status" ? "status" : "text", resizable: true, sortable: false, details: "overflow" })),
  { key: "actions", label: "Ações", type: "actions", initialWidth: 80, minWidth: 70, maxWidth: 100, resizable: false, sortable: false, details: "none" },
];
export default function PaginasTable({ pages }: { pages: PortalPage[] }) {
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const router = useRouter();
  const sections = Array.from(new Set(pages.map(item => item.section))).sort();
  const statuses = Array.from(new Set(pages.map(item => item.status))).sort();
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const filtered = pages.filter(item => (!term || [item.title, item.slug, item.content].some(value => value.toLocaleLowerCase("pt-BR").includes(term))) && (!section || item.section === section) && (!status || item.status === status));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const handleDelete = (id: string) => { if (confirm("Tem certeza que deseja excluir esta página?")) startTransition(async () => { await deletePage(id); router.refresh(); }); };
  return <OperationalListFrame label="Páginas institucionais" toolbar={<><input aria-label="Buscar páginas" type="search" className={styles.searchInput} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar título, rota ou conteúdo…" /><OperationalFilters activeCount={Number(!!section) + Number(!!status)}><label>Seção<select value={section} onChange={event => { setSection(event.target.value); setPage(1); }}><option value="">Todas as seções</option>{sections.map(value => <option key={value}>{value}</option>)}</select></label><label>Situação<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={() => { setSection(""); setStatus(""); setPage(1); }}>Limpar filtros</button></OperationalFilters></>} pagination={<OperationalPagination page={activePage} total={filtered.length} pending={isPending} onPageChange={setPage} />}>
    <OperationalTable columns={columns} preferenceId="transparencia.paginas" caption="Páginas institucionais" emptyMessage="Nenhuma página encontrada." rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(item => ({ id: item.id, label: item.title, values: { title: item.title, route: `/portal/${item.slug}`, section: item.section, date: new Date(item.updatedAt).toLocaleDateString("pt-BR"), status: item.status }, actions: <div className={styles.rowActions}><ContentPreview title={item.title} description="Conteúdo integral da página" text={`/portal/${item.slug}\n${item.status}\n\n${item.content}`} /><button type="button" disabled={isPending} className={styles.iconButton} aria-label={`Excluir ${item.title}`} onClick={() => handleDelete(item.id)}><Trash2 /></button></div> }))} />
  </OperationalListFrame>;
}
