"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitMyHrRequest } from "./actions";

export function HrRequestForm({ requestKey }: { requestKey: string }) {
  const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const router = useRouter();
  async function submit(data: FormData) {
    setPending(true);
    try {
      const result = await submitMyHrRequest(Object.fromEntries([...data].map(([key, value]) => [key, String(value)])));
      setMessage(result.error || `Solicitação registrada: ${result.id}`);
      if (!result.error) router.refresh();
    } catch { setMessage("Falha de comunicação. Consulte a listagem antes de repetir."); }
    finally { setPending(false); }
  }
  return <form action={submit} className="grid gap-2 rounded border bg-white p-3 text-xs">
    <input type="hidden" name="requestKey" value={requestKey} />
    <label>Assunto<select name="kind" className="ml-2 rounded border p-2"><option value="CORRECAO_CADASTRAL">Correção cadastral</option><option value="FERIAS">Férias</option><option value="DOCUMENTO">Documento</option><option value="BENEFICIO">Benefício</option></select></label>
    <label>Descreva o pedido<textarea name="description" required minLength={10} maxLength={4000} className="mt-1 block w-full rounded border p-2" /></label>
    <p>O pedido fica em análise pelo RH. A decisão informa a providência adotada; programação de férias, concessão de benefício e emissão de documento têm registros próprios.</p>
    <button disabled={pending} className="w-fit rounded bg-blue-700 px-3 py-2 text-white">{pending ? "Enviando…" : "Enviar ao RH"}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
