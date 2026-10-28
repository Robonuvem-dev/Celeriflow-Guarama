"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Copy, FileText, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fitOperationalWidths, operationalWidthPreferences, OPERATIONAL_PAGE_SIZE, OPERATIONAL_ROW_HEIGHT, paginateFullValue, resizeOperationalWidths, type OperationalColumn } from "@/lib/operational-tables";
import { useOperationalWorkspace } from "./OperationalWorkspace";
import styles from "./operational.module.css";

export type OperationalRow = { id: string; label: string; values: Record<string, string>; actions?: ReactNode };
type DetailSelection = { field: string; record: string; value: string; trigger: HTMLButtonElement };

function FullValueCell({ column, row, onDetails }: { column: OperationalColumn; row: OperationalRow; onDetails: (selection: DetailSelection) => void }) {
  const value = row.values[column.key] || "—";
  const container = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    if (column.details !== "overflow" || !container.current || !preview.current) return;
    const measure = () => {
      if (container.current && preview.current) setOverflow(preview.current.scrollWidth > container.current.clientWidth + .5);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container.current);
    observer.observe(preview.current);
    document.fonts.addEventListener("loadingdone", measure);
    return () => { observer.disconnect(); document.fonts.removeEventListener("loadingdone", measure); };
  }, [column.details, value]);
  const details = value !== "—" && (column.details === "always" || (column.details === "overflow" && overflow));
  return <div ref={container} className={`${styles.cell} ${column.type === "identifier" ? styles.identifier : ""}`}>
    <span ref={preview} className={`${styles.preview} ${column.type === "status" ? styles.status : ""}`} data-value={column.type === "status" ? value : undefined}>{value}</span>
    {details && <button type="button" className={styles.iconButton} aria-label={`Ver ${column.label.toLocaleLowerCase("pt-BR")} completo de ${row.label}`} title={`Ver ${column.label.toLocaleLowerCase("pt-BR")} completo`}
      onClick={(event) => onDetails({ field: column.label, record: row.label, value, trigger: event.currentTarget })}><FileText aria-hidden="true" /></button>}
  </div>;
}

function DetailValue({ selection, onClose, closeRef }: { selection: DetailSelection; onClose: () => void; closeRef: RefObject<HTMLButtonElement | null> }) {
  const body = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const probe = document.createElement("div");
        const computed = getComputedStyle(element);
        Object.assign(probe.style, { position: "fixed", top: "0", left: "0", visibility: "hidden", pointerEvents: "none", width: `${element.clientWidth}px`, font: computed.font, lineHeight: computed.lineHeight, whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: "0", border: "0" });
        document.body.appendChild(probe);
        try {
          const next = paginateFullValue(selection.value, (text) => { probe.textContent = text; return probe.scrollHeight <= element.clientHeight && probe.scrollWidth <= element.clientWidth + 1; });
          setPages(next); setPage(0);
        } finally { probe.remove(); }
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    document.fonts.addEventListener("loadingdone", measure);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); document.fonts.removeEventListener("loadingdone", measure); };
  }, [selection.value]);

  async function copyFullValue() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(selection.value);
      else {
        const input = document.createElement("textarea");
        input.value = selection.value;
        Object.assign(input.style, { position: "fixed", opacity: "0", width: "1px", height: "1px", top: "0", left: "0" });
        dialog.current?.appendChild(input);
        try { input.select(); if (!document.execCommand("copy")) throw new Error("Cópia indisponível."); }
        finally { input.remove(); closeRef.current?.focus(); }
      }
      setCopyStatus("Conteúdo integral copiado.");
    } catch { setCopyStatus("Não foi possível copiar automaticamente. O conteúdo integral permanece disponível nas páginas de leitura."); }
  }

  return <div ref={dialog} className="contents">
    <DialogHeader><DialogTitle>{selection.field}</DialogTitle><DialogDescription>Unidade {selection.record} · Conteúdo integral</DialogDescription></DialogHeader>
    <div ref={body} className={styles.detailBody} data-full-value-body aria-label={`Conteúdo de ${selection.field}`}>{pages.length ? pages[page] : "Preparando leitura…"}</div>
    <div className={styles.dialogFooter}>
      <div>
        <div className={styles.dialogButtons}>
          <button type="button" className={styles.iconButton} disabled={page <= 0} onClick={() => setPage((current) => current - 1)} aria-label="Trecho anterior"><ChevronLeft /></button>
          <span aria-live="polite">Trecho {page + 1} de {Math.max(1, pages.length)}</span>
          <button type="button" className={styles.iconButton} disabled={page >= pages.length - 1} onClick={() => setPage((current) => current + 1)} aria-label="Próximo trecho"><ChevronRight /></button>
        </div>
        <span role="status" className="text-xs">{copyStatus}</span>
      </div>
      <div className={styles.dialogButtons}>
        <button type="button" className={styles.dialogButton} onClick={() => void copyFullValue()}><Copy />Copiar tudo</button>
        <button ref={closeRef} type="button" className={styles.dialogButton} onClick={onClose}><X />Fechar</button>
      </div>
    </div>
  </div>;
}

