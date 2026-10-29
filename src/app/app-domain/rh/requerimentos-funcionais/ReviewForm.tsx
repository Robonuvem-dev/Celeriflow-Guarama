"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { completeFunctionalDocumentRequestAction, decideFunctionalRequestAction, requestFunctionalComplementAction } from "../servicos-funcionais/actions";
import { RhSelectionTable } from "../_components/RhSelectionTable";
import { rhColumn } from "../_components/operational-columns";

export function FunctionalReviewForm({ requestId, documents = [] }: { requestId: string; documents?: { code: string; label: string }[] }) {
  const router = useRouter(); const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [documentCodes, setDocumentCodes] = useState<string[]>([]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError("");
    try {
      const status = String(data.get("status")), decision = String(data.get("decision") || "");
      const result = status === "COMPLEMENTO" ? await requestFunctionalComplementAction({ requestId, instructions: decision, documentCodes: data.getAll("documentCodes").map(String) }) : await decideFunctionalRequestAction({ requestId, status, decision });
      if (result.error) setError(result.error); else router.refresh();
    } catch { setError("Não foi possível registrar a análise."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="mt-3 grid gap-2 rounded border border-slate-300 bg-slate-50 p-3 text-xs"><label htmlFor={`result-${requestId}`} className="font-semibold">Resultado da análise</label><select id={`result-${requestId}`} name="status" disabled={pending} className="h-8 rounded border bg-white px-2"><option value="COMPLEMENTO">Solicitar complementação</option><option value="DEFERIDA">Deferir conforme a operação do serviço</option><option value="INDEFERIDA">Indeferir</option></select><label htmlFor={`decision-${requestId}`}>Fundamento da decisão ou instruções ao requerente</label><textarea id={`decision-${requestId}`} name="decision" required minLength={10} maxLength={4000} disabled={pending} rows={4} className="rounded border bg-white p-2" /><RhSelectionTable title="Documentos a solicitar novamente" preferenceId="rh-requerimento-documentos-edicao" selected={documentCodes} onSelectionAction={setDocumentCodes} name="documentCodes" disabled={pending} columns={[rhColumn("code", "Código", 200, 100), rhColumn("label", "Documento", 400, 160)]} items={documents.map(document => ({ id: document.code, label: document.label, values: { code: document.code, label: document.label } }))} />{error && <p role="alert" className="text-red-700">{error}</p>}<Button disabled={pending} className="w-fit">{pending ? "Processando…" : "Registrar análise"}</Button></form>;
}

export function FunctionalExecutionForm({ requestId }: { requestId: string }) {
  const router = useRouter(), [pending, setPending] = useState(false), [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setError("");
    try {
      const result = await completeFunctionalDocumentRequestAction({ requestId, publicationId: String(data.get("publicationId")) });
      if (result.error) setError(result.error); else router.refresh();
    } catch { setError("Não foi possível concluir a providência."); } finally { setPending(false); }
  }
  return <form onSubmit={submit} className="mt-3 space-y-2 rounded border bg-slate-50 p-3 text-xs"><label className="flex flex-col gap-1">Publicação do documento de resultado<input name="publicationId" required disabled={pending} className="h-8 rounded border px-2" /></label><p>Informe o identificador da publicação em Emissões funcionais. O documento deve estar liberado para o próprio titular.</p>{error && <p role="alert" className="text-red-700">{error}</p>}<Button disabled={pending}>{pending ? "Concluindo…" : "Vincular documento e concluir execução"}</Button></form>;
}
