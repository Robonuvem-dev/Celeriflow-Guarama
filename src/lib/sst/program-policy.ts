import { z } from "zod";

const text = z.string().trim().min(2).max(10000);
export const riskInput = z.object({
  description: text, danger: text, possibleDamage: text, propagation: text, controls: text, sources: text,
  exposureMinutes: z.coerce.number().int().min(0).max(1440),
  epiApplicable: z.boolean(), epis: z.array(z.string().trim().min(1).max(200)).max(100),
  probability: z.preprocess((value) => value === "" || value == null ? null : value, z.coerce.number().int().min(1).max(5).nullable()),
  severity: z.preprocess((value) => value === "" || value == null ? null : value, z.coerce.number().int().min(1).max(5).nullable()),
}).refine((value) => !value.epiApplicable || value.epis.length > 0, "Indique os equipamentos quando o EPI for aplicável.");
export const examOccasions = ["ADMISSIONAL", "PERIODICO", "MUDANCA_FUNCAO", "RETORNO_TRABALHO", "MONITORACAO", "DEMISSIONAL"] as const;
export const programGroupInput = z.object({
  groupId: z.string().min(1), conditions: z.string().trim().max(10000),
  risks: z.array(riskInput).max(100),
  exams: z.array(z.object({ name: z.string().trim().min(2).max(200), occasion: z.enum(examOccasions) })).max(300),
});
export const programInput = z.object({
  budgetUnitId: z.string().min(1), code: z.string().trim().toUpperCase().min(1).max(40).regex(/^[A-Z0-9_.-]+$/),
  kind: z.enum(["LTCAT", "PGR", "PCMSO"]), startsAt: z.coerce.date(), endsAt: z.coerce.date(),
  responsiblePersonId: z.string().min(1), responsibleCouncil: z.string().trim().min(2).max(100),
  content: z.object({ objectives: z.string().trim().max(10000).default(""), responsibilities: z.string().trim().max(10000).default(""), procedures: z.string().trim().max(10000).default(""), records: z.string().trim().max(10000).default(""), firstAid: z.string().trim().max(10000).default(""), campaigns: z.string().trim().max(10000).default("") }),
  groups: z.array(programGroupInput).min(1).max(200),
}).superRefine((input, context) => {
  if (input.endsAt < input.startsAt) context.addIssue({ code: "custom", path: ["endsAt"], message: "Vigência inválida." });
  if (new Set(input.groups.map((group) => group.groupId)).size !== input.groups.length) context.addIssue({ code: "custom", path: ["groups"], message: "O GHE não pode ser duplicado no programa." });
  if (input.kind === "PCMSO" && Object.values(input.content).some((value) => value.length < 2)) context.addIssue({ code: "custom", path: ["content"], message: "Preencha todos os detalhes gerais do PCMSO." });
  input.groups.forEach((group, index) => {
    if (input.kind !== "PCMSO" && (!group.risks.length || group.conditions.length < 2)) context.addIssue({ code: "custom", path: ["groups", index], message: "Informe condições ambientais e riscos para cada GHE." });
    if (input.kind === "PCMSO" && !group.exams.length) context.addIssue({ code: "custom", path: ["groups", index, "exams"], message: "Defina os exames previstos para cada GHE." });
    if (input.kind === "PGR" && group.risks.some((risk) => risk.probability === null || risk.severity === null)) context.addIssue({ code: "custom", path: ["groups", index, "risks"], message: "O PGR exige avaliação de probabilidade e severidade de cada risco." });
  });
});

export function occupationalRiskScore(probability: number, severity: number) {
  return probability * severity;
}
