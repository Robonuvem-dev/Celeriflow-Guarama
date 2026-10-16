"use client";

import { useState } from "react";
import { SstForm } from "../SstForm";
import { saveSstAso } from "./actions";
import { asoKinds, asoResults, asoOccasion } from "@/lib/sst/aso-policy";
import type { Question } from "@/lib/sst/questionnaire-policy";

type PersonOption = { id: string; fullName: string };
type ProgramOption = { id: string; label: string; exams: { name: string; occasion: string }[] };
type ExamEntry = {
  key: number; name: string; kind: string; source: string; performedAt: string; validUntil: string;
  result: string; professionalPersonId: string; professionalCouncil: string;
  laboratoryCompanyId: string; reportNumber: string;
  professionalDiscipline: string;
};
const emptyExam = (key: number, name = "", kind = "COMPLEMENTAR"): ExamEntry => ({ key, name, kind, source: "REALIZADO", performedAt: "", validUntil: "", result: "", professionalPersonId: "", professionalCouncil: "", laboratoryCompanyId: "", reportNumber: "", professionalDiscipline: "MEDICINE" });
const field = "w-full min-w-0 rounded border p-2";

export function AsoForm({ budgetUnitId, people, laboratories, programs, questionnaires, functionalPeriods }: {
  budgetUnitId: string; people: PersonOption[]; laboratories: { id: string; corporateName: string }[]; programs: ProgramOption[];
  questionnaires: { id: string; title: string; version: number; questions: Question[] }[];
  functionalPeriods: { id: string; employeeName: string; contractReference: string; governmentEntityId: string; startsAt: string; endsAt: string }[];
}) {
  const [programGroupId, setProgramGroupId] = useState("");
  const [kind, setKind] = useState<keyof typeof asoKinds>("ADMISSIONAL");
  const [exams, setExams] = useState<ExamEntry[]>([emptyExam(0, "Exame clínico", "CLINICO")]);
  const [questionnaireId, setQuestionnaireId] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const questionnaire = questionnaires.find((q) => q.id === questionnaireId);
  const answer = (key: string, value: unknown) => setAnswers((current) => ({ ...current, [key]: value }));
  const selected = programs.find((program) => program.id === programGroupId);
  const prescribed = selected?.exams.filter((exam) => exam.occasion === asoOccasion(kind)) || [];
  const update = (key: number, name: keyof ExamEntry, value: string) => setExams((current) => current.map((exam) => exam.key === key ? { ...exam, [name]: value } : exam));
  const personSelect = (name: string, label: string) => <label className="grid gap-1">{label}<select name={name} required className={field} defaultValue=""><option value="">Selecione no Cadastro Único</option>{people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>;
  return <SstForm action={saveSstAso} label="Registrar ASO emitido" redirectBase="/sst/aso">
    <input type="hidden" name="budgetUnitId" value={budgetUnitId}/>
    <input type="hidden" name="exams" value={JSON.stringify(exams)}/>
    <input type="hidden" name="anamnesis" value={JSON.stringify({ questionnaireVersionId: questionnaireId, answers })}/>
    <p>O registro preserva a emissão e seus exames. Confira os dados antes de salvar.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {personSelect("personId", "Servidor ou candidato")}
      <label className="grid gap-1">Vínculo funcional histórico RH (obrigatório para servidor)<select name="functionalPeriodId" className={field} defaultValue=""><option value="">Candidato sem vínculo</option>{functionalPeriods.map((p) => <option key={p.id} value={p.id}>{p.employeeName} · {p.contractReference} · Entidade {p.governmentEntityId} · {p.startsAt} — {p.endsAt}</option>)}</select></label>
      <label className="grid gap-1">Concurso/processo seletivo (obrigatório para candidato sem vínculo)<input name="candidateReference" maxLength={200} className={field}/></label>
      <label className="grid gap-1">Tipo<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as keyof typeof asoKinds)} className={field}>{Object.entries(asoKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1">PCMSO e GHE<select name="programGroupId" value={programGroupId} onChange={(event) => setProgramGroupId(event.target.value)} required className={field}><option value="">Selecione a versão aplicável</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.label}</option>)}</select></label>
      <label className="grid gap-1">Realização do ASO<input type="date" name="performedAt" required className={field}/></label>
      <label className="grid gap-1">Vencimento do ASO<input type="date" name="validUntil" required className={field}/></label>
      {personSelect("examinerPersonId", "Médico examinador")}
      <label className="grid gap-1">Conselho/UF/número do médico<input name="examinerCouncil" required minLength={2} maxLength={100} className={field}/></label>
      <label className="grid gap-1">Conclusão<select name="result" required className={field}>{Object.entries(asoResults).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="grid gap-1">Restrições, recomendações ou condição temporária<textarea name="recommendations" maxLength={10000} rows={3} className={field}/></label>
    </div>
    <section className="space-y-3 rounded border p-3"><h2 className="font-semibold">Anamnese pré-emissão obrigatória</h2><select required className={field} value={questionnaireId} onChange={(e) => { setQuestionnaireId(e.target.value); setAnswers({}); }}><option value="">Selecione questionário de Medicina</option>{questionnaires.map((q) => <option key={q.id} value={q.id}>{q.title} v{q.version}</option>)}</select>
      {questionnaire?.questions.map((q) => <label key={`${questionnaire.id}:${q.key}`} className="grid gap-1">{q.section} · {q.label}{q.required ? " *" : ""}
        {q.kind === "BOOLEAN" ? <select required={q.required} className={field} defaultValue="" onChange={(e) => answer(q.key, e.target.value === "" ? null : e.target.value === "true")}><option value="">Selecione</option><option value="true">Sim</option><option value="false">Não</option></select>
          : q.kind === "SINGLE_CHOICE" ? <select required={q.required} className={field} defaultValue="" onChange={(e) => answer(q.key, e.target.value)}><option value="">Selecione</option>{q.choices.map((c) => <option key={c}>{c}</option>)}</select>
          : q.kind === "MULTIPLE_CHOICE" ? <select multiple className={field} onChange={(e) => answer(q.key, [...e.target.selectedOptions].map((o) => o.value))}>{q.choices.map((c) => <option key={c}>{c}</option>)}</select>
          : <input required={q.required} type={q.kind === "DATE" ? "date" : q.kind === "NUMBER" ? "number" : "text"} step={q.kind === "NUMBER" ? "any" : undefined} className={field} onChange={(e) => answer(q.key, q.kind === "NUMBER" ? e.target.value === "" ? null : Number(e.target.value) : e.target.value)}/>}
      </label>)}
    </section>
    {selected && <section className="space-y-2 rounded border p-3"><h2 className="font-semibold">Exames previstos no PCMSO para este tipo</h2><p>{prescribed.length ? prescribed.map((exam) => exam.name).join("; ") : "Sem protocolo específico nesta versão. O exame clínico permanece obrigatório."}</p><button type="button" className="rounded border p-2" onClick={() => setExams((current) => [...current, ...prescribed.filter((item) => !current.some((exam) => exam.name.trim().toLocaleLowerCase("pt-BR") === item.name.trim().toLocaleLowerCase("pt-BR"))).map((item, index) => emptyExam(Math.max(...current.map((exam) => exam.key), -1) + index + 1, item.name))].slice(0, 100))}>Adicionar exames previstos</button></section>}
    <h2 className="font-semibold">Exames realizados ou apresentados</h2>
    {exams.map((exam, index) => <fieldset key={exam.key} className="grid gap-3 rounded border p-3 sm:grid-cols-2"><legend className="px-1 font-semibold">Exame {index + 1}</legend>
      <label className="grid gap-1">Nome<input value={exam.name} required minLength={2} maxLength={200} className={field} onChange={(event) => update(exam.key, "name", event.target.value)}/></label>
      <label className="grid gap-1">Classificação<select value={exam.kind} className={field} onChange={(event) => update(exam.key, "kind", event.target.value)}><option value="CLINICO">Clínico</option><option value="COMPLEMENTAR">Complementar</option><option value="TOXICOLOGICO">Toxicológico</option></select></label>
      <label className="grid gap-1">Origem<select value={exam.source} className={field} onChange={(event) => update(exam.key, "source", event.target.value)}><option value="REALIZADO">Realizado</option><option value="APRESENTADO">Apresentado pelo paciente</option></select></label>
      <label className="grid gap-1">Profissional<select value={exam.professionalPersonId} required className={field} onChange={(event) => update(exam.key, "professionalPersonId", event.target.value)}><option value="">Selecione no Cadastro Único</option>{people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>
      <label className="grid gap-1">Conselho/UF/número<input value={exam.professionalCouncil} required minLength={2} maxLength={100} className={field} onChange={(event) => update(exam.key, "professionalCouncil", event.target.value)}/></label>
      <label className="grid gap-1">Atuação profissional do exame<select value={exam.professionalDiscipline} className={field} onChange={(event) => update(exam.key, "professionalDiscipline", event.target.value)}><option value="MEDICINE">Medicina</option>{exam.kind === "COMPLEMENTAR" && <><option value="NURSING">Enfermagem</option><option value="PSYCHOLOGY">Psicologia</option></>}</select></label>
      <label className="grid gap-1">Data de realização<input type="date" value={exam.performedAt} required className={field} onChange={(event) => update(exam.key, "performedAt", event.target.value)}/></label>
      <label className="grid gap-1">Validade<input type="date" value={exam.validUntil} required className={field} onChange={(event) => update(exam.key, "validUntil", event.target.value)}/></label>
      <label className="grid gap-1">Laboratório (pessoa jurídica)<select value={exam.laboratoryCompanyId} required={exam.kind === "TOXICOLOGICO"} className={field} onChange={(event) => update(exam.key, "laboratoryCompanyId", event.target.value)}><option value="">Não informado</option>{laboratories.map((lab) => <option key={lab.id} value={lab.id}>{lab.corporateName}</option>)}</select></label>
      <label className="grid gap-1">Número do laudo<input value={exam.reportNumber} required={exam.kind === "TOXICOLOGICO"} maxLength={100} className={field} onChange={(event) => update(exam.key, "reportNumber", event.target.value)}/></label>
      <label className="grid gap-1">Resultado<textarea value={exam.result} required minLength={2} maxLength={10000} rows={2} className={field} onChange={(event) => update(exam.key, "result", event.target.value)}/></label>
      <button type="button" disabled={exams.length <= 1} className="w-fit rounded border px-3 py-1 disabled:opacity-50" onClick={() => setExams((current) => current.filter((item) => item.key !== exam.key))}>Remover exame</button>
    </fieldset>)}
    <button type="button" disabled={exams.length >= 100} className="w-fit rounded border p-2 disabled:opacity-50" onClick={() => setExams((current) => [...current, emptyExam(Math.max(...current.map((exam) => exam.key), -1) + 1)])}>Adicionar outro exame</button>
  </SstForm>;
}
