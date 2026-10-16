"use client";

import { useEffect, useState, type ReactNode } from "react";

type Column = { label: string; width: number; align?: "left" | "right" | "center" };

export function ResizableTable({ columns, storageKey, children }: { columns: Column[]; storageKey: string; children: ReactNode }) {
  const [widths, setWidths] = useState(columns.map(column => column.width));
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (Array.isArray(saved) && saved.length === columns.length && saved.every(width => typeof width === "number" && width >= 50 && width <= 800)) setWidths(saved);
      } catch { /* Usa a configuração padrão. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey, columns.length]);

  function persist(next: number[]) {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Mantém o ajuste na sessão. */ }
  }

  function resize(index: number, event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const x = event.clientX, initial = widths[index];
    let next = widths;
    const move = (pointer: PointerEvent) => { next = widths.map((width, position) => position === index ? Math.min(800, Math.max(50, initial + pointer.clientX - x)) : width); setWidths(next); };
    const finish = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("lostpointercapture", finish); persist(next); };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("lostpointercapture", finish);
  }

  return <table style={{ width: widths.reduce((sum, width) => sum + width, 0), minWidth: "100%" }} className="table-fixed text-left text-[11px] leading-4 text-slate-700">
    <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
    <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-600"><tr className="h-7">{columns.map((column, index) => <th key={column.label} style={{ textAlign: column.align || "left" }} className="relative overflow-hidden px-3"><span className="block truncate">{column.label}</span><button type="button" aria-label={`Ajustar coluna ${column.label}`} title="Arraste para ajustar; setas para ajuste fino; duplo clique para restaurar" className="absolute inset-y-0 right-0 w-2 touch-none cursor-col-resize border-r border-slate-300 hover:bg-emerald-200 focus-visible:bg-emerald-200" onPointerDown={event => resize(index, event)} onDoubleClick={() => { const next = widths.map((width, position) => position === index ? column.width : width); setWidths(next); persist(next); }} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const next = widths.map((width, position) => position === index ? Math.min(800, Math.max(50, width + (event.key === "ArrowRight" ? 10 : -10))) : width);
      setWidths(next); persist(next);
    }} /></th>)}</tr></thead>
    <tbody className="divide-y divide-slate-100">{children}</tbody>
  </table>;
}
