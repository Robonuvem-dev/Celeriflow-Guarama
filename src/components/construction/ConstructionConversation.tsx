"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { acceptConstructionTerm, sendConstructionPortalMessage } from "@/app/portal/construcao-civil/actions";
import { sendConstructionInternalMessage } from "@/app/app-domain/obras/construcao-civil/message-actions";

export default function ConstructionConversation({ caseId, external, term, accepted }: { caseId: string; external: boolean; term?: { id: string; version: number; text: string } | null; accepted?: boolean }) {
  const router = useRouter(); const key = useRef("");
  const [content, setContent] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const result = external && !accepted && term ? await acceptConstructionTerm({ caseId, termId: term.id }) : await (external ? sendConstructionPortalMessage : sendConstructionInternalMessage)({ caseId, requestKey: key.current, content });
      if (result.error) { setMessage(result.error); return; }
      key.current = ""; setContent(""); router.refresh();
    } catch { setMessage("Falha de comunicação. Repita para recuperar o mesmo envio."); } finally { setPending(false); }
  }
  if (external && !term) return <p className="text-sm">Aguarde a publicação do termo municipal para enviar mensagens.</p>;
  return <form onSubmit={submit} className="space-y-2">{external && !accepted ? <><h3 className="text-sm font-semibold">Termo de responsabilidade v{term?.version}</h3><p className="whitespace-pre-wrap break-words rounded border p-3 text-xs">{term?.text}</p><label className="flex gap-2 text-xs"><input type="checkbox" required disabled={pending} />Li e aceito o termo de responsabilidade.</label></> : <label className="block text-xs">Mensagem ao {external ? "setor responsável" : "profissional"}<textarea required maxLength={4000} rows={3} value={content} disabled={pending} onChange={(event) => setContent(event.target.value)} className="w-full rounded border bg-transparent p-2 text-sm" /></label>}<button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">{pending ? "Salvando..." : external && !accepted ? "Registrar aceite" : "Enviar mensagem"}</button>{message && <p role="alert" className="text-sm">{message}</p>}</form>;
}
