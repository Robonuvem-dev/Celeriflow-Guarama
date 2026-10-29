"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, paginateFullValue, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type CulturaProjetoListItem = {
  id: string; numero: string; nome: string; descricao: string | null; categoria: string; status: string; valorSolicitado: number | null; createdAt: string;
  agente: { nome: string; tipo: string; segmento: string; pessoaNome: string | null; empresaNome: string | null };
  appropriation: { id: string; code: string } | null; commitment: { id: string; number: string } | null; purchaseProcess: { id: string; number: string } | null; contract: { id: string; number: string } | null; documentCount: number;
};
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const proponent = (project: CulturaProjetoListItem) => project.agente.pessoaNome ?? project.agente.empresaNome ?? project.agente.nome;
const columns: OperationalColumn[] = [
  { key: "numero", label: "Número", type: "identifier", initialWidth: 110, minWidth: 80, maxWidth: 200, resizable: true, sortable: false, details: "overflow" },
  { key: "nome", label: "Identificação", type: "text", initialWidth: 240, minWidth: 120, maxWidth: 600, resizable: true, sortable: false, details: "overflow" },
  { key: "categoria", label: "Categoria", type: "text", initialWidth: 130, minWidth: 90, maxWidth: 300, resizable: true, sortable: false, details: "overflow" },
  { key: "responsavel", label: "Responsável", type: "text", initialWidth: 190, minWidth: 100, maxWidth: 450, resizable: true, sortable: false, details: "overflow" },
  { key: "data", label: "Data", type: "text", initialWidth: 110, minWidth: 95, maxWidth: 180, resizable: true, sortable: false, details: "overflow" },
  { key: "status", label: "Situação", type: "status", initialWidth: 130, minWidth: 85, maxWidth: 300, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 65, minWidth: 50, maxWidth: 80, resizable: false, sortable: false, details: "none" },
];
function ProjectDescription({ text }: { text: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const measure = () => {
      const probe = document.createElement("div");
      const computed = getComputedStyle(element);
      Object.assign(probe.style, { position: "fixed", visibility: "hidden", width: `${element.clientWidth}px`, font: computed.font, lineHeight: computed.lineHeight, whiteSpace: "pre-wrap", overflowWrap: "anywhere" });
      document.body.appendChild(probe);
      try { setPages(paginateFullValue(text, value => { probe.textContent = value; return probe.scrollHeight <= element.clientHeight && probe.scrollWidth <= element.clientWidth + 1; })); setPage(0); }
      finally { probe.remove(); }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    document.fonts.addEventListener("loadingdone", measure);
    return () => { observer.disconnect(); document.fonts.removeEventListener("loadingdone", measure); };
  }, [text]);
  return <><div ref={body} style={{ height: "min(30dvh, 240px)", fontSize: ".8125rem", lineHeight: "1.4", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{pages[page] || "Preparando leitura…"}</div><div className={styles.dialogButtons}><button type="button" className={styles.dialogButton} disabled={page === 0} onClick={() => setPage(current => current - 1)}>Anterior</button><span aria-live="polite">Trecho {page + 1} de {Math.max(1, pages.length)}</span><button type="button" className={styles.dialogButton} disabled={page >= pages.length - 1} onClick={() => setPage(current => current + 1)}>Próximo</button></div></>;
}
export default function CulturaProjetosClient({ projetos }: { projetos: CulturaProjetoListItem[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("todas");
  const [status, setStatus] = useState("todos");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<CulturaProjetoListItem | null>(null);
  const [detailSection, setDetailSection] = useState(0);
  const deferred = useDeferredValue(search.trim().toLocaleLowerCase("pt-BR"));
  const categories = Array.from(new Set(projetos.map((project) => project.categoria))).sort();
  const statuses = Array.from(new Set(projetos.map((project) => project.status))).sort();
  const filtered = projetos.filter((project) => (!deferred || [project.numero, project.nome, project.descricao ?? "", proponent(project)].some((value) => value.toLocaleLowerCase("pt-BR").includes(deferred))) && (category === "todas" || project.categoria === category) && (status === "todos" || project.status === status));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  return <>
    <OperationalListFrame label="Projetos culturais" toolbar={<><input aria-label="Buscar projetos" className={styles.searchInput} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Buscar projeto, número ou responsável…" /><OperationalFilters activeCount={Number(category !== "todas") + Number(status !== "todos")}><label>Categoria<select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="todas">Todas as categorias</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label><label>Situação<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="todos">Todos os status</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label><button type="button" onClick={() => { setCategory("todas"); setStatus("todos"); setPage(1); }}>Limpar filtros</button></OperationalFilters></>} pagination={<OperationalPagination page={activePage} total={filtered.length} onPageChange={setPage} />}>
      <OperationalTable columns={columns} preferenceId="cultura.projetos" caption="Fomento e projetos" emptyMessage="Nenhum projeto encontrado." rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map((project) => ({ id: project.id, label: project.nome, values: { numero: project.numero, nome: project.nome, categoria: project.categoria, responsavel: proponent(project), data: new Date(project.createdAt).toLocaleDateString("pt-BR"), status: project.status }, actions: <button type="button" className={styles.iconButton} aria-label={`Ver vínculos e descrição de ${project.nome}`} onClick={() => { setDetail(project); setDetailSection(0); }}><Eye /></button> }))} />
    </OperationalListFrame>
    <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}><DialogContent><DialogHeader><DialogTitle>{detail?.nome}</DialogTitle><DialogDescription>{detail?.numero} · {detail?.categoria} · {detail?.status}</DialogDescription></DialogHeader>{detail && <>
      <label>Área de detalhes<select value={detailSection} onChange={(event) => setDetailSection(Number(event.target.value))}><option value={0}>Responsável e valor</option><option value={1}>Documentos e vínculos</option><option value={2}>Descrição integral</option></select></label>
      {detailSection === 0 && <dl><dt>Responsável</dt><dd>{proponent(detail)}</dd><dt>Valor solicitado</dt><dd>{detail.valorSolicitado === null ? "Não informado" : currency.format(detail.valorSolicitado)}</dd></dl>}
      {detailSection === 1 && <dl><dt>Documentos</dt><dd>{detail.documentCount}</dd><dt>Vínculos</dt><dd>{[detail.appropriation?.code, detail.commitment?.number, detail.purchaseProcess?.number, detail.contract?.number].filter(Boolean).join(" · ") || "Sem vínculos"}</dd></dl>}
      {detailSection === 2 && <ProjectDescription text={detail.descricao || "Sem descrição."} />}
    </>}<DialogFooter><Button onClick={() => setDetail(null)}>Fechar</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
