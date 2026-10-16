"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export function SstForm({ action, children, label = "Salvar", redirectBase, receipt = false }: {
  action: (form: FormData) => Promise<{ error: string | null; id?: string; printReceipt?: boolean; suggestLeave?: boolean }>;
  children: ReactNode; label?: string; redirectBase?: string; receipt?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const submissionKey = useRef<string | null>(null);
  return <form className="grid gap-4 rounded-lg border bg-white p-4 text-sm dark:bg-slate-900" onSubmit={async (event) => {
    event.preventDefault(); if (pending) return;
    const form = event.currentTarget;
    setPending(true); setError(null); setSaved(false);
    try {
      submissionKey.current ??= crypto.randomUUID();
      const data = new FormData(form);
      // datetime-local has no timezone; send the user's actual instant to server actions.
      for (const input of Array.from(form.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'))) {
        if (input.name && input.value) data.set(input.name, new Date(input.value).toISOString());
      }
      data.set("submissionKey", submissionKey.current);
      const result = await action(data);
      if (result.error) { setError(result.error); return; }
      setSaved(true);
      if (redirectBase && result.id) router.push(`${redirectBase}/${result.id}${receipt && result.suggestLeave ? `?confirmLeave=1${result.printReceipt ? "&receipt=1" : ""}` : receipt && result.printReceipt ? "/comprovante?print=1" : ""}`);
      router.refresh();
    } catch { setError("Não foi possível concluir a operação. Tente novamente."); }
    finally { setPending(false); }
  }}>
    {children}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {saved && <p role="status" className="text-emerald-700">Registro salvo.</p>}
    <button disabled={pending} className="w-fit rounded bg-teal-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{pending ? "Salvando…" : label}</button>
  </form>;
}
