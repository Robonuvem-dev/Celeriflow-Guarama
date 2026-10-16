import { z } from "zod";
import { sstCivilDate } from "./aso-policy";
import { SstValidationError } from "./errors";
import { disciplineInput } from "./clinical-policy";

export const questionKinds = {
  TEXT: "Texto", NUMBER: "Número", BOOLEAN: "Sim/não", SINGLE_CHOICE: "Escolha única",
  MULTIPLE_CHOICE: "Múltipla escolha", DATE: "Data",
} as const;
export const questionnaireQuestion = z.object({
  key: z.string().trim().min(1).max(40).regex(/^[a-z][a-z0-9_]*$/, "A chave deve começar com letra e usar letras minúsculas, números ou _.") ,
  label: z.string().trim().min(2).max(300), section: z.string().trim().max(150).default("Geral"),
  kind: z.enum(["TEXT", "NUMBER", "BOOLEAN", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "DATE"]),
  required: z.boolean(), choices: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
}).superRefine((question, context) => {
  const choiceType = question.kind === "SINGLE_CHOICE" || question.kind === "MULTIPLE_CHOICE";
  if (choiceType && question.choices.length < 2) context.addIssue({ code: "custom", message: "Escolhas precisam de pelo menos duas opções." });
  if (!choiceType && question.choices.length) context.addIssue({ code: "custom", message: "Opções são permitidas apenas em questões de escolha." });
  if (new Set(question.choices).size !== question.choices.length) context.addIssue({ code: "custom", message: "Não repita opções da mesma questão." });
});
export const questionnaireQuestions = z.array(questionnaireQuestion).min(1).max(100).refine((questions) => new Set(questions.map((question) => question.key)).size === questions.length, "As chaves das questões não podem se repetir.");
export const questionnaireInput = z.object({
  discipline: disciplineInput.default("MEDICINE"),
  budgetUnitId: z.string().min(1).max(100), code: z.string().trim().toUpperCase().min(1).max(40).regex(/^[A-Z0-9_.-]+$/),
  title: z.string().trim().min(2).max(200), questions: questionnaireQuestions, submissionKey: z.uuid(),
});
export const anamnesisInput = z.object({
  asoId: z.string().min(1).max(100), questionnaireVersionId: z.string().min(1).max(100),
  answers: z.record(z.string(), z.unknown()), revisionReason: z.string().trim().max(2000).default(""), submissionKey: z.uuid(),
});
export type Question = z.infer<typeof questionnaireQuestion>;
export type Answer = string | number | boolean | string[] | null;

export function validateQuestionnaireAnswers(questions: Question[], raw: Record<string, unknown>) {
  const keys = new Set(questions.map((question) => question.key));
  if (Object.keys(raw).some((key) => !keys.has(key))) throw new SstValidationError("Há respostas que não pertencem à versão do questionário.");
  const entries: [string, Answer][] = [];
  for (const question of questions) {
    const value = Object.hasOwn(raw, question.key) ? raw[question.key] : undefined;
    const empty = value == null || value === "" || (Array.isArray(value) && !value.length);
    if (empty) {
      if (question.required) throw new SstValidationError(`Responda: ${question.label}.`);
      entries.push([question.key, null]); continue;
    }
    let answer: Answer;
    switch (question.kind) {
      case "TEXT": answer = z.string().trim().min(1).max(10000).parse(value); break;
      case "NUMBER": answer = z.number().finite().min(-1e12).max(1e12).parse(value); break;
      case "BOOLEAN": answer = z.boolean().parse(value); break;
      case "DATE": answer = sstCivilDate.parse(value).toISOString().slice(0, 10); break;
      case "SINGLE_CHOICE": {
        answer = z.string().parse(value);
        if (!question.choices.includes(answer)) throw new SstValidationError(`Opção inválida: ${question.label}.`);
        break;
      }
      case "MULTIPLE_CHOICE": {
        answer = z.array(z.string()).max(50).parse(value);
        if (new Set(answer).size !== answer.length || answer.some((option) => !question.choices.includes(option))) throw new SstValidationError(`Opções inválidas: ${question.label}.`);
        answer = question.choices.filter((option) => (value as string[]).includes(option)); break;
      }
    }
    entries.push([question.key, answer]);
  }
  return Object.fromEntries(entries);
}

export function formatQuestionnaireAnswer(value: unknown) {
  if (value == null) return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}
