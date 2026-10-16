"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { registerConstructionReview, resubmitConstructionCase } from "../review-actions";

type Definition = { fields: { key: string; label: string; type: string; required: boolean; options: string[] }[]; checks: { key: string; label: string; required: boolean }[]; documents: { label: string; required: boolean }[] };
const field = "h-8 w-full rounded border bg-white px-2 text-sm dark:bg-slate-900";

export default function ConstructionReviewClient({ caseId, revision, status, definitionVersion, definition, documents, inspectionTypes, canReview }: { caseId: string; revision: number; status: string; definitionVersion: number; definition: Definition; documents: { id: string; title: string }[]; inspectionTypes: { id: string; name: string }[]; canReview: boolean }) {
  const router = useRouter();
  const key = useRef("");
  const [reviewType, setReviewType] = useState("PROJECT");
  const [decision, setDecision] = useState("CORRECTION_REQUIRED");
  const [notes, setNotes] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [documentIds, setDocumentIds] = useState<Record<string, string>>({});
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [inspectionTypeIds, setInspectionTypeIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const correcting = status === "CORRECTION_REQUIRED";
  if (!canReview || !["SUBMITTED", "RESUBMITTED", "CORRECTION_REQUIRED"].includes(status)) return null;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    if (!key.current) key.current = crypto.randomUUID();
    try {
      const result = correcting ? await resubmitConstructionCase({ caseId, revision, notes }) : await registerConstructionReview({ caseId, requestKey: key.current, revision, definitionVersion, reviewType, decision, notes, checks, documentIds, fieldValues, inspectionTypeIds: reviewType === "PROJECT" && decision === "APPROVED" ? inspectionTypeIds : undefined });
      if (result.error) { setMessage(result.error); return; }
      key.current = ""; setNotes(""); setMessage(correcting ? "Readequação registrada e devolvida ao analista inicial." : "Parecer registrado."); router.refresh();
    } catch { setMessage("Falha de comunicação. Atualize a página para conferir o resultado antes de repetir."); } finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-3 rounded border p-3"><h3 className="text-sm font-semibold">{correcting ? "Registrar readequação interna" : "Registrar parecer urbanístico"}</h3><fieldset disabled={pending} className="space-y-3">
    {!correcting && <><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">Etapa<select className={field} value={reviewType} onChange={(event) => setReviewType(event.target.value)}><option value="PREANALYSIS">Pró-análise</option><option value="PROJECT">Análise do projeto</option></select></label><label className="text-xs">Decisão<select className={field} value={decision} onChange={(event) => setDecision(event.target.value)}><option value="CORRECTION_REQUIRED">Exigir correção</option><option value="APPROVED">Parecer favorável</option><option value="DENIED">Parecer desfavorável</option></select></label></div>
      <p className="text-xs text-slate-500">Checklist de análise v{definitionVersion}. Parecer favorável não emite alvará. Vincule documentos com versão válida no GED, anexados ao protocolo.</p>
      {reviewType === "PROJECT" && decision === "APPROVED" && <fieldset className="space-y-2 rounded border p-3"><legend className="text-xs font-semibold">Vistorias obrigatórias deste deferimento</legend><p className="text-xs text-slate-500">Selecione ao menos uma vistoria. O plano será preservado junto ao parecer favorável e exigido na conclusão.</p>{inspectionTypes.map((type) => <label key={type.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={inspectionTypeIds.includes(type.id)} onChange={(event) => setInspectionTypeIds((current) => event.target.checked ? [...current, type.id] : current.filter((id) => id !== type.id))} />{type.name}</label>)}{!inspectionTypes.length && <p className="text-xs text-red-600">Cadastre tipos de vistoria ativos antes de deferir o projeto.</p>}</fieldset>}
      {definition.checks.map((check) => <label key={check.key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={checks[check.key] || false} onChange={(event) => setChecks({ ...checks, [check.key]: event.target.checked })} />{check.label}{check.required ? " (obrigatório para parecer favorável)" : ""}</label>)}
      <div className="grid gap-3 sm:grid-cols-2">{definition.fields.map((entry) => <label key={entry.key} className="text-xs">{entry.label}{entry.required ? " *" : ""}{entry.type === "CHOICE" ? <select required={entry.required} className={field} value={fieldValues[entry.key] || ""} onChange={(event) => setFieldValues({ ...fieldValues, [entry.key]: event.target.value })}><option value="">Selecione</option>{entry.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input required={entry.required} type={entry.type === "DATE" ? "date" : entry.type === "NUMBER" ? "number" : "text"} step="any" maxLength={4000} className={field} value={fieldValues[entry.key] || ""} onChange={(event) => setFieldValues({ ...fieldValues, [entry.key]: event.target.value })} />}</label>)}{definition.documents.map((document) => <label key={document.label} className="text-xs">{document.label}{document.required ? " *" : ""}<select className={field} value={documentIds[document.label] || ""} onChange={(event) => setDocumentIds({ ...documentIds, [document.label]: event.target.value })}><option value="">Selecione documento do protocolo</option>{documents.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label>)}</div>
    </>}
    {correcting && <p className="text-xs text-slate-500">Anexe a documentação corrigida no protocolo vinculado e registre a complementação. O reenvio incrementa a revisão e preserva o retorno ao analista inicial.</p>}
    <label className="block text-xs">{correcting ? "Descrição da complementação" : "Fundamentação / exigências"}<textarea required minLength={3} maxLength={10000} rows={4} className="w-full rounded border bg-transparent p-2 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    <div className="text-right"><button disabled={pending || (!correcting && reviewType === "PROJECT" && decision === "APPROVED" && !inspectionTypeIds.length)} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Salvando..." : correcting ? "Registrar readequação" : "Registrar parecer"}</button></div>
  </fieldset>{message && <p role="status" className="text-sm">{message}</p>}</form>;
}
