import { z } from "zod";
import { SstValidationError } from "./errors";

const text = z.string().trim().min(1).max(10000);
const id = z.string().trim().min(1).max(100);
export const witnessesInput = z.array(z.object({ name: text, contact: z.string().max(300).default(""), statement: z.string().max(10000).default("") })).max(30);
export const accidentInput = z.object({
  submissionKey: z.uuid(), budgetUnitId: id, employeeId: id,
  occurredAt: z.coerce.date(), location: text, description: text,
  kind: z.enum(["TYPICAL", "COMMUTE", "DISEASE", "INCIDENT"]),
  agent: z.string().trim().max(10000).default(""), bodyParts: z.array(text).max(30).default([]), statement: z.string().trim().max(10000).default(""),
  causeAnalysis: z.string().trim().max(10000).default(""),
  witnesses: witnessesInput.default([]), generatingStatus: z.enum(["INITIAL", "REOPENING", "DEATH"]).default("INITIAL"),
}).refine(i => i.kind === "INCIDENT" ? i.causeAnalysis.length >= 10 : i.agent.length > 0 && i.bodyParts.length > 0 && i.statement.length > 0, "CAT exige agente, partes atingidas e depoimento; incidente exige análise das causas.");
export const investigationInput = z.object({
  age: z.number().int().min(0).max(120), education: text,
  bmi: z.number().positive().max(150), otherEmployment: z.string().max(3000),
  overtimeHours: z.number().min(0).max(744), climate: text,
  humidity: z.number().min(0).max(100), temperature: z.number().min(-80).max(80),
  causes: text, preventiveMeasures: text,
});
export const medicalAttendanceInput = z.object({ attendedAt: z.coerce.date(), professionalRoleId: id, injury: text,
  cidCodes: z.array(z.string().trim().toUpperCase().regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$/)).min(1).max(30),
  probableDiagnosis: text, observations: z.string().max(10000).default(""),
});
/** Money is accepted as a decimal string, never converted through IEEE-754. */
export function exactDecimal(value: unknown) {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,11})\.\d{2}$/.test(value) || value === "0.00") throw new SstValidationError("Informe valor positivo com duas casas decimais (ex.: 125.50).");
  return value;
}
export function assertHomologation(version: number, opinions: { version: number; kind: string; approved: boolean }[]) {
  if (!opinions.some(p => p.version === version && p.kind === "TECHNICAL" && p.approved) || !opinions.some(p => p.version === version && p.kind === "MEDICAL" && p.approved)) throw new SstValidationError("Homologação exige pareceres técnico e médico favoráveis da mesma revisão.");
}
export function assertRetry(existing: { requestHash: string; createdById: string }, hash: string, actor: string) {
  if (existing.requestHash !== hash || existing.createdById !== actor) throw new SstValidationError("Submissão já utilizada com outros dados ou por outro usuário.");
}
