"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { OperationalDevice } from "@/lib/operational-devices";
import styles from "./operational.module.css";

// These nodes stay in the DOM, enabled and in their original forms on every page.
const controls = 'input:not([type="hidden"]), select, textarea, button, a[href], [tabindex], [contenteditable="true"]';
const gutter = 4;

/** A bounded reading window, not virtualization: forms and React state are never split. */
export function OperationalPagedContent({ children, device, label = "Conteúdo", footer }: {
  children: ReactNode; device: OperationalDevice; label?: string; footer?: ReactNode;
}) {
  const naturalScroll = device === "tablet" || device === "phone";
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const offsetsRef = useRef([0]);
  const offsetRef = useRef(0);
  const revealRef = useRef<(target: HTMLElement) => void>(() => {});
  const [position, setPosition] = useState({ page: 0, total: 1 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    let frame = 0;
    let focusFrame = 0;
    let disposed = false;

    const apply = (index: number) => {
      const offsets = offsetsRef.current;
      const page = Math.max(0, Math.min(offsets.length - 1, index));
      offsetRef.current = offsets[page];
      viewport.scrollTop = offsetRef.current;
      setPosition(previous => previous.page === page && previous.total === offsets.length ? previous : { page, total: offsets.length });
    };
    const bounds = (target: HTMLElement) => {
      const rect = target.getBoundingClientRect();
      const top = rect.top - viewport.getBoundingClientRect().top + viewport.scrollTop;
      return { top, bottom: top + rect.height };
    };
    const covers = (offset: number, top: number, bottom: number) => top >= offset + gutter - .5 && bottom <= offset + viewport.clientHeight - gutter + .5;
    const reveal = (target: HTMLElement) => {
      if (naturalScroll || !content.contains(target)) return;
      const { top, bottom } = bounds(target);
      if (covers(offsetRef.current, top, bottom)) {
        viewport.scrollTop = offsetRef.current;
        return;
      }
      const offsets = offsetsRef.current;
      let page = offsets.findIndex(offset => covers(offset, top, bottom));
      // A focusable node may have just been inserted, before the MutationObserver runs.
      if (page < 0) {
        const offset = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, top - gutter));
        offsetsRef.current = [...new Set([...offsets, offset])].sort((a, b) => a - b);
        page = offsetsRef.current.indexOf(offset);
      }
      apply(page);
    };
    revealRef.current = target => {
      reveal(target);
      // Chrome can perform its own focus scroll after dispatching focusin.
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => reveal(target));
    };
    const measure = () => {
      if (disposed || !viewport.clientHeight) return;
      if (naturalScroll) { offsetsRef.current = [0]; return; }
      const height = viewport.clientHeight;
      const maximum = Math.max(0, viewport.scrollHeight - height);
      const step = Math.max(1, height - Math.min(96, height / 4));
      const offsets = [0];
      for (let offset = step; offset < maximum; offset += step) offsets.push(offset);
      if (maximum > 0) offsets.push(maximum);
      // Add a window for any control straddling the regular overlapping windows.
      // Labels/explicit blocks are kept whole too, when they fit in one window.
      for (const node of content.querySelectorAll<HTMLElement>(`${controls}, label, [data-operational-block]`)) {
        if (!node.getClientRects().length) continue;
        const { top, bottom } = bounds(node);
        if (bottom - top > height - gutter * 2) continue;
        if (!offsets.some(offset => covers(offset, top, bottom))) offsets.push(Math.max(0, Math.min(maximum, top - gutter)));
      }
      offsets.sort((a, b) => a - b);
      offsetsRef.current = [...new Set(offsets)];
      const nearest = offsetsRef.current.reduce((best, offset, index, list) => Math.abs(offset - offsetRef.current) < Math.abs(list[best] - offsetRef.current) ? index : best, 0);
      apply(nearest);
      if (document.activeElement instanceof HTMLElement) reveal(document.activeElement);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    resize.observe(viewport);
    resize.observe(content);
    const mutation = new MutationObserver(schedule);
    mutation.observe(content, { subtree: true, childList: true, characterData: true, attributes: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    document.fonts.addEventListener("loadingdone", schedule);
    void document.fonts.ready.then(() => { if (!disposed) schedule(); });
    measure();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame); cancelAnimationFrame(focusFrame);
      resize.disconnect(); mutation.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      document.fonts.removeEventListener("loadingdone", schedule);
      revealRef.current = () => {};
    };
  }, [naturalScroll]);

  useEffect(() => {
    if (naturalScroll) return;
    const root = rootRef.current;
    const prevent = (event: Event) => event.preventDefault();
    root?.addEventListener("wheel", prevent, { passive: false });
    root?.addEventListener("touchmove", prevent, { passive: false });
    return () => { root?.removeEventListener("wheel", prevent); root?.removeEventListener("touchmove", prevent); };
  }, [naturalScroll]);

  const navigate = (page: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = Math.max(0, Math.min(offsetsRef.current.length - 1, page));
    offsetRef.current = offsetsRef.current[next];
    viewport.scrollTop = offsetRef.current;
    setPosition({ page: next, total: offsetsRef.current.length });
  };

  return <div ref={rootRef} data-operational-paged-content data-reading-mode={naturalScroll ? "scroll" : "pages"}
    style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: 0, minWidth: 0, gap: 12 }}>
    <div ref={viewportRef} id={id} data-operational-content-viewport role="region" aria-label={label}
      style={{ flex: "1 1 auto", minHeight: 0, minWidth: 0, overflowX: "hidden", overflowY: naturalScroll ? "auto" : "hidden", overscrollBehavior: "contain", overflowAnchor: "none", scrollBehavior: "auto" }}
      onScroll={event => { if (!naturalScroll && Math.abs(event.currentTarget.scrollTop - offsetRef.current) > .5) event.currentTarget.scrollTop = offsetRef.current; }}
      onFocusCapture={event => revealRef.current(event.target)} onInvalidCapture={event => revealRef.current(event.target as HTMLElement)}>
      <div ref={contentRef} className={styles.filterContent} data-operational-content-body style={{ display: "flow-root", padding: gutter, minWidth: 0 }}>{children}</div>
    </div>
    <footer className={styles.dialogFooter} data-operational-content-footer style={{ flex: "0 0 auto" }}>
      {!naturalScroll && <nav aria-label={`Partes de ${label}`} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <span role="status" aria-live="polite" aria-atomic="true">Parte {position.page + 1} de {position.total}</span>
        <button type="button" className={styles.dialogButton} aria-label="Parte anterior" aria-controls={id} disabled={position.page === 0}
          onClick={event => { event.stopPropagation(); navigate(position.page - 1); }}><ChevronLeft aria-hidden="true" />Anterior</button>
        <button type="button" className={styles.dialogButton} aria-label="Próxima parte" aria-controls={id} disabled={position.page >= position.total - 1}
          onClick={event => { event.stopPropagation(); navigate(position.page + 1); }}>Próxima<ChevronRight aria-hidden="true" /></button>
      </nav>}
      {footer}
    </footer>
  </div>;
}
