"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type SelectableEntry = { id: string; type: string; value: string | null };
type SelectionContext = { selected: Set<string>; toggle: (id: string) => void };
const Selection = createContext<SelectionContext | null>(null);

function cents(value: string): bigint {
  const negative = value.startsWith("-");
  const [whole, fraction] = (negative ? value.slice(1) : value).split(".");
  const amount = BigInt(whole) * BigInt(100) + BigInt(fraction);
  return negative ? -amount : amount;
}

function currency(value: bigint): string {
  const absolute = value < BigInt(0) ? -value : value;
  const whole = (absolute / BigInt(100)).toLocaleString("pt-BR");
  return `${value < BigInt(0) ? "-" : ""}R$ ${whole},${(absolute % BigInt(100)).toString().padStart(2, "0")}`;
}

function available(entry: SelectableEntry): boolean {
  return entry.value !== null && /^-?\d+\.\d{2}$/.test(entry.value) && ["Débito", "Crédito"].includes(entry.type);
}

export function EntrySelection({ entries, children }: { entries: SelectableEntry[]; children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectable = entries.filter(available);
  let debit = BigInt(0), credit = BigInt(0);
  for (const entry of selectable) {
    if (!selected.has(entry.id)) continue;
    if (entry.type === "Débito") debit += cents(entry.value!);
    else credit += cents(entry.value!);
  }
  const toggle = (id: string) => setSelected(previous => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  return <Selection.Provider value={{ selected, toggle }}>
    <section className="sticky top-0 z-10 space-y-2 rounded border bg-white p-4 shadow-sm" aria-label="Ferramenta de soma de lançamentos">
      <h2 className="font-semibold">Soma dos lançamentos selecionados</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-4" aria-live="polite" aria-atomic="true">
        <div><dt>Registros selecionados</dt><dd className="font-semibold">{selected.size}</dd></div>
        <div><dt>Débitos</dt><dd className="font-semibold">{currency(debit)}</dd></div>
        <div><dt>Créditos</dt><dd className="font-semibold">{currency(credit)}</dd></div>
        <div><dt>Diferença (débitos − créditos)</dt><dd className="font-semibold">{currency(debit - credit)}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-3 text-sm">
        <button type="button" disabled={!selectable.length} className="rounded border px-3 py-1 disabled:opacity-50" onClick={() => setSelected(new Set(selectable.map(entry => entry.id)))}>Selecionar linhas da página</button>
        <button type="button" disabled={!selected.size} className="rounded border px-3 py-1 disabled:opacity-50" onClick={() => setSelected(new Set())}>Limpar seleção</button>
      </div>
      <p className="text-xs">Seleção por linha contábil nesta página. Ao mudar os filtros ou a página, a seleção é reiniciada.{entries.length !== selectable.length && ` ${entries.length - selectable.length} linha(s) sem valor Decimal ou tipo conciliado não podem ser somadas.`}</p>
    </section>
    {children}
  </Selection.Provider>;
}

export function EntryCheckbox({ entry }: { entry: SelectableEntry }) {
  const context = useContext(Selection);
  if (!context) return null;
  return <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={context.selected.has(entry.id)} disabled={!available(entry)} onChange={() => context.toggle(entry.id)} />
    Selecionar lançamento {entry.id}
  </label>;
}
