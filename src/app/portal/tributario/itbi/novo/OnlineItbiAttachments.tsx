"use client";

import { upload } from "@vercel/blob/client";

export default function OnlineItbiAttachments(props: { notaryId: string; requestKey: string; propertyId: string; attachments: { documentId: string; filename: string }[]; pending: boolean; onAdd: (attachment: { documentId: string; filename: string }) => void; onRemove: (id: string) => void; onUpload: (work: () => Promise<void>) => void }) {
  return <fieldset className="space-y-3 rounded border p-3"><legend className="text-sm font-semibold">Documentos da transmissão e da impugnação</legend><p className="text-sm">PDF, JPEG ou PNG, até 10 MB por arquivo e 20 anexos. Os documentos selecionados serão vinculados ao processo e ao imóvel ao protocolar.</p><ul className="space-y-2 text-sm">{props.attachments.map(attachment => <li key={attachment.documentId} className="flex items-center justify-between gap-3"><span>{attachment.filename}</span><button type="button" disabled={props.pending} onClick={() => props.onRemove(attachment.documentId)} className="rounded border p-2">Retirar da solicitação</button></li>)}</ul>
    <input aria-label="Enviar documento comprobatório" type="file" accept="application/pdf,image/jpeg,image/png" disabled={props.pending || props.attachments.length >= 20} onChange={event => {
      const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
      props.onUpload(async () => {
        if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("O anexo deve ter entre 1 byte e 10 MB.");
        const endpoint = "/api/portal/tributario/itbi/solicitacao-anexos";
        const payload = { notaryId: props.notaryId, requestKey: props.requestKey, propertyId: props.propertyId, filename: file.name };
        const response = await fetch(`${endpoint}?${new URLSearchParams(payload)}`, { cache: "no-store" });
        const access = await response.json(); if (!response.ok) throw new Error(access.error ?? "Não foi possível autorizar o anexo.");
        const blob = await upload(`${access.prefix}${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`, file, { access: "private", handleUploadUrl: endpoint, clientPayload: JSON.stringify(payload) });
        const confirmation = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "confirmar", payload, url: blob.url }) });
        const attachment = await confirmation.json(); if (!confirmation.ok) throw new Error(attachment.error ?? "Não foi possível registrar o anexo.");
        props.onAdd({ documentId: attachment.documentId, filename: attachment.filename });
      });
    }} className="w-full rounded border p-2 text-sm"/>
  </fieldset>;
}
