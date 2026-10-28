"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import styles from "./sanitation.module.css";

type Column = { label: string; width: number; align?: "left" | "center" | "right" };

export function SanitationTable({ columns, children }: {
  columns: Column[];
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const [widths, setWidths] = useState(() => columns.map((column) => column.width));
  const drag = useRef<{ index: number; x: number; widths: number[] } | null>(null);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => {
      // Always show 20 records, adjusting density rather than adding scrollbars.
      const rowHeight = window.innerWidth < 640 ? 38 : Math.min(38, Math.max(12, Math.floor((element.clientHeight - 30) / 20)));
      element.style.setProperty("--san-row-height", `${rowHeight}px`);
      element.style.setProperty("--san-font-size", rowHeight < 24 ? "10px" : "11px");
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  function resize(index: number, delta: number, original = widths) {
    const minimum = 5;
    const clamped = Math.max(minimum - original[index], Math.min(delta, original[index + 1] - minimum));
    setWidths(original.map((width, position) => position === index ? width + clamped : position === index + 1 ? width - clamped : width));
  }

  return (
    <div ref={viewport} className={styles.viewport} data-sanitation-table>
      <table ref={table} className={styles.table}>
        <colgroup>{widths.map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
        <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-semibold uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-800">
          <tr>{columns.map((column, index) => (
            <th key={column.label} scope="col" aria-label={column.label} title={column.label} style={{ textAlign: column.align ?? "left", paddingRight: 12 }}>
              {column.label}
              {index < columns.length - 1 && <span
                role="separator" aria-orientation="vertical" aria-label={`Ajustar largura de ${column.label}`}
                aria-valuenow={Math.round(widths[index])} aria-valuemin={5} aria-valuemax={Math.round(widths[index] + widths[index + 1] - 5)}
                tabIndex={0} className={styles.resize}
                title="Arraste para ajustar; setas ajustam pelo teclado; clique duplo restaura"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = { index, x: event.clientX, widths: [...widths] };
                }}
                onPointerMove={(event) => {
                  if (!drag.current || !table.current) return;
                  resize(index, (event.clientX - drag.current.x) / table.current.clientWidth * 100, drag.current.widths);
                }}
                onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
                onDoubleClick={() => setWidths(columns.map((item) => item.width))}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault(); resize(index, event.key === "ArrowRight" ? 1 : -1);
                  }
                  if (event.key === "Home") { event.preventDefault(); setWidths(columns.map((item) => item.width)); }
                }}
              />}
            </th>
          ))}</tr>
        </thead>
        {children}
      </table>
    </div>
  );
}

export function SanitationPagination({ page, total, pageSize, onPageChange }: {
  page: number; total: number; pageSize: number; onPageChange: (page: number) => void;
}) {
  return <div className="shrink-0 border-t border-slate-100 px-2 py-1.5 [&>nav]:flex-wrap">
    <ErpPagination page={page} total={total} pageSize={pageSize} previousHref="#" nextHref="#" onPageChange={onPageChange} />
  </div>;
}
