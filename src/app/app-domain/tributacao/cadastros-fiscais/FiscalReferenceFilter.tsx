"use client";

import { useSyncExternalStore } from "react";
import PrintMovements from "../movimentacoes-contabeis/PrintMovements";

const subscribe = () => () => {};

export default function FiscalReferenceFilter({ at }: { at?: string }) {
  const localValue = useSyncExternalStore(subscribe, () => {
    if (!at) return "";
    const date = new Date(at);
    if (!Number.isFinite(date.valueOf())) return "";
    return new Date(date.valueOf() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 23);
  }, () => "");
  return <form className="mt-2 flex flex-wrap items-end gap-2 print:hidden" onSubmit={event => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("reference");
    if (typeof value !== "string" || !value) return;
    const date = new Date(value);
    if (!Number.isFinite(date.valueOf())) return;
    const url = new URL(window.location.href);
    url.searchParams.set("at", date.toISOString());
    window.location.assign(url.toString());
  }}><label className="text-xs">Data e hora de referência (fuso do navegador)<input name="reference" type="datetime-local" step="0.001" defaultValue={localValue} required className="ml-2 rounded border p-1 text-xs"/></label><button className="rounded bg-emerald-700 px-3 py-1 text-xs text-white">Consultar espelho</button><PrintMovements/></form>;
}
