"use client";

import { createContext, useContext, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FilePenLine } from "lucide-react";
import { OperationalHeaderActions, useOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import { OperationalContext } from "@/components/app-ui/operational/OperationalContext";
import styles from "@/components/app-ui/operational/operational.module.css";

const Operations = createContext<{
  host: HTMLDivElement | null;
  active: string;
  open: (id: string, label: string, trigger: HTMLButtonElement) => void;
} | null>(null);

// Tables occupy the whole list area. Forms remain mounted in a separate context
// area: switching views never submits, resets or discards an unsaved operation.
export function ContextualTables({ areas, children, initialArea }: {
  areas: { id: string; label: string; content: ReactNode }[];
  children: ReactNode;
  initialArea?: string;
}) {
  const workspace = useOperationalWorkspace();
  const [selected, setSelected] = useState(initialArea ?? areas[0]?.id ?? "context");
  const active = areas.some(area => area.id === selected) || selected === "context" || selected.startsWith("operation:") ? selected : areas[0]?.id ?? "context";
  const [operationLabel, setOperationLabel] = useState("");
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const previousArea = useRef(active);
  const body = useRef<HTMLDivElement>(null);
  const id = useId();
  function choose(value: string) {
    setSelected(value);
    requestAnimationFrame(() => body.current?.focus());
  }
  return <Operations.Provider value={{ host, active, open: (key, label, button) => {
    previousArea.current = active; trigger.current = button; setOperationLabel(label); choose(`operation:${key}`);
  } }}>
    <OperationalHeaderActions>
      <select aria-label="Área da consulta" aria-controls={id} value={active} onChange={event => choose(event.target.value)} className={`${styles.dialogButton} min-w-0 max-w-64`}>
        {areas.map(area => <option key={area.id} value={area.id}>{area.label}</option>)}
        <option value="context">Contexto e operações</option>
        {active.startsWith("operation:") && <option value={active}>{operationLabel}</option>}
      </select>
      {active.startsWith("operation:") && <button type="button" className={styles.dialogButton} onClick={() => {
        setSelected(previousArea.current);
        requestAnimationFrame(() => trigger.current?.focus());
      }}>Voltar à consulta</button>}
    </OperationalHeaderActions>
    <div id={id} ref={body} tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col">
      {areas.map(area => <OperationalContext.Provider key={area.id} value={{ ...workspace, actionsHost: active === area.id ? workspace.actionsHost : null }}><div hidden={active !== area.id} aria-label={area.label} className={active === area.id ? "flex min-h-0 min-w-0 flex-1 flex-col" : undefined}>{area.content}</div></OperationalContext.Provider>)}
      <div hidden={active !== "context"} aria-label="Contexto e operações" className={active === "context" ? "min-h-0 flex-1 space-y-3 overflow-y-auto p-3" : undefined}>{children}</div>
      <div ref={setHost} hidden={!active.startsWith("operation:")} aria-label={operationLabel} className={active.startsWith("operation:") ? "min-h-0 flex-1 overflow-y-auto p-3" : undefined} />
    </div>
  </Operations.Provider>;
}

export function PlanningOperation({ label, children }: { label: string; children: ReactNode }) {
  const context = useContext(Operations);
  const id = useId();
  if (!context) throw new Error("A operação precisa da composição contextual de tabelas.");
  return <>
    <button type="button" className={styles.iconButton} aria-label={label} title={label} onClick={event => context.open(id, label, event.currentTarget)}><FilePenLine aria-hidden="true" /></button>
    {context.host && createPortal(<section hidden={context.active !== `operation:${id}`} aria-label={label}>
      <h2 className="mb-3 text-sm font-semibold">{label}</h2>{children}
    </section>, context.host)}
  </>;
}
