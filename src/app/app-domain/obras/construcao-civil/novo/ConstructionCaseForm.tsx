"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { areaKeys, areaLabels, calculateConstructionArea } from "@/lib/obras/construction-policy";
import { openConstructionCase } from "../actions";

type Option = { id: string; name: string };
type Props = { formVersion: number; fields: { key: string; label: string; type: string; required: boolean; options: string[] }[]; checks: { key: string; label: string; required: boolean }[]; documents: { label: string; required: boolean }[]; configuration: { version: number; instructions: string; weights: Record<keyof typeof areaLabels, number> }; catalogs: (Option & { kind: string })[]; subjects: (Option & { processTypeId: string })[]; people: Option[]; companies: Option[]; properties: Option[] };
const field = "h-8 w-full rounded border bg-white px-2 text-sm dark:bg-slate-900";

export default function ConstructionCaseForm({ configuration, catalogs, subjects, people, companies, properties, fields, formVersion, checks, documents }: Props) {
  const router = useRouter();
  const requestKey = useRef("");
  const uploadKeys = useRef<Record<string, string>>({});
  const [documentIds, setDocumentIds] = useState<Record<string, string>>({});
  const [uploadedNames, setUploadedNames] = useState<Record<string, string>>({});
  const [checkValues, setCheckValues] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [category, setCategory] = useState("BUILDING");
  const [locationType, setLocationType] = useState("URBAN");
  const [regularization, setRegularization] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [applicantType, setApplicantType] = useState("person");
  const [applicantId, setApplicantId] = useState("");
  const [modalityId, setModalityId] = useState("");
  const [purposeId, setPurposeId] = useState("");
  const [constructionTypeId, setConstructionTypeId] = useState("");
  const [propertyIds, setPropertyIds] = useState([""]);
  const [areas, setAreas] = useState({ existingArea: "0", expandedArea: "0", irregularArea: "0", renovationArea: "0", demolitionArea: "0" });
  const [description, setDescription] = useState("");
  const [additionalValues, setAdditionalValues] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  let calculated = "—";
  try { calculated = calculateConstructionArea(areas, configuration.weights).total; } catch { /* Form validation displays the invalid values on submit. */ }
  async function upload(label: string, file: File) {
    requestKey.current ||= crypto.randomUUID();
    uploadKeys.current[label] ||= crypto.randomUUID();
    setUploading(label); setError("");
    setDocumentIds((current) => { const next = { ...current }; delete next[label]; return next; });
    const body = new FormData(); body.set("requestKey", requestKey.current); body.set("uploadKey", uploadKeys.current[label]); body.set("formVersion", String(formVersion)); body.set("label", label); body.set("file", file);
    try {
      const response = await fetch("/api/construcao-civil/abertura-interna/anexos", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Não foi possível preparar o documento."); return; }
      delete uploadKeys.current[label]; setDocumentIds((current) => ({ ...current, [label]: result.id })); setUploadedNames((current) => ({ ...current, [label]: file.name }));
    } catch { setError("Falha de comunicação. Repita o envio do mesmo arquivo para recuperar o documento preparado."); } finally { setUploading(null); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (uploading) { setError("Aguarde o envio dos documentos."); return; }
    if (documents.some((document) => document.required && !documentIds[document.label])) { setError("Prepare todos os documentos obrigatórios antes de abrir o processo."); return; }
    setPending(true);
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      const result = await openConstructionCase({ requestKey: requestKey.current, configurationVersion: configuration.version, formVersion, additionalValues, documentIds, checks: checkValues, processTypeId: subjects.find((subject) => subject.id === subjectId)?.processTypeId, subjectId, personId: applicantType === "person" ? applicantId : "", companyId: applicantType === "company" ? applicantId : "", category, locationType, regularization, modalityId, purposeId, constructionTypeId: category === "BUILDING" ? constructionTypeId : "", propertyIds, ...areas, description });
      if (result.error) { setError(result.error); return; }
      router.push(`/obras/construcao-civil/${result.id}`); router.refresh();
    } catch { setError("Falha de comunicação. Reenvie para recuperar a mesma solicitação."); } finally { setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-4 rounded-lg border p-3"><p className="whitespace-pre-wrap rounded border bg-slate-50 p-3 text-xs text-slate-700">Configuração v{configuration.version}: {configuration.instructions}</p>
    <fieldset disabled={pending || Boolean(uploading)} className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs">Categoria<select className={field} value={category} onChange={(event) => { setCategory(event.target.value); setModalityId(""); }}><option value="BUILDING">Obra</option><option value="SUBDIVISION">Parcelamento do solo</option></select></label>
      <label className="text-xs">Localização<select className={field} value={locationType} onChange={(event) => setLocationType(event.target.value)}><option value="URBAN">Urbana</option><option value="RURAL">Rural</option></select></label>
      <label className="text-xs">Tipo de requerente<select className={field} value={applicantType} onChange={(event) => { setApplicantType(event.target.value); setApplicantId(""); }}><option value="person">Pessoa física</option><option value="company">Pessoa jurídica</option></select></label>
      <label className="text-xs">Requerente<select required className={field} value={applicantId} onChange={(event) => setApplicantId(event.target.value)}><option value="">Selecione</option>{(applicantType === "person" ? people : companies).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs sm:col-span-2">Assunto de protocolo (define o setor inicial)<select required className={field} value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Selecione o assunto urbanístico configurado</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs">Modalidade<select required className={field} value={modalityId} onChange={(event) => setModalityId(event.target.value)}><option value="">Selecione</option>{catalogs.filter((item) => item.kind === (category === "BUILDING" ? "PERMIT_TYPE" : "SUBDIVISION_TYPE")).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs">Finalidade<select required className={field} value={purposeId} onChange={(event) => setPurposeId(event.target.value)}><option value="">Selecione</option>{catalogs.filter((item) => item.kind === "PURPOSE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {category === "BUILDING" && <label className="text-xs">Tipo construtivo<select required className={field} value={constructionTypeId} onChange={(event) => setConstructionTypeId(event.target.value)}><option value="">Selecione</option>{catalogs.filter((item) => item.kind === "CONSTRUCTION_TYPE").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={regularization} onChange={(event) => setRegularization(event.target.checked)} />Processo de regularização</label>
      <fieldset className="space-y-2 rounded border p-2 sm:col-span-2"><legend className="text-xs">Imóveis vinculados</legend>{propertyIds.map((propertyId,index) => <div key={index} className="flex gap-2"><select aria-label={`Imóvel ${index + 1}`} required className={field} value={propertyId} onChange={(event) => setPropertyIds(propertyIds.map((value,i) => i === index ? event.target.value : value))}><option value="">Selecione</option>{properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" disabled={propertyIds.length === 1} aria-label="Remover imóvel" onClick={() => setPropertyIds(propertyIds.filter((_,i) => i !== index))}>×</button></div>)}<button type="button" disabled={propertyIds.length >= 100} className="text-xs text-blue-700 underline" onClick={() => setPropertyIds([...propertyIds, ""])}>Vincular outro imóvel</button></fieldset>
      <fieldset className="grid gap-2 rounded border p-2 sm:col-span-2 sm:grid-cols-5"><legend className="text-xs">Áreas declaradas (m²)</legend>{areaKeys.map((key) => <label key={key} className="text-xs">{areaLabels[key]}<input required min="0" max="9999999999.9999" step="0.0001" type="number" className={field} value={areas[key]} onChange={(event) => setAreas({ ...areas, [key]: event.target.value })} /></label>)}<p className="text-xs sm:col-span-5">Área total pela regra publicada: <strong>{calculated} m²</strong>. Informe componentes conforme a norma, evitando áreas sobrepostas.</p></fieldset>
      <label className="text-xs sm:col-span-2">Descrição da solicitação<textarea required minLength={3} maxLength={4000} rows={4} className="w-full rounded border bg-transparent p-2 text-sm" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      {fields.map((fieldDefinition) => <label key={fieldDefinition.key} className="text-xs">{fieldDefinition.label}{fieldDefinition.required ? " *" : ""}{fieldDefinition.type === "CHOICE" ? <select required={fieldDefinition.required} className={field} value={additionalValues[fieldDefinition.key] || ""} onChange={(event) => setAdditionalValues({ ...additionalValues, [fieldDefinition.key]: event.target.value })}><option value="">Selecione</option>{fieldDefinition.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input required={fieldDefinition.required} type={fieldDefinition.type === "DATE" ? "date" : fieldDefinition.type === "NUMBER" ? "number" : "text"} step={fieldDefinition.type === "NUMBER" ? "any" : undefined} maxLength={4000} className={field} value={additionalValues[fieldDefinition.key] || ""} onChange={(event) => setAdditionalValues({ ...additionalValues, [fieldDefinition.key]: event.target.value })} />}</label>)}
      {checks.length > 0 && <fieldset className="space-y-2 rounded border p-2 sm:col-span-2"><legend className="text-xs">Conferências do formulário de abertura</legend>{checks.map((check) => <label key={check.key} className="flex items-center gap-2 text-xs"><input type="checkbox" required={check.required} checked={checkValues[check.key] || false} onChange={(event) => setCheckValues({ ...checkValues, [check.key]: event.target.checked })} />{check.label}{check.required ? " *" : ""}</label>)}</fieldset>}
      {documents.length > 0 && <fieldset className="space-y-3 rounded border p-2 sm:col-span-2"><legend className="text-xs">Documentos de abertura — GED</legend><p className="text-xs">PDF, JPG ou PNG, até 10 MB. Cada arquivo é preparado para esta abertura e sua conta; o protocolo será criado após a conferência de todos os documentos obrigatórios.</p>{documents.map((document) => <label key={document.label} className="block space-y-1 text-xs">{document.label}{document.required ? " *" : " (opcional)"}<input type="file" accept="application/pdf,image/jpeg,image/png" className="block w-full text-sm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(document.label, file); }} />{documentIds[document.label] && <span className="block text-green-700">Preparado: {uploadedNames[document.label]}</span>}</label>)}</fieldset>}
    </fieldset>
    {uploading && <p role="status" className="text-sm">Preparando {uploading} no GED...</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="text-right"><button disabled={pending || Boolean(uploading)} className="rounded bg-blue-600 px-3 py-2 text-xs text-white disabled:opacity-50">{pending ? "Protocolando..." : "Abrir processo e solicitação"}</button></div>
  </form>;
}
