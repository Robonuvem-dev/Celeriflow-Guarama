"use client";

import { useState, useTransition } from "react";
import { issueConfiguredItbiDocumentAction } from "../modelos/actions";
import { issuePortalConfiguredItbiDocumentAction } from "@/app/portal/tributario/itbi/actions";

export default function ItbiConfiguredDocumentsClient(props: { external: boolean; declarationId: string; models: { id: string; version: number; name: string }[]; issuances: { id: string; title: string; createdAt: string }[] }) {
  const [notice, setNotice] = useState(""); const [pending, startTransition] = useTransition(); const [latestId, setLatestId] = useState("");
  const endpoint = `${props.external ? "/api/portal/tributario" : "/api/tributacao"}/itbi/declaracoes`;
  return <details className="rounded border p-3 print:hidden"><summary className="cursor-pointer text-sm font-semibold">Declarações municipais configuradas e quitação</summary>{notice && <p role="status" className="mt-2 text-xs">{notice}</p>}<form action={form => startTransition(async () => {
    const model = props.models.find(row => row.id === form.get("model")); if (!model) { setNotice("Selecione um modelo vigente."); return; }
    const input = { declarationId: props.declarationId, modelId: model.id, expectedModelVersion: model.version, requestKey: crypto.randomUUID() };
    const result = props.external ? await issuePortalConfiguredItbiDocumentAction(input) : await issueConfiguredItbiDocumentAction(input);
    if ("error" in result) { setNotice(result.error); return; }
    setNotice("Declaração emitida com modelo e dados preservados."); setLatestId(result.issuanceId);
  })} className="mt-3 flex flex-wrap gap-2 text-xs"><select name="model" required aria-label="Modelo da declaração" className="flex-1 rounded border p-2"><option value="">Selecione o modelo municipal</option>{props.models.map(row => <option key={row.id} value={row.id}>{row.name} · v{row.version}</option>)}</select><button disabled={pending || !props.models.length} className="rounded border p-2">Emitir declaração</button></form>{latestId && <a href={`${endpoint}/${latestId}`} className="mt-2 block text-xs text-emerald-700 underline">Baixar declaração emitida</a>}<ul className="mt-3 space-y-2 text-xs">{props.issuances.map(row => <li key={row.id}><a href={`${endpoint}/${row.id}`} className="text-emerald-700 underline">{row.title} · {new Date(row.createdAt).toLocaleString("pt-BR")}</a></li>)}</ul></details>;
}
