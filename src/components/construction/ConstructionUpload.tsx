"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
export default function ConstructionUpload({ caseId }: { caseId: string }) {
  const router = useRouter(); const key = useRef(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (!key.current) key.current = crypto.randomUUID();
    data.set("caseId",caseId); data.set("requestKey",key.current); setPending(true); setMessage("");
    try { const response = await fetch("/api/construcao-civil/anexos", { method: "POST", body: data }); const result = await response.json(); if (!response.ok) { setMessage(result.error || "Falha ao enviar."); return; } key.current = ""; form.reset(); router.refresh(); setMessage("Documento registrado no processo e no GED."); } catch { setMessage("Falha de comunicação. Repita para recuperar o mesmo envio."); } finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-2 rounded border p-3"><h3 className="text-sm font-semibold">Documentação complementar</h3><fieldset disabled={pending} className="space-y-2"><label className="block text-xs">Descrição<input required name="title" minLength={2} maxLength={160} className="h-8 w-full rounded border bg-transparent px-2 text-sm" /></label><label className="block text-xs">PDF, JPG ou PNG — até 10 MB<input required name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-sm" /></label><button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">{pending ? "Enviando..." : "Enviar documento"}</button></fieldset>{message && <p role="status" className="text-sm">{message}</p>}</form>;
}