export function OperationalTable({ columns, rows, preferenceId, resetVersion = 0, state = "ready", onRetry }: {
  columns: readonly OperationalColumn[];
  rows: OperationalRow[];
  preferenceId: string;
  resetVersion?: number;
  state?: "ready" | "loading" | "error";
  onRetry?: () => void;
}) {
  const { userId, device } = useOperationalWorkspace();
  const viewport = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ index: number; x: number; widths: number[] } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, scale: 1 });
  const [preferences, setPreferences] = useState<Record<string, number> | null>(null);
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const previousReset = useRef(resetVersion);
  const preferenceKey = `celeriflow:operational-table:${preferenceId}:${userId}:v1`;

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      drag.current = null;
      setDimensions({ width: element.clientWidth, height: element.clientHeight, scale: parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const rootObserver = new MutationObserver(measure);
    rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    document.fonts.addEventListener("loadingdone", measure);
    return () => { observer.disconnect(); rootObserver.disconnect(); document.fonts.removeEventListener("loadingdone", measure); };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        if (previousReset.current !== resetVersion) {
          localStorage.removeItem(preferenceKey); setPreferences(null);
        } else {
          const saved = JSON.parse(localStorage.getItem(preferenceKey) || "null");
          setPreferences(saved && !Array.isArray(saved) && columns.every((column) => typeof saved[column.key] === "number" && Number.isFinite(saved[column.key]) && saved[column.key] > 0 && saved[column.key] <= 1) ? saved : null);
        }
      } catch { setPreferences(null); }
      previousReset.current = resetVersion;
    });
    return () => cancelAnimationFrame(frame);
  }, [columns, preferenceKey, resetVersion]);

  const scaledColumns = useMemo(() => columns.map((column) => ({ ...column, initialWidth: Math.round(column.initialWidth * dimensions.scale), minWidth: Math.ceil(column.minWidth * dimensions.scale), maxWidth: column.maxWidth === undefined ? undefined : Math.max(Math.ceil(column.minWidth * dimensions.scale), Math.floor(column.maxWidth * dimensions.scale)) })), [columns, dimensions.scale]);
  const minimum = scaledColumns.reduce((sum, column) => sum + column.minWidth, 0);
  const phone = device === "phone";
  const available = phone ? Math.max(dimensions.width, minimum) : dimensions.width;
  const layout = useMemo(() => fitOperationalWidths(scaledColumns, available, preferences), [scaledColumns, available, preferences]);
  const requiredHeight = (OPERATIONAL_PAGE_SIZE + 1) * OPERATIONAL_ROW_HEIGHT * dimensions.scale;
  const conflict = dimensions.width > 0 && !phone && (!layout.fits || dimensions.height + .5 < requiredHeight);

  function applyWidths(widths: number[]) {
    const next = operationalWidthPreferences(scaledColumns, widths);
    setPreferences(next);
    try { localStorage.setItem(preferenceKey, JSON.stringify(next)); } catch { /* Preference stays in this tab. */ }
  }

  function restoreWidths() {
    setPreferences(null);
    try { localStorage.removeItem(preferenceKey); } catch { /* Defaults still apply in this tab. */ }
  }

  return <>
    <div ref={viewport} className={styles.viewport} data-operational-table data-fit={conflict ? "conflict" : "ready"} data-required-width={minimum} data-required-height={requiredHeight}>
      {conflict ? <section className={styles.fitConflict} role="status" data-layout-conflict>
        <h2>Esta área ainda não comporta a tabela no padrão.</h2>
        <p>Para manter 20 registros, todas as colunas e a fonte legível, o corpo da tabela precisa de pelo menos <strong>{minimum} × {Math.ceil(requiredHeight)} px</strong>. A área disponível agora é <strong>{dimensions.width} × {dimensions.height} px</strong>.</p>
        <p>Nenhuma linha foi compactada ou recortada. Este cenário precisa de validação de espaço antes da ampliação do piloto.</p>
      </section> : <>
        <table className={styles.table} style={{ width: dimensions.width ? layout.widths.reduce((sum, width) => sum + width, 0) : "100%" }}>
          <caption>Unidades consumidoras — até 20 registros por página, uma informação por coluna.</caption>
          <colgroup>{layout.widths.map((width, index) => <col key={columns[index].key} style={{ width: dimensions.width ? width : `${columns[index].initialWidth / columns.reduce((sum, item) => sum + item.initialWidth, 0) * 100}%` }} />)}</colgroup>
          <thead><tr>{scaledColumns.map((column, index) => <th key={column.key} scope="col" aria-label={column.label} style={{ textAlign: column.align ?? "left" }}>
            <span className={styles.headerText}>{column.label}</span>
            {column.resizable && <button type="button" className={styles.resize} aria-label={`Ajustar largura de ${column.label}`} title="Arraste ou use as setas. Duplo clique ou Home restaura as larguras."
              onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { index, x: event.clientX, widths: [...layout.widths] }; }}
              onPointerMove={(event) => { if (drag.current?.index === index) applyWidths(resizeOperationalWidths(scaledColumns, drag.current.widths, index, event.clientX - drag.current.x)); }}
              onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
              onDoubleClick={restoreWidths}
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); applyWidths(resizeOperationalWidths(scaledColumns, layout.widths, index, event.key === "ArrowRight" ? 8 : -8)); }
                if (event.key === "Home") { event.preventDefault(); restoreWidths(); }
              }} />}
          </th>)}</tr></thead>
          <tbody>{state === "ready" && rows.map((row) => <tr key={row.id} data-operational-row>
            {columns.map((column) => <td key={column.key} style={{ textAlign: column.align ?? "left" }}>{column.type === "actions" ? row.actions : <FullValueCell column={column} row={row} onDetails={(next) => { setSelection(next); setDetailsOpen(true); }} />}</td>)}
          </tr>)}</tbody>
        </table>
        {(state !== "ready" || !rows.length) && <div className={styles.state} role={state === "error" ? "alert" : "status"}>
          <p>{state === "error" ? "Não foi possível carregar as unidades consumidoras." : state === "loading" ? "Carregando unidades consumidoras…" : "Nenhuma unidade consumidora encontrada."}</p>
          {state === "error" && <button type="button" className={styles.dialogButton} onClick={onRetry}>Tentar novamente</button>}
        </div>}
      </>}
    </div>
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent className={`${styles.dialog} ${styles.detailsDialog}`} data-device={device} showCloseButton={false} initialFocus={closeRef} finalFocus={() => selection?.trigger.isConnected ? selection.trigger : true}>
        {selection && <DetailValue key={`${selection.record}:${selection.field}`} selection={selection} closeRef={closeRef} onClose={() => setDetailsOpen(false)} />}
      </DialogContent>
    </Dialog>
  </>;
}

