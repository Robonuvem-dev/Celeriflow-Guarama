"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { executeConstructionLifecycle } from "../../lifecycle-actions";
import ConstructionInspectionRequirements, { type ConstructionInspectionCorrection } from "@/components/construction/ConstructionInspectionRequirements";

type Definition = { fields: { key: string; label: string; type: string; required: boolean; options: string[] }[]; checks: { key: string; label: string; required: boolean }[]; documents: { label: string; required: boolean }[] };
type Inspection = { id: string; inspectionTypeId: string; status: string; requestedAt: string; inspectedAt: string | null; resultNotes: string | null; requirementNote: string | null; correctionDeadline: string | null; definitionSnapshot: { definition: Definition } };
type Completion = { id: string; number: string; kind: string; area: string; remainingArea: string; completedAt: string; occupancyDocumentId: string | null; propertyUpdate: { id: string; status: string; processId: string } | null };
type Data = { record: { id: string; inspectionPlan: { inspectionTypes: { id: string; name: string }[] } | null; lifecycleStart: { startedAt: string } | null; inspections: Inspection[]; completions: Completion[]; reviews: { id: string }[]; properties: { realEstate: { id: string; municipalInsc: string | null; builtArea: number | null; propertyUse: string | null } }[] }; types: { id: string; name: string }[]; definitions: { kind: string; definition: Definition }[]; docs: { id: string; title: string }[]; subjects: { id: string; name: string; processTypeId: string }[]; debts: unknown };
const control = "block w-full rounded border p-2";

