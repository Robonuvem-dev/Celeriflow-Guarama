"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Filter, RotateCcw, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { OperationalHeaderActions } from "./OperationalWorkspace";
import { OperationalListReset, useOperationalDevice, useOptionalOperationalWorkspace } from "./OperationalContext";
import { OperationalPagedContent } from "./OperationalPagedContent";
import styles from "./operational.module.css";

export function OperationalListFrame({ children, toolbar, actions, pagination, label = "Listagem" }: {
  children: ReactNode; toolbar?: ReactNode; actions?: ReactNode; pagination: ReactNode; label?: string;
}) {
  const [reset, setReset] = useState(0);
  return <OperationalListReset.Provider value={reset}>
    <section className={styles.list} aria-label={label} data-operational-list>
      <OperationalHeaderActions>{actions}<button type="button" className={styles.iconButton} aria-label={`Restaurar larguras de ${label}`} title="Restaurar larguras padrão" onClick={() => setReset(value => value + 1)}><RotateCcw aria-hidden="true" /></button></OperationalHeaderActions>
      <div className={styles.toolbar} data-operational-filters>{toolbar}</div>
      {children}
      {pagination}
    </section>
  </OperationalListReset.Provider>;
}

export function OperationalFilters({ children, activeCount = 0, label = "Filtros" }: { children: ReactNode; activeCount?: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const workspace = useOptionalOperationalWorkspace();
  const fallbackDevice = useOperationalDevice();
  const device = workspace?.device ?? fallbackDevice;
  return <Dialog open={open} onOpenChange={setOpen}>
    <button ref={triggerRef} type="button" className={styles.filterButton} aria-label={`${label}${activeCount ? `, ${activeCount} ativos` : ""}`} aria-expanded={open} onClick={event => { event.stopPropagation(); setOpen(true); }}><Filter aria-hidden="true" />{label}{activeCount > 0 && <span className={styles.count}>{activeCount}</span>}</button>
    <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={triggerRef}
      style={{ display: "flex", flexDirection: "column", minHeight: 0, maxHeight: "calc(100dvh - 16px)", overflow: "hidden" }}>
      <DialogHeader style={{ flexShrink: 0 }}><DialogTitle>{label}</DialogTitle><DialogDescription>Consulte as opções e aplique os critérios desejados.</DialogDescription></DialogHeader>
      <OperationalPagedContent device={device} label={label} footer={<button type="button" className={styles.dialogButton} onClick={event => { event.stopPropagation(); setOpen(false); }}><X />Fechar</button>}>
        {children}
      </OperationalPagedContent>
    </DialogContent>
  </Dialog>;
}

export function OperationalLinkPagination({ page, total, pathname, values = {}, pageParam = "page" }: {
  page: number; total: number; pathname?: string; values?: Record<string, string | number | undefined | null>; pageParam?: string;
}) {
  const currentPath = usePathname();
  const router = useRouter();
  const id = useId();
  const pages = Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE));
  const activePage = Math.min(Math.max(1, page), pages);
  const href = (nextPage: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (key !== pageParam && value !== undefined && value !== null && value !== "") query.set(key, String(value));
    if (nextPage > 1) query.set(pageParam, String(nextPage));
    return `${pathname ?? currentPath}${query.size ? `?${query}` : ""}`;
  };
  const control = (nextPage: number, disabled: boolean, label: string, icon: ReactNode) => disabled
    ? <span className={styles.iconButton} aria-disabled="true" aria-label={label}>{icon}</span>
    : <Link className={styles.iconButton} href={href(nextPage)} aria-label={label} scroll={false}>{icon}</Link>;
  return <footer className={styles.footer} data-operational-pagination>
    <span aria-live="polite">{(total ? (activePage - 1) * OPERATIONAL_PAGE_SIZE + 1 : 0).toLocaleString("pt-BR")}–{Math.min(activePage * OPERATIONAL_PAGE_SIZE, total).toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} registros</span>
    <nav className={styles.paginationControls} aria-label="Paginação de registros">
      {control(1, activePage <= 1, "Primeira página", <ChevronFirst />)}
      {control(activePage - 1, activePage <= 1, "Página anterior", <ChevronLeft />)}
      <form className={styles.pageForm} onSubmit={event => {
        event.preventDefault(); event.stopPropagation();
        const next = Number(new FormData(event.currentTarget).get("page"));
        if (Number.isSafeInteger(next) && next >= 1 && next <= pages) router.push(href(next), { scroll: false });
      }}>
        <label htmlFor={id} className={styles.srOnly}>Ir para página</label>
        <input key={activePage} id={id} name="page" type="number" min={1} max={pages} defaultValue={activePage} />
        <span>de {pages.toLocaleString("pt-BR")}</span>
      </form>
      {control(activePage + 1, activePage >= pages, "Próxima página", <ChevronRight />)}
      {control(pages, activePage >= pages, "Última página", <ChevronLast />)}
    </nav>
  </footer>;
}
