"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { enforcementActLabels, enforcementServiceLabels } from "@/lib/obras/construction-enforcement-policy";
import { openEnforcement, assignEnforcement, recordEnforcementVisit, issueEnforcementAct, acknowledgeEnforcementAct } from "./actions";

type Option = { id: string; label: string };
const field = "w-full rounded border bg-transparent p-2 text-xs";
function Select({ name, label, options, required = false }: { name: string; label: string; options: Option[]; required?: boolean }) { return <label className="block space-y-1 text-xs">{label}<select name={name} required={required} className={field}><option value="">Selecione...</option>{options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>; }
function Text({ name, label, required = true, type = "text" }: { name: string; label: string; required?: boolean; type?: string }) { return <label className="block space-y-1 text-xs">{label}<input name={name} type={type} required={required} className={field} /></label>; }
function Notes({ name, label }: { name: string; label: string }) { return <label className="block space-y-1 text-xs">{label}<textarea name={name} required minLength={10} maxLength={10000} className={field} rows={3} /></label>; }
function utc(form: FormData, key: string) { const value = String(form.get(key) || ""); return value ? new Date(value).toISOString() : ""; }

function EnforcementEvidencePicker({ documents, proof }: { documents: Option[]; proof: boolean }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const filtered = documents.filter((document) => document.label.toLocaleLowerCase("pt-BR").includes(q.trim().toLocaleLowerCase("pt-BR")) && (!selectedOnly || selected.includes(document.id)));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)));
  return <fieldset className="space-y-2 rounded border p-2">
    <legend className="text-xs">{proof ? "Comprovante GED obrigatório" : "Evidências GED (vincule arquivos/fotos pelo protocolo)"}</legend>
    {!proof && <select name="evidenceKind" className={field}><option value="DOCUMENT">Documentos</option><option value="PHOTO">Fotos de diligência</option></select>}
    <label className="block text-xs">Buscar documento GED<input type="search" value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} className={field} /></label>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selectedOnly} onChange={(event) => { setSelectedOnly(event.target.checked); setPage(1); }} />Exibir somente selecionados</label>
    <p className="text-xs text-slate-500">{selected.length} selecionado(s) de até 30. A seleção é preservada entre páginas e buscas.</p>
    {selected.map((documentId) => <input key={documentId} name="documentIds" type="hidden" value={documentId} />)}
    {filtered.slice((currentPage - 1) * 20, currentPage * 20).map((document) => <label key={document.id} className="flex gap-2 py-1 text-xs"><input type="checkbox" checked={selected.includes(document.id)} disabled={!selected.includes(document.id) && selected.length >= 30} onChange={(event) => { setSelected((current) => event.target.checked ? [...current, document.id] : current.filter((id) => id !== document.id)); }} />{document.label}</label>)}
    {!filtered.length && <p className="text-xs text-slate-500">Nenhum documento encontrado. Anexe arquivos pelo processo ou ajuste os filtros.</p>}
    <ErpPagination page={currentPage} total={filtered.length} pageSize={20} previousHref="#" nextHref="#" label="documentos GED" onPageChange={setPage} />
  </fieldset>;
}

export function ConstructionEnforcementOpening({ properties, subjects, permits, persons, companies }: { properties: Option[]; subjects: (Option & { processTypeId: string })[]; permits: Option[]; persons: Option[]; companies: Option[] }) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Abrir processo fiscal demonstrativo</summary><form className="mt-3 grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); key.current ||= crypto.randomUUID(); start(async () => { setError(""); const subject = subjects.find((item) => item.id === form.get("subjectId")); const result = await openEnforcement({ requestKey: key.current, realEstateId: String(form.get("realEstateId")), subjectId: String(form.get("subjectId")), processTypeId: subject?.processTypeId || "", permitCaseId: String(form.get("permitCaseId") || ""), personId: String(form.get("personId") || ""), companyId: String(form.get("companyId") || ""), locationType: String(form.get("locationType")), permitStatus: String(form.get("permitStatus")), reason: String(form.get("reason")) }); if (result.error) setError(result.error); else router.push(`/obras/construcao-civil/fiscalizacao/${result.id}`); }); }}>
    <Select name="realEstateId" label="Imóvel (filtre a inscrição/endereço na busca acima)" options={properties} required /><Select name="subjectId" label="Assunto do protocolo — use assunto edilício/posturas" options={subjects} required />
    <label className="text-xs">Localização<select name="locationType" className={field}><option value="URBAN">Urbana</option><option value="RURAL">Rural</option></select></label>
    <label className="text-xs">Situação de alvará declarada<select name="permitStatus" className={field}><option value="WITHOUT_PERMIT">SEM ALVARÁ</option><option value="UNKNOWN">Não verificada</option><option value="REPORTED_PERMIT">Alvará informado — conferir evidência</option></select></label>
    <Select name="permitCaseId" label="Processo de obra relacionado (opcional; não comprova emissão)" options={permits} /><Select name="personId" label="Pessoa interessada (opcional, conforme assunto)" options={persons} /><Select name="companyId" label="Empresa interessada (alternativa à pessoa)" options={companies} /><Notes name="reason" label="Motivo / denúncia / constatação" />
    <div className="md:col-span-2"><p className="mb-2 text-xs text-amber-700">Ambiente demonstrativo. O protocolo deve ser recebido no módulo Processos antes da designação e das diligências. Nenhuma norma ou multa é presumida pelo sistema.</p>{error && <p role="alert" className="mb-2 text-sm text-red-600">{error}</p>}<button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">{pending ? "Protocolando..." : "Abrir fiscalização"}</button></div>
  </form></details>;
}

