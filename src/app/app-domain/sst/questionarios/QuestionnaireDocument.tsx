import { formatQuestionnaireAnswer, type Question } from "@/lib/sst/questionnaire-policy";

export function QuestionnaireDocument({ questions, answers }: { questions: Question[]; answers?: Record<string, unknown> }) {
  return <div className="space-y-4">{questions.map((question, index) => <section className="break-inside-avoid space-y-2" key={question.key}><p className="text-sm font-semibold">{question.section || "Geral"}</p><h2 className="font-semibold">{index + 1}. {question.label}{question.required ? " *" : ""}</h2>{answers ? <p className="whitespace-pre-wrap break-words">{formatQuestionnaireAnswer(answers[question.key])}</p> : <><p className="text-sm">{question.kind === "BOOLEAN" ? "□ Sim   □ Não" : question.choices.map((choice) => `□ ${choice}`).join("   ")}</p><div className="min-h-10 border-b border-slate-400"/></>}</section>)}</div>;
}
