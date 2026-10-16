"use client";

import { useState, useTransition } from "react";
import { issuePortalEconomicDocumentAction } from "./actions";

export default function EconomicDocumentsClient({ registrations }: { registrations: { id: string; label: string; status: string; updatedAt: string; canRegister: boolean; canCease: boolean }[] }) {
  const [notice, setNotice] = useState(""); const [issuanceId, setIssuanceId] = useState(""); const [pending, startTransition] = useTransition();
  return <section className="space-y-3">{notice && <p role="status" className="rounded border p-3 text-sm">{notice}</p>}{registrations.map(row => <div key={row.id} className="space-y-2 rounded border bg-white p-4"><h2 className="font-semibold">{row.label}</h2><p className="text-sm">Situação: {row.status}</p><div className="flex flex-wrap gap-3">{(["REGISTRATION", "CESSATION"] as const).filter(kind => kind === "REGISTRATION" ? row.canRegister : row.canCease && row.status === "Baixado").map(kind => <button key={kind} disabled={pending} className="rounded border p-2 text-sm" onClick={() => startTransition(async () => { const result = await issuePortalEconomicDocumentAction({ registrationId: row.id, expectedUpdatedAt: row.updatedAt, kind, requestKey: crypto.randomUUID() }); if ("error" in result) { setNotice(result.error); setIssuanceId(""); return; } setNotice("Documento cadastral emitido com a posição preservada."); setIssuanceId(result.issuanceId); })}>{kind === "REGISTRATION" ? "Emitir comprovante de inscrição municipal" : "Emitir certidão cadastral de baixa"}</button>)}</div></div>)}{issuanceId && <a href={`/api/portal/tributario/empresas/documentos/${issuanceId}`} className="block text-emerald-700 underline">Baixar documento emitido em PDF</a>}</section>;
}