function Evidence({ definition, docs }: { definition: Definition; docs: Data["docs"] }) {
  return <fieldset className="space-y-2"><legend className="font-semibold">Checklist e documentos</legend>{definition.fields.map((field) => <label key={field.key} className="block">{field.label}{field.required && " *"}{field.type === "CHOICE" ? <select className={control} name={`field:${field.key}`} required={field.required}><option value="">Selecione</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : <input className={control} name={`field:${field.key}`} required={field.required} type={field.type === "DATE" ? "date" : "text"} />}</label>)}{definition.checks.map((check) => <label key={check.key} className="block"><input type="checkbox" name={`check:${check.key}`} /> {check.label}{check.required && " *"}</label>)}{definition.documents.map((document) => <label key={document.label} className="block">{document.label}{document.required && " *"}<select className={control} name={`doc:${document.label}`}><option value="">Selecione documento GED</option>{docs.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select></label>)}</fieldset>;
}

export default function ConstructionLifecycleClient({ data, inspectionFilters, inspectionPagination, completionFilters, completionPagination }: { data: Data & { hasTotalCompletion: boolean; serviceRequests: { id: string; kind: string; notes: string }[]; corrections: ConstructionInspectionCorrection[]; canRegularize: boolean; nowISO: string }; inspectionFilters: React.ReactNode; inspectionPagination: React.ReactNode; completionFilters: React.ReactNode; completionPagination: React.ReactNode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const record = data.record;
  async function submit(operation: string, form: HTMLFormElement, extra: Record<string, unknown> = {}) {
    const fd = new FormData(form);
    const values = Object.fromEntries(fd.entries());
    const checks: Record<string, boolean> = {};
    const documentIds: Record<string, string> = {};
    const fieldValues: Record<string, string> = {};
    fd.forEach((value, key) => { if (key.startsWith("check:")) checks[key.slice(6)] = true; if (key.startsWith("doc:") && value) documentIds[key.slice(4)] = String(value); if (key.startsWith("field:")) fieldValues[key.slice(6)] = String(value); });
    const keyName = `${operation}:${String(extra.inspectionId || extra.completionId || "")}`;
    const requestKey = keys[keyName] || crypto.randomUUID();
    setKeys((current) => ({ ...current, [keyName]: requestKey }));
    const payload: Record<string, unknown> = { ...values, caseId: record.id, requestKey, checks, documentIds, fieldValues, ...extra };
    if (operation === "PLAN") payload.inspectionTypeIds = fd.getAll("inspectionTypeIds");
    if (operation === "START") payload.documentIds = fd.getAll("documentIds");
    if (operation === "PROPERTY") {
      const subject = data.subjects.find((item) => item.id === values.subjectId);
      payload.processTypeId = subject?.processTypeId;
      payload.changes = record.properties.filter((item) => fd.has(`property:${item.realEstate.id}`)).map(({ realEstate }) => ({ realEstateId: realEstate.id, expectedBuiltArea: String(realEstate.builtArea ?? 0), builtArea: String(fd.get(`area:${realEstate.id}`)), propertyUse: String(fd.get(`use:${realEstate.id}`)) }));
    }
    setBusy(true); setMessage("");
    try { const result = await executeConstructionLifecycle(operation, payload); if (result.error) setMessage(result.error); else { setMessage("Operação registrada."); setKeys((current) => { const next = { ...current }; delete next[keyName]; return next; }); router.refresh(); } } finally { setBusy(false); }
  }
  const form = (operation: string, title: string, children: React.ReactNode, extra: Record<string, unknown> = {}) => {
    const kind = operation === "REQUEST" ? "INSPECTION" : operation === "COMPLETE" ? "COMPLETION" : operation;
    const requests = data.serviceRequests.filter((item) => item.kind === kind);
    return <form className="space-y-3 rounded border p-4" onSubmit={(e) => { e.preventDefault(); void submit(operation, e.currentTarget, extra); }}><h2 className="text-lg font-semibold">{title}</h2>{requests.length > 0 && <label>Atender pedido externo<select className={control} name="serviceRequestId"><option value="">Registro interno</option>{requests.map((request) => <option key={request.id} value={request.id}>{request.notes}</option>)}</select></label>}{children}<button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white">{busy ? "Salvando…" : "Registrar"}</button></form>;
  };
  const notes = <label className="block">Observações<textarea className={control} name="notes" minLength={3} required /></label>;
  const empty = { fields: [], checks: [], documents: [] };
  return <div className="space-y-5"><p role="status" className="font-medium">{message}</p>
    {!record.inspectionPlan && form("PLAN", "Vistorias obrigatórias do deferimento", <><label>Parecer de deferimento<select className={control} name="reviewId" required>{record.reviews.map((review) => <option key={review.id} value={review.id}>{review.id}</option>)}</select></label>{data.types.map((type) => <label className="block" key={type.id}><input type="checkbox" name="inspectionTypeIds" value={type.id} /> {type.name}</label>)}</>)}
    {record.inspectionPlan && <section className="rounded border p-4"><h2 className="font-semibold">Plano imutável do deferimento</h2>{record.inspectionPlan.inspectionTypes.map((type) => <p key={type.id}>{type.name}</p>)}</section>}
    {!record.lifecycleStart ? form("START", "Início de obra / parcelamento", <><label>Data de início<input type="date" name="startedAt" className={control} required /></label>{notes}<label>Documentos comprobatórios GED<select className={control} name="documentIds" multiple required>{data.docs.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select></label></>) : <p>Início registrado em {record.lifecycleStart.startedAt.slice(0, 10)}.</p>}
    {record.lifecycleStart && !data.hasTotalCompletion && form("REQUEST", "Pedido de vistoria", <><label>Tipo obrigatório<select name="inspectionTypeId" className={control} required>{record.inspectionPlan?.inspectionTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label>Agendamento<input type="date" name="scheduledAt" className={control} /></label>{notes}</>)}
    {inspectionFilters}
    <ConstructionInspectionRequirements key={data.nowISO} requirements={data.corrections} inspectionTypes={record.inspectionPlan?.inspectionTypes || data.types} nowISO={data.nowISO} />
    {data.canRegularize && data.corrections.map((correction) => <div key={correction.inspectionId}>{form("EXTEND_INSPECTION", "Regularização motivada de prazo pelo gestor", <><p className="text-sm">{correction.requirementNote}</p><label>Novo vencimento<input className={control} type="date" name="newDeadline" required /></label><label>Motivo da regularização<textarea className={control} name="reason" minLength={10} maxLength={4000} required /></label></>, { inspectionId: correction.inspectionId })}</div>)}
    {!record.inspections.length && <p>Nenhuma vistoria encontrada com os filtros selecionados.</p>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Vistorias registradas</h2>{record.inspections.map((inspection) => <div key={inspection.id}><p>{record.inspectionPlan?.inspectionTypes.find((type) => type.id === inspection.inspectionTypeId)?.name} · {inspection.status} · Pedido {inspection.requestedAt.slice(0, 10)}</p>{inspection.status === "REQUESTED" ? form("INSPECT", "Resultado da vistoria", <><input type="date" name="inspectedAt" className={control} required /><select name="decision" className={control}><option value="APPROVED">Aprovada</option><option value="FAILED">Reprovada</option></select>{notes}<label>Exigência de ajuste (obrigatória para reprovar)<textarea className={control} name="requirementNote" minLength={10} maxLength={4000} /></label><Evidence definition={inspection.definitionSnapshot.definition} docs={data.docs} /></>, { inspectionId: inspection.id }) : <><p>{inspection.inspectedAt?.slice(0, 10)} · {inspection.resultNotes}</p>{inspection.status === "FAILED" && <p>Exigência: {inspection.requirementNote || inspection.resultNotes} · Prazo original: {inspection.correctionDeadline ? new Date(inspection.correctionDeadline).toLocaleString("pt-BR", { timeZone: "UTC" }) + " UTC" : "Requer regularização"}</p>}</>}</div>)}</section>
    {inspectionPagination}
    {record.lifecycleStart && !data.hasTotalCompletion && form("COMPLETE", "Conclusão parcial / total", <><select className={control} name="kind"><option value="PARTIAL">Parcial</option><option value="TOTAL">Total</option></select><label>Data de conclusão<input name="completedAt" type="date" className={control} required /></label><label>Área desta conclusão (m²)<input name="area" inputMode="decimal" className={control} pattern="[0-9]+(\.[0-9]{1,4})?" required /></label>{notes}<Evidence definition={data.definitions.find((item) => item.kind === "COMPLETION")?.definition || empty} docs={data.docs} /></>)}
    {completionFilters}
    {!record.completions.length && <p>Nenhuma conclusão encontrada com os filtros selecionados.</p>}
    <section className="space-y-3"><h2 className="text-xl font-semibold">Conclusões e atualização imobiliária</h2>{record.completions.map((completion) => <article className="space-y-2 rounded border p-4" key={completion.id}><h3>{completion.number} · {completion.kind} · {completion.completedAt.slice(0, 10)}</h3><p>Área: {completion.area} m² · Saldo: {completion.remainingArea} m²</p><p>Habite-se GED: {completion.occupancyDocumentId || "Aguardando emissão em Documentos"}</p>{completion.propertyUpdate ? <p>Atualização {completion.propertyUpdate.status} · <LinkToProcess id={completion.propertyUpdate.processId} /></p> : form("PROPERTY", "Abrir processo cadastral vinculado", <><label>Assunto do processo cadastral<select name="subjectId" className={control} required><option value="">Selecione</option>{data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>{record.properties.map(({ realEstate }) => <fieldset key={realEstate.id} className="rounded border p-2"><label><input name={`property:${realEstate.id}`} type="checkbox" /> Atualizar imóvel {realEstate.municipalInsc || realEstate.id}</label><label className="block">Área construída final<input className={control} name={`area:${realEstate.id}`} defaultValue={realEstate.builtArea ?? 0} /></label><label className="block">Uso final<input className={control} name={`use:${realEstate.id}`} defaultValue={realEstate.propertyUse || ""} /></label></fieldset>)}</>, { completionId: completion.id })}</article>)}</section>
    {completionPagination}
    <details><summary>Consulta de débitos parametrizada</summary><pre className="whitespace-pre-wrap break-words rounded bg-slate-100 p-3">{JSON.stringify(data.debts, null, 2)}</pre></details>
  </div>;
}

function LinkToProcess({ id }: { id: string }) { return <a className="underline" href={`/protocolos/processos/${id}`}>Abrir processo cadastral</a>; }
