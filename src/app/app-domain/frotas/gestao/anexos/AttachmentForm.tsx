"use client";
import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { ReferencePicker, fieldClass } from "../../ReferencePicker";

export function FleetAttachmentForm() {
  const [unitId, setUnitId] = useState(""), [message, setMessage] = useState(""), [pending, setPending] = useState(false);
  return <form className="space-y-4 rounded border bg-white p-5" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setMessage(""); const form = new FormData(event.currentTarget), file = form.get("file");
    try {
      if (!(file instanceof File) || !file.size || file.size > 20 * 1024 * 1024) throw new Error("Selecione arquivo de até 20 MB.");
      const payload = { unitId, ownerType: String(form.get("ownerType")), ownerId: String(form.get("ownerId") || unitId), filename: file.name, size: file.size };
      const preparation = await fetch("/api/frotas/controle/anexos"), settings = await preparation.json(); if (!preparation.ok) throw new Error(settings.error);
      const name = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
      const blob = await upload(`${settings.prefix}${crypto.randomUUID()}-${name}`, file, { access: "private", handleUploadUrl: "/api/frotas/controle/anexos", clientPayload: JSON.stringify(payload) });
      const response = await fetch("/api/frotas/controle/anexos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "confirmar", payload, url: blob.url }) }), result = await response.json(); if (!response.ok) throw new Error(result.error); setMessage(`Anexo registrado: ${result.id}. Evidência GED: ${result.versionId}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível receber o arquivo."); } finally { setPending(false); }
  }}><ReferencePicker kind="allUnits" endpoint="/api/frotas/referencias" label="Unidade autorizada" value={unitId} onChange={setUnitId} required /><label className="block text-sm font-semibold">Tipo de registro<select name="ownerType" className={fieldClass}>{["VEICULO", "MOTORISTA", "MULTA", "SINISTRO", "AUTORIZACAO", "CONTRATO"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="block text-sm font-semibold">ID do registro (vazio usa a unidade)<input name="ownerId" className={fieldClass} /></label><label className="block text-sm font-semibold">Arquivo até 20 MB<input name="file" type="file" required accept=".png,.bmp,.jpg,.jpeg,.gif,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.pdf,.odt,.ods,.dwg" className="mt-2 block w-full text-sm" /></label><p className="text-xs leading-6 text-slate-500">Upload direto privado; original, hash e versão ficam no GED. Retirada preserva o histórico. Formatos aceitos são os do checklist de Frota.</p><button disabled={pending} className="rounded bg-teal-700 px-5 py-2 text-sm font-semibold text-white">{pending ? "Enviando…" : "Enviar e registrar"}</button><p role="status" className="text-sm leading-6">{message}</p></form>;
}
