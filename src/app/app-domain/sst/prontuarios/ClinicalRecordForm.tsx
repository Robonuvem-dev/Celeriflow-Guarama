"use client";
import { useState } from "react";
import { SstForm } from "../SstForm";
import { saveSstClinicalRecord } from "./actions";
import { clinicalRequest, type ClinicalDiscipline } from "@/lib/sst/clinical-policy";
import type { Question, Answer } from "@/lib/sst/questionnaire-policy";
import { QuestionnaireAnswersEditor, questionnaireAnswersError } from "../_components/QuestionnaireAnswersEditor";
import { SstTablePanel } from "../_components/SstTablePanel";
import { sstColumn } from "../_components/operational-columns";

type Request = { kind: "EXAM" | "REFERRAL" | "MEDICATION"; description: string; instructions: string; medicineId: string; quantity: number; days: number };
const field = "block w-full min-w-0 rounded border p-2";
export function ClinicalRecordForm({ budgetUnitId, discipline, people, professionals, medicines, questionnaire }: {
  budgetUnitId: string; discipline: ClinicalDiscipline; people: { id: string; fullName: string }[];
  professionals: { id: string; name: string; council: string }[]; medicines: { id: string; name: string }[];
  questionnaire?: { id: string; questions: Question[] };
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const index = Math.min(selectedIndex, requests.length - 1), request = requests[index];
  const set = (key: string, value: Answer) => setAnswers(current => ({ ...current, [key]: value }));
  const requestSet = (position: number, patch: Partial<Request>) => setRequests(current => current.map((item, i) => i === position ? { ...item, ...patch } : item));
  return <SstForm action={async form => {
    for (const [position, item] of requests.entries()) { const parsed = clinicalRequest.safeParse(item); if (!parsed.success) return { error: `Solicitação ${position + 1}: ${parsed.error.issues[0]?.message || "Confira os campos."}` }; }
    const error = questionnaire ? questionnaireAnswersError(questionnaire.questions, answers) : null;
    return error ? { error } : saveSstClinicalRecord(form);
  }} redirectBase="/sst/prontuarios" label="Registrar atendimento">
    <input type="hidden" name="budgetUnitId" value={budgetUnitId} /><input type="hidden" name="discipline" value={discipline} /><input type="hidden" name="questionnaireVersionId" value={questionnaire?.id || ""} /><input type="hidden" name="answers" value={JSON.stringify(answers)} /><input type="hidden" name="requests" value={JSON.stringify(requests)} />
    <div className="grid gap-3 sm:grid-cols-2"><label>Pessoa/servidor<select required name="personId" className={field}><option value="">Selecione</option>{people.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label>Profissional habilitado<select required name="professionalRoleId" className={field}><option value="">Selecione</option>{professionals.map(person => <option key={person.id} value={person.id}>{person.name} · {person.council}</option>)}</select></label><label>Data/hora do atendimento<input type="datetime-local" required name="attendedAt" className={field} /></label><label>Contexto ocupacional<input required minLength={5} maxLength={2000} name="occupationalContext" className={field} /></label></div>
    {[["narrative", "Atendimento"], ["opinion", "Parecer profissional"], ["diagnosis", "Diagnóstico/avaliação"]].map(([name, label]) => <label key={name}>{label}<textarea name={name} required={name !== "diagnosis"} minLength={name !== "diagnosis" ? 5 : undefined} maxLength={name === "diagnosis" ? 10000 : 20000} rows={4} className={field} /></label>)}<label>CIDs (separados por ponto e vírgula)<input name="cidCodes" className={field} /></label>
    {questionnaire && <QuestionnaireAnswersEditor questions={questionnaire.questions} answers={answers} onAnswerAction={set} preferenceId="sst-clinico-questionario-edicao" />}
    <SstTablePanel title="Solicitações e encaminhamentos" preferenceId="sst-clinico-solicitacoes-edicao"
      columns={[sstColumn("kind", "Tipo", 150, 100), sstColumn("description", "Descrição/destino", 260, 140), sstColumn("instructions", "Orientações/posologia", 300, 140), sstColumn("medicine", "Medicamento", 200, 120), sstColumn("quantity", "Quantidade", 110, 80), sstColumn("days", "Dias", 70, 55), sstColumn("actions", "Ações", 145, 135, "actions")]}
      rows={requests.map((item, position) => ({ id: String(position), label: item.description || `Solicitação ${position + 1}`, values: { kind: item.kind, description: item.description, instructions: item.instructions, medicine: item.kind === "MEDICATION" ? medicines.find(medicine => medicine.id === item.medicineId)?.name || item.medicineId : "—", quantity: item.kind === "MEDICATION" ? String(item.quantity) : "—", days: item.kind === "MEDICATION" ? String(item.days) : "—" }, actions: <><button type="button" onClick={() => setSelectedIndex(position)}>Editar</button> <button type="button" onClick={() => setRequests(current => current.filter((_, i) => i !== position))}>Remover</button></> }))} />
    {request && <fieldset className="grid gap-3 rounded border p-3 sm:grid-cols-2"><legend>Solicitação {index + 1}</legend><label>Tipo<select className={field} value={request.kind} onChange={event => requestSet(index, { kind: event.target.value as Request["kind"] })}><option value="REFERRAL">Encaminhamento</option>{discipline === "MEDICINE" && <><option value="EXAM">Exame complementar</option><option value="MEDICATION">Prescrição de medicamento</option></>}</select></label><label>Descrição/destino<input required value={request.description} minLength={2} maxLength={1000} className={field} onChange={event => requestSet(index, { description: event.target.value })} /></label><label>Orientações/posologia<textarea required={request.kind === "MEDICATION"} minLength={request.kind === "MEDICATION" ? 3 : undefined} maxLength={2000} className={field} value={request.instructions} onChange={event => requestSet(index, { instructions: event.target.value })} /></label>{request.kind === "MEDICATION" && <><label>Medicamento canônico<select required value={request.medicineId} className={field} onChange={event => requestSet(index, { medicineId: event.target.value })}><option value="">Selecione</option>{medicines.map(medicine => <option key={medicine.id} value={medicine.id}>{medicine.name}</option>)}</select></label><label>Quantidade<input type="number" min={1} max={100000} required value={request.quantity} className={field} onChange={event => requestSet(index, { quantity: Number(event.target.value) })} /></label><label>Dias<input type="number" min={1} max={3650} required value={request.days} className={field} onChange={event => requestSet(index, { days: Number(event.target.value) })} /></label></>}<button type="button" className="w-fit rounded border p-2" onClick={() => setRequests(current => current.filter((_, i) => i !== index))}>Remover</button></fieldset>}
    <button type="button" disabled={requests.length >= 100} className="w-fit rounded border p-2" onClick={() => { setSelectedIndex(requests.length); setRequests(current => [...current, { kind: "REFERRAL", description: "", instructions: "", medicineId: "", quantity: 1, days: 1 }]); }}>Adicionar solicitação</button>
  </SstForm>;
}