export function OperationalPagination({ page, total, pending = false, onPageChange }: { page: number; total: number; pending?: boolean; onPageChange: (page: number) => void }) {
  const inputId = useId();
  const pages = Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE));
  const first = total ? (page - 1) * OPERATIONAL_PAGE_SIZE + 1 : 0;
  const last = Math.min(page * OPERATIONAL_PAGE_SIZE, total);
  const number = (value: number) => value.toLocaleString("pt-BR");
  return <footer className={styles.footer} data-operational-pagination>
    <span aria-live="polite">{number(first)}–{number(last)} de {number(total)} registros{pending ? " · Atualizando…" : ""}</span>
    <nav aria-label="Paginação das unidades consumidoras" className={styles.paginationControls}>
      <button type="button" className={styles.iconButton} disabled={pending || page <= 1} onClick={() => onPageChange(1)} aria-label="Primeira página"><ChevronFirst /></button>
      <button type="button" className={styles.iconButton} disabled={pending || page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Página anterior"><ChevronLeft /></button>
      <form className={styles.pageForm} onSubmit={(event) => { event.preventDefault(); const value = Number(new FormData(event.currentTarget).get("page")); if (Number.isSafeInteger(value) && value >= 1 && value <= pages) onPageChange(value); }}>
        <label htmlFor={inputId} className={styles.srOnly}>Ir para página</label>
        <input key={page} id={inputId} name="page" type="number" min={1} max={pages} defaultValue={page} disabled={pending} />
        <span>de {number(pages)}</span>
      </form>
      <button type="button" className={styles.iconButton} disabled={pending || page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Próxima página"><ChevronRight /></button>
      <button type="button" className={styles.iconButton} disabled={pending || page >= pages} onClick={() => onPageChange(pages)} aria-label="Última página"><ChevronLast /></button>
    </nav>
  </footer>;
}