export function ConstructionEnforcementOperations({ caseId, revision, canAssign, canRecord, inspectors, documents, visits, acts }: { caseId: string; revision: number; canAssign: boolean; canRecord: boolean; inspectors: Option[]; documents: Option[]; visits: Option[]; acts: (Option & { kind: string })[] }) {
  const router = useRouter();
  const keys = useRef<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  function submit(event: React.FormEvent<HTMLFormElement>, operation: "assign" | "visit" | "act" | "acknowledge") {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    keys.current[operation] ||= crypto.randomUUID();
    const common = { caseId, revision, requestKey: keys.current[operation] };
    const evidence = form.getAll("documentIds").map((documentId) => ({ documentId: String(documentId), kind: operation === "acknowledge" ? "SERVICE_PROOF" : String(form.get("evidenceKind") || "DOCUMENT") }));
    start(async () => {
      setMessage("");
      try {
        const result = operation === "assign" ? await assignEnforcement({ ...common, employeeId: String(form.get("employeeId")), reason: String(form.get("reason")) })
          : operation === "visit" ? await recordEnforcementVisit({ ...common, visitedAt: utc(form, "visitedAt"), findings: String(form.get("findings")), evidence })
          : operation === "act" ? await issueEnforcementAct({ ...common, kind: String(form.get("kind")), visitId: String(form.get("visitId") || ""), relatedActId: String(form.get("relatedActId") || ""), reason: String(form.get("reason")), legalBasis: String(form.get("legalBasis")), issuedAt: utc(form, "issuedAt"), deadlineAt: utc(form, "deadlineAt"), evidence })
          : await acknowledgeEnforcementAct({ ...common, actId: String(form.get("actId")), acknowledgedAt: utc(form, "acknowledgedAt"), method: String(form.get("method")), recipient: String(form.get("recipient")), notes: String(form.get("notes")), evidence });
        if (result.error) setMessage(result.error);
        else { delete keys.current[operation]; element.reset(); setMessage("Registro salvo no histórico."); router.refresh(); }
      } catch { setMessage("Não foi possível registrar. Tente novamente com a mesma operação."); }
    });
  }
  function evidenceFields(proof = false) { return <EnforcementEvidencePicker key={revision} documents={documents} proof={proof} />; }
  const button = <button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">{pending ? "Salvando..." : "Registrar"}</button>;
  return <section className="space-y-3">{message && <p role="status" className="rounded border p-2 text-sm">{message}</p>}
    {canAssign && <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Designar / substituir fiscal</summary><form onSubmit={(event) => submit(event, "assign")} className="mt-3 space-y-3"><Select name="employeeId" label="Fiscal com designação vigente no setor" options={inspectors} required /><Notes name="reason" label="Motivo da designação / substituição" />{button}</form></details>}
    {canRecord && <><details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Registrar diligência / fotos</summary><form onSubmit={(event) => submit(event, "visit")} className="mt-3 space-y-3"><Text name="visitedAt" label="Data/hora da diligência (horário local)" type="datetime-local" /><Notes name="findings" label="Constatações da fiscalização" />{evidenceFields()}{button}</form></details>
    <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Emitir ato demonstrativo</summary><form onSubmit={(event) => submit(event, "act")} className="mt-3 grid gap-3 md:grid-cols-2"><Select name="kind" label="Tipo de ato" options={Object.entries(enforcementActLabels).map(([id, label]) => ({ id, label }))} required /><Select name="visitId" label="Diligência relacionada" options={visits} /><Select name="relatedActId" label="Ato relacionado (obrigatório para levantamento)" options={acts} /><Text name="issuedAt" label="Data/hora de emissão (horário local)" type="datetime-local" /><Text name="deadlineAt" label="Prazo explícito (obrigatório nas notificações)" type="datetime-local" required={false} /><Notes name="reason" label="Motivo e determinação" /><Notes name="legalBasis" label="Fundamento informado — identifique regra demonstrativa ou norma verificada" />{evidenceFields()}<p className="text-xs text-amber-700 md:col-span-2">Número DEMO-FISC gerado automaticamente. Registro demonstrativo sem cobrança tributária automática. A ciência é registrada separadamente com comprovante.</p>{button}</form></details>
    <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Registrar ciência / recusa</summary><form onSubmit={(event) => submit(event, "acknowledge")} className="mt-3 space-y-3"><Select name="actId" label="Ato" options={acts} required /><Text name="acknowledgedAt" label="Data/hora da ciência (horário local)" type="datetime-local" /><Select name="method" label="Forma de ciência" options={Object.entries(enforcementServiceLabels).map(([id, label]) => ({ id, label }))} required /><Text name="recipient" label="Destinatário / recebedor" /><Notes name="notes" label="Certificação da ciência / recusa e observações" />{evidenceFields(true)}{button}</form></details></>}
    {!canRecord && <p className="text-xs text-slate-500">Diligências e atos exigem protocolo recebido/ativo e usuário vinculado ao fiscal designado com vínculo vigente no setor.</p>}
  </section>;
}
