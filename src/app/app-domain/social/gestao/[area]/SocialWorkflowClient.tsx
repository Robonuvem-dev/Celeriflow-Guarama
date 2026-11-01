"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { SocialOperationalList } from "../../OperationalList";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { socialWorkflowAreas, type SocialField, type SocialQuestionInput, type SocialWorkflowArea, type SocialWorkflowData, type SocialWorkflowRow } from "@/lib/social/workflow-contract";
import { saveSocialWorkflowAction } from "./actions";
import { DocumentValuesField, ImportMappingField, MonthlyIndicatorField } from "./MunicipalFields";
import { socialMessageAction } from "../../comunicacoes/actions";

const inputClass = "h-8 w-full min-w-0 rounded border border-slate-300 bg-white px-2 text-sm dark:bg-slate-900";
const labels: Record<string, string> = { ACTIVE: "Ativo", ARCHIVED: "Arquivado", CLOSED: "Encerrado", PENDING: "Pendente", COMPLIED: "Cumprida", NONCOMPLIANCE: "Descumprimento", SUSPENDED: "Suspensão", PLANNED: "Planejado", REALIZED: "Realizado", CANCELLED: "Cancelado", AWAITING_PROVIDER: "Aguardando configuração", QUEUED: "Aguardando envio", DISPATCHING: "Em processamento", ACCEPTED: "Aceito pelo canal", SENT: "Enviado", DELIVERED: "Entregue", FAILED: "Falha no envio", UNKNOWN: "Aguardando conciliação", DRAFT: "Em elaboração", FINAL: "Concluído", ISSUED: "Emitido", QUEUE: "Fila de envio", SMSGATE: "SMSGate — Android", TEXTBELT: "Textbelt", TAB: "Tabulação", AUTO: "Detectar pelo arquivo", ISO: "AAAA-MM-DD", BR: "DD/MM/AAAA", RETIRADA: "Retirada na unidade", DOMICILIAR: "Entrega domiciliar", TRANSFERENCIA: "Transferência financeira", true: "Sim", false: "Não", OWN: "Somente próprios", UNIT: "Unidade", MUNICIPAL: "Municipal" };
export function SocialWorkflowClient({ area, data }: { area: SocialWorkflowArea; data: SocialWorkflowData }) {
  const router = useRouter();
  const definition = socialWorkflowAreas[area];
  const fields = definition.fields as SocialField[];
  const [search, setSearch] = useState(""); const [unit, setUnit] = useState(""); const [status, setStatus] = useState("");
  const [page, setPage] = useState(1); const [dialog, setDialog] = useState(false); const [detail, setDetail] = useState<SocialWorkflowRow | null>(null);
  const [editing, setEditing] = useState<string>(); const [values, setValues] = useState<Record<string, string>>({}); const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const filtered = data.rows.filter(row => `${row.title} ${row.detail} ${row.status}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")) && (!unit || row.unitId === unit) && (!status || row.status === status));
  const activePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / OPERATIONAL_PAGE_SIZE)));
  const visibleFields = fields.slice(step * 6, step * 6 + 6); const steps = Math.ceil(fields.length / 6);
  const update = (key: string, value: string) => setValues(current => ({ ...current, [key]: value }));
  function open(row?: SocialWorkflowRow) {
    const defaults = Object.fromEntries(fields.map(field => [field.key, field.type === "date" ? new Date().toISOString().slice(0, 10) : field.options?.[0] || (field.key === "unitId" ? data.options.units[0]?.id || "" : field.type === "questions" || field.type === "weekdays" ? "[]" : field.type === "answers" ? "{}" : "")]));
    for (const field of fields) if (field.optional) defaults[field.key] = "";
    setValues(row ? { ...defaults, ...data.defaults, ...row.values } : { ...defaults, ...data.defaults }); setEditing(row?.id); setStep(0); setError(""); setDetail(null); setDialog(true);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < steps - 1) { setStep(step + 1); return; }
    setPending(true); setError("");
    try {
      const response = await saveSocialWorkflowAction({ area, id: editing, values });
      if (response.error) { setError(response.error); return; }
      setDialog(false); setNotice(area === "formularios" && editing ? "Nova versão criada; respostas anteriores preservadas." : "Registro salvo."); router.refresh();
    } catch { setError("Falha de comunicação. Os dados preenchidos foram preservados."); } finally { setPending(false); }
  }
  async function processMessage(operation:"send"|"refresh"|"queue",id=""){
    setPending(true);setError("");try{const result=await socialMessageAction({operation,id,unitId:unit});if(result.error)setError(result.error);else setNotice(result.info||"Operação concluída.");router.refresh();}catch{setError("Não foi possível consultar o processamento. Confira o histórico antes de repetir.");}finally{setPending(false);}
  }
  function fieldInput(field: SocialField) {
    const value = values[field.key] || "";
    if (field.type === "questions") return <QuestionBuilder value={value} onChange={next => update(field.key, next)} />;
    if (field.type === "answers") return <QuestionAnswers questions={data.questionnaires.find(q => q.id === values.questionnaireId)?.questions || []} value={value} onChange={next => update(field.key, next)} />;
    if (field.type === "mapping") return <ImportMappingField value={value} onChange={next=>update(field.key,next)}/>;
    if (field.type === "indicators") return <MonthlyIndicatorField value={value} unitType={data.unitTypes?.[values.unitId]||"CRAS"} onChange={next=>update(field.key,next)}/>;
    if (field.type === "document") return <DocumentValuesField value={value} templateCode={values.templateCode||""} onChange={next=>update(field.key,next)}/>;
    if (field.type === "choices") { const selected:string[]=JSON.parse(value||"[]");return <div className="flex flex-wrap gap-3">{field.options?.map(option=><label key={option} className="text-xs"><input type="checkbox" checked={selected.includes(option)} onChange={e=>update(field.key,JSON.stringify(e.target.checked?[...selected,option]:selected.filter(v=>v!==option)))}/> {labels[option]||option}</label>)}</div>; }
    if (field.type === "weekdays") return <div className="flex flex-wrap gap-2">{["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((label, day) => { const selected: number[] = JSON.parse(value || "[]"); return <label key={day}><input type="checkbox" checked={selected.includes(day)} onChange={e => update(field.key, JSON.stringify(e.target.checked ? [...selected, day] : selected.filter(n => n !== day)))} /> {label}</label>; })}</div>;
    if (field.type === "select") return <select aria-label={field.label} className={inputClass} required={!field.optional} value={value} onChange={event => { update(field.key, event.target.value); if (field.key === "questionnaireId") update("answers", "{}");if(field.key==="templateCode")update("documentData","{}"); }}><option value="">Selecione</option>{(field.reference ? data.options[field.reference] || [] : (field.options || []).map(id => ({ id, name: labels[id] || id }))).map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>;
    if (field.type === "textarea") return <textarea aria-label={field.label} rows={3} className="w-full rounded border p-2 text-sm" required={!field.optional} maxLength={10000} value={value} onChange={event => update(field.key, event.target.value)} />;
    return <input aria-label={field.label} className={inputClass} type={field.type || "text"} min={field.type === "number" ? "0" : undefined} step={field.type === "number" ? "0.01" : undefined} required={!field.optional} maxLength={500} value={value} onChange={event => update(field.key, event.target.value)} />;
  }
  const restricted = ["unidades", "profissionais", "beneficios", "programas", "parametros", "layouts"].includes(area) && !data.administrator;
  return <PageFrame className="flex h-full min-h-0 flex-col gap-1">
    <PageHeader title={definition.title} icon={<ClipboardList className="size-4" />} action={!restricted && <button onClick={() => open(area==="parametros"?data.rows[0]:undefined)} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white">{area === "parametros" ? "Editar parâmetros" : area === "comunicacoes" ? "Preparar avisos do programa" : "Novo registro"}</button>} />
    {notice && <p role="status" className="text-xs text-emerald-700">{notice}</p>}
    {error && !dialog && !detail && <p role="alert" className="text-xs text-red-700">{error}</p>}
    <SocialOperationalList id={`gestao-${area}`} page={activePage} total={filtered.length} onPageChange={setPage}
      toolbar={<><input aria-label="Buscar registros" className={`${inputClass} flex-1`} placeholder="Buscar nome, situação ou conteúdo..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /><OperationalFilters activeCount={Number(Boolean(unit)) + Number(Boolean(status))}><label>Unidade<select className={inputClass} value={unit} onChange={e => { setUnit(e.target.value); setPage(1); }}><option value="">Todas autorizadas</option>{data.options.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Situação<select className={inputClass} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">Todas</option>{Array.from(new Set(data.rows.map(r => r.status))).map(s => <option key={s} value={s}>{labels[s] || s}</option>)}</select></label>{notice && <p role="status">{notice}</p>}{area === "comunicacoes" && <p>A fila registra a demanda. Envio e confirmação dependem do provedor externo.</p>}</OperationalFilters></>}
      actions={<><Link href="/social/relatorios">Relatórios</Link>{area === "beneficiarios" && <Link href="/social/gestao/anexos">Documentos</Link>}{area === "beneficios" && <Link href="/social/requisicoes">Regras e dispensação</Link>}{area === "familias" && <Link href="/social/gestao/membros">Composição</Link>}{area === "anexos" && <Link href="/social/anexar">Enviar arquivo / foto</Link>}{area==="comunicacoes"&&<><button disabled={pending} onClick={()=>processMessage("queue")}>Processar fila</button><Link href="/social/gestao/parametros">Configurar envio</Link></>}</>}
      columns={[["title", "Registro", 300, 130, "identifier"], ["unit", "Unidade", 190, 90], ["date", "Data", 110, 80], ["status", "Situação", 150, 85, "status"], ["actions", "Ações", 120, 120, "actions"]]}
      rows={filtered.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE).map(row => ({ id: row.id, label: row.title, values: { title: row.title, unit: data.options.units.find(u => u.id === row.unitId)?.name || "Municipal", date: row.date.split("-").reverse().join("/"), status: labels[row.status] || row.status }, actions: <div className="flex gap-2"><button onClick={() => setDetail(row)}>Detalhes</button>{!restricted && !row.immutable && <button onClick={() => open(row)}>{area === "formularios" ? "Versionar" : "Editar"}</button>}</div> }))} />
    <Dialog open={Boolean(detail)} onOpenChange={open => !open && setDetail(null)}><DialogContent><DialogHeader><DialogTitle>{detail?.title}</DialogTitle><DialogDescription>Registro persistido e vinculado ao escopo de acesso.</DialogDescription></DialogHeader><p className="whitespace-pre-wrap break-words text-sm">{detail?.detail || "Consulte os campos na ficha de edição."}</p>{detail && <Link className="text-blue-700 underline" href={`/social/gestao/${area}/${detail.id}/historico`}>Histórico de revisões</Link>}{area === "anexos" && detail && <a className="text-blue-700 underline" href={`/api/social/anexos/${detail.id}`} target="_blank" rel="noreferrer">Abrir arquivo protegido</a>}{area==="prontuarios"&&detail&&<Link className="text-blue-700 underline" href={`/social/relatorios?kind=prontuario&caseId=${detail.id}&from=${detail.date}&to=${new Date().toISOString().slice(0,10)}`}>Consultar e emitir prontuário</Link>}{area==="mensal"&&detail&&<Link className="text-blue-700 underline" href={`/social/relatorios?kind=prestacao&statementId=${detail.id}&unitId=${detail.unitId}&from=${detail.date}&to=${new Date(Date.UTC(Number(detail.date.slice(0,4)),Number(detail.date.slice(5,7)),0)).toISOString().slice(0,10)}`}>Consultar e emitir relatório mensal</Link>}{area==="documentos"&&detail&&<Link className="text-blue-700 underline" href={`/social/documentos/${detail.id}`} target="_blank">Abrir documento</Link>}{area==="comunicacoes"&&detail&&<div className="space-y-2 text-xs"><p>Situação: {labels[data.rows.find(r=>r.id===detail.id)?.status||detail.status]||detail.status}</p>{["AWAITING_PROVIDER","QUEUED"].includes(detail.status)&&<button disabled={pending} className="rounded border p-2" onClick={()=>processMessage("send",detail.id)}>Enviar mensagem</button>}<button disabled={pending} className="ml-2 rounded border p-2" onClick={()=>processMessage("refresh",detail.id)}>Consultar situação</button>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}</div>}</DialogContent></Dialog>
    <Dialog open={dialog} onOpenChange={open => !pending && setDialog(open)}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>{editing ? area === "formularios" ? "Criar nova versão" : "Editar registro" : "Novo registro"} — {definition.title}</DialogTitle><DialogDescription>Etapa {step + 1} de {steps}. Campos opcionais estão identificados. O preenchimento é preservado ao voltar.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><fieldset disabled={pending} className="contents">{visibleFields.map(field => <div key={field.key} className={["questions", "answers", "mapping", "indicators", "document"].includes(field.type || "") ? "sm:col-span-2" : ""}><span className="text-xs">{field.label}{field.optional ? " (opcional)" : " *"}</span>{fieldInput(field)}</div>)}</fieldset>{error && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}<div className="flex justify-end gap-2 border-t pt-3 sm:col-span-2"><button type="button" disabled={pending} onClick={() => setDialog(false)}>Fechar</button>{step > 0 && <button type="button" disabled={pending} onClick={() => setStep(step - 1)}>Voltar</button>}<button disabled={pending} className="rounded bg-blue-600 px-3 py-2 text-xs text-white">{pending ? "Salvando..." : step < steps - 1 ? "Próximo" : "Salvar"}</button></div></form>
    </DialogContent></Dialog>
  </PageFrame>;
}
function QuestionBuilder({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const questions: SocialQuestionInput[] = JSON.parse(value || "[]"); const [index, setIndex] = useState(0); const question = questions[index];
  const change = (patch: Partial<SocialQuestionInput>) => onChange(JSON.stringify(questions.map((q, i) => i === index ? { ...q, ...patch } : q)));
  function addQuestion() {
    let key = 1; while (questions.some(q => q.key === `q${key}`)) key++;
    onChange(JSON.stringify([...questions, { key: `q${key}`, label: "", type: "SHORT", required: false, options: [] }])); setIndex(questions.length);
  }
  return <div className="space-y-2 rounded border p-2">
    <div className="flex gap-2"><select aria-label="Pergunta em edição" className={inputClass} value={index} onChange={e => setIndex(Number(e.target.value))}>{questions.map((q, i) => <option key={q.key} value={i}>{i + 1}. {q.label || "Nova pergunta"}</option>)}</select><button type="button" onClick={addQuestion}>Adicionar</button></div>
    {question && <><input aria-label="Texto da pergunta" className={inputClass} value={question.label} onChange={e => change({ label: e.target.value })} placeholder="Texto da pergunta" />
      <select aria-label="Tipo da resposta" className={inputClass} value={question.type} onChange={e => change({ type: e.target.value as SocialQuestionInput["type"] })}><option value="SHORT">Texto curto</option><option value="LONG">Texto longo</option><option value="CHECKBOX">Caixa de seleção (sim/não)</option><option value="SINGLE">Escolha única</option><option value="MULTIPLE">Múltiplas escolhas</option></select>
      {["SINGLE", "MULTIPLE"].includes(question.type) && <input aria-label="Alternativas separadas por ponto e vírgula" className={inputClass} placeholder="Alternativa 1; Alternativa 2" value={question.options.join(";")} onChange={e => change({ options: e.target.value.split(";") })} />}
      <label><input type="checkbox" checked={question.required} onChange={e => change({ required: e.target.checked })} />Resposta obrigatória</label><button type="button" className="ml-3 text-red-700" onClick={() => { onChange(JSON.stringify(questions.filter((_, i) => i !== index))); setIndex(0); }}>Remover pergunta</button>
    </>}
  </div>;
}
function QuestionAnswers({ questions, value, onChange }: { questions: SocialQuestionInput[]; value: string; onChange: (value: string) => void }) {
  const [index, setIndex] = useState(0); const answers: Record<string, string | string[] | boolean> = JSON.parse(value || "{}"); const active = Math.min(index, Math.max(0, questions.length - 1)); const q = questions[active];
  if (!q) return <p>Selecione o formulário na etapa anterior.</p>;
  const change = (next: string | string[] | boolean) => onChange(JSON.stringify({ ...answers, [q.key]: next }));
  return <div className="space-y-2 rounded border p-2"><p>{active + 1}/{questions.length} — {q.label}{q.required ? " *" : ""}</p>{q.type === "CHECKBOX" ? <select aria-label={q.label} className={inputClass} value={answers[q.key] === undefined ? "" : String(answers[q.key])} onChange={e => change(e.target.value === "true")}><option value="">Não respondido</option><option value="true">Sim</option><option value="false">Não</option></select> : q.type === "SINGLE" ? <select aria-label={q.label} className={inputClass} value={String(answers[q.key] || "")} onChange={e => change(e.target.value)}><option value="">Selecione</option>{q.options.map(o => <option key={o}>{o}</option>)}</select> : q.type === "MULTIPLE" ? <div className="flex flex-wrap gap-2">{q.options.map(o => { const selected = Array.isArray(answers[q.key]) ? answers[q.key] as string[] : []; return <label key={o}><input type="checkbox" checked={selected.includes(o)} onChange={e => change(e.target.checked ? [...selected, o] : selected.filter(v => v !== o))} />{o}</label>; })}</div> : <textarea aria-label={q.label} rows={q.type === "LONG" ? 3 : 1} maxLength={q.type === "LONG" ? 10000 : 500} className="w-full rounded border p-2" value={String(answers[q.key] || "")} onChange={e => change(e.target.value)} />}<div className="flex gap-3"><button type="button" disabled={!active} onClick={() => setIndex(active - 1)}>Pergunta anterior</button><button type="button" disabled={active >= questions.length - 1} onClick={() => setIndex(active + 1)}>Próxima pergunta</button></div></div>;
}
