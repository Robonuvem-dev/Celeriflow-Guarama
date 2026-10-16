"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { grantCitizenProcessAccess, revokeCitizenProcessAccess } from "./citizen-access-actions";

type Access = { id: string; name: string; email: string; expiresAt: string | null; state: string };

export default function CitizenAccessPanel({ processId, accesses }: { processId: string; accesses: Access[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function execute(operation: () => Promise<{ error: string | null }>, success: string) {
    setError(""); setMessage("");
    startTransition(async () => {
      try {
        const result = await operation();
        if (result.error) setError(result.error);
        else { setMessage(success); router.refresh(); }
      } catch { setError("Não foi possível concluir a operação. Tente novamente."); }
    });
  }
  return <section className="rounded-xl border border-slate-200 bg-white p-6">
    <h2 className="text-lg font-semibold text-slate-900">Acompanhamento pelo cidadão / contribuinte</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Após validar o vínculo com o interessado, libere a consulta de situação, setor, prazo e tramitações para uma conta ativa. Esta autorização não libera documentos, despachos ou notas internas.</p>
    {error && <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <form onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); execute(() => grantCitizenProcessAccess(data), "Acompanhamento autorizado."); }} className="mt-5 grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="processId" value={processId} />
      <label className="text-sm font-medium text-slate-700">E-mail da conta autorizada<input name="email" type="email" required className="mt-2 w-full rounded-lg border border-slate-300 p-2" /></label>
      <label className="text-sm font-medium text-slate-700">Validade (opcional)<input name="expiresAt" type="date" className="mt-2 w-full rounded-lg border border-slate-300 p-2" /></label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">Justificativa do vínculo validado<textarea name="reason" required minLength={10} maxLength={1000} className="mt-2 w-full rounded-lg border border-slate-300 p-2" placeholder="Titular ou representante autorizado; referência da validação." /></label>
      <button disabled={pending} className="w-fit rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Aguarde…" : "Liberar acompanhamento"}</button>
    </form>
    <ul className="mt-5 divide-y divide-slate-100">{accesses.map((access) => <li key={access.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-slate-900">{access.name} — {access.email}</p><p className="mt-1 text-xs text-slate-500">{access.state}{access.expiresAt ? ` • Validade: ${access.expiresAt}` : " • Sem prazo de expiração"}</p></div>{access.state === "Ativo" && <button type="button" disabled={pending} onClick={() => execute(() => revokeCitizenProcessAccess(processId, access.id), "Autorização revogada.")} className="rounded border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Revogar</button>}</li>)}</ul>
    <p className="mt-3 text-xs leading-5 text-slate-500">Vínculos tributários com escopo PROCESSOS são gerenciados na Tributação. Revogar uma autorização desta lista não revoga vínculos tributários independentes.</p>
  </section>;
}
