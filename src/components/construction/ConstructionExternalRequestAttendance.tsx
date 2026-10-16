"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { attendConstructionServiceRequest } from "@/app/portal/construcao-civil/external-actions";

export default function ConstructionExternalRequestAttendance({ id, kind }: { id: string; kind: string }) {
  const router = useRouter(); const [pending, startTransition] = useTransition(); const [message, setMessage] = useState("");
  const documentary = ["RENEWAL", "DOCUMENT_CORRECTION"].includes(kind);
  return <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); startTransition(async () => { try { const result = await attendConstructionServiceRequest({ id, decision: form.get("decision"), resolution: form.get("resolution"), lifecycleRecordId: String(form.get("lifecycleRecordId") || "") }); if (result.error) setMessage(result.error); else { router.refresh(); setMessage("Atendimento registrado."); } } catch { setMessage("Não foi possível confirmar o atendimento. Repita o envio."); } }); }}>
    <fieldset disabled={pending} className="space-y-2"><label className="block text-sm">Decisão<select name="decision" className="block w-full rounded border p-2"><option value="ACCEPTED">Atendido com ato municipal vinculado</option><option value="REJECTED">Indeferido</option></select></label>{!documentary && <label className="block text-sm">ID do registro municipal de início, vistoria ou conclusão<input name="lifecycleRecordId" className="block w-full rounded border p-2" /></label>}{documentary && <p className="text-xs">A emissão deve usar o pedido documental desta correção/renovação; o vínculo será conferido automaticamente.</p>}<label className="block text-sm">Resposta ao profissional<textarea name="resolution" required minLength={10} maxLength={4000} className="block w-full rounded border p-2" /></label><button className="rounded border px-3 py-2 text-sm">Registrar atendimento</button></fieldset>{message && <p className="text-sm" role="status">{message}</p>}
  </form>;
}
