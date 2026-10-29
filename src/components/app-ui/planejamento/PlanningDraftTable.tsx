"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";

export function PlanningDraftTable({ title, id, rows, columns, page, onPageChange, actions, focusRequest }: {
  title: string; id: string; rows: OperationalRow[]; columns: OperationalColumn[];
  page: number; onPageChange: (page: number) => void; actions?: ReactNode;
  focusRequest?: { id: string; message: string };
}) {
  const trigger = useRef<HTMLSpanElement>(null);
  const activePage = Math.min(page, Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  useEffect(() => {
    if (!focusRequest) return;
    const button = trigger.current?.querySelector<HTMLButtonElement>("button");
    if (button?.getAttribute("aria-expanded") !== "true") button?.click();
    let frame = 0;
    const observer = new MutationObserver(focus);
    function focus() {
      const input = document.getElementById(focusRequest!.id);
      if (!input) return;
      observer.disconnect();
      const control = input.matches("input,select,textarea,button") ? input : input.querySelector<HTMLElement>("button,input:not([type=hidden]),select,textarea") ?? input;
      frame = requestAnimationFrame(() => control.focus());
    }
    observer.observe(document.body, { childList: true, subtree: true });
    focus();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [focusRequest]);
  return <div className="space-y-1">
    <span ref={trigger}><OperationalTablePanel title={title} triggerLabel={`Editar ${title.toLocaleLowerCase("pt-BR")} (${rows.length})`} description="O rascunho completo é mantido no formulário, inclusive fora da página e ao fechar este painel.">
      <div className="contents" onSubmit={event => event.stopPropagation()}>
        <OperationalListFrame label={title} actions={actions} toolbar={focusRequest && <span role="alert" className="min-w-0 truncate" title={focusRequest.message}>{focusRequest.message}</span>}
          pagination={<OperationalPagination page={activePage} total={rows.length} onPageChange={onPageChange} />}>
          <OperationalTable preferenceId={id} caption={title} columns={columns} rows={rows.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE)} />
        </OperationalListFrame>
      </div>
    </OperationalTablePanel></span>
    {focusRequest && <p role="alert" className="text-sm text-red-700">{focusRequest.message}</p>}
  </div>;
}
