"use client";

import { useEffect, useRef, useState } from "react";

export type PanelPage<T> = { rows: T[]; page: number; total: number };
export type PanelReply<T> = PanelPage<T> | { error: string };
export type PanelRow = { id: string; label: string; values: Record<string, string>; links?: { href: string; label: string }[] };

/** Keeps the form owner mounted and discards obsolete asynchronous replies. */
export function usePanelPage<T>(initial: PanelPage<T>, loadPage: (page: number) => Promise<PanelReply<T>>) {
  const [data, setData] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const requested = useRef(initial.page);
  const sourceSignature = useRef(JSON.stringify(initial));
  useEffect(() => {
    const signature = JSON.stringify(initial);
    if (sourceSignature.current === signature) return;
    sourceSignature.current = signature;
    const revision = ++sequence.current;
    queueMicrotask(() => {
      if (revision !== sequence.current) return;
      requested.current = initial.page;
      setData(initial); setPending(false); setError("");
    });
  }, [initial]);
  async function changePage(page: number) {
    const request = ++sequence.current;
    requested.current = page;
    setPending(true); setError("");
    try { const next = await loadPage(page); if (request === sequence.current) { if ("error" in next) setError(next.error); else setData(next); } }
    catch { if (request === sequence.current) setError("Não foi possível carregar a página. Tente novamente."); }
    finally { if (request === sequence.current) setPending(false); }
  }
  return { data, pending, error, changePage, retry: () => void changePage(requested.current) };
}
