import { z } from "zod";
import { sstCivilDate } from "./aso-policy";

export const clinicalDisciplines = { MEDICINE: "Medicina", NURSING: "Enfermagem", PSYCHOLOGY: "Psicologia", SOCIAL_WORK: "Assistência social" } as const;
export const disciplineInput = z.enum(["MEDICINE", "NURSING", "PSYCHOLOGY", "SOCIAL_WORK"]);
export type ClinicalDiscipline = z.infer<typeof disciplineInput>;
const id = z.string().min(1).max(100);
export const professionalInput = z.object({ budgetUnitId: id, personId: id, usuarioId: z.string().max(100).default(""), discipline: disciplineInput, council: z.string().trim().min(3).max(100), startsAt: sstCivilDate, endsAt: sstCivilDate }).refine((input) => input.endsAt >= input.startsAt, "Vigência profissional invertida.");
export const clinicalRequest = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("EXAM"), description: z.string().trim().min(2).max(1000), instructions: z.string().trim().max(2000).default("") }),
  z.object({ kind: z.literal("REFERRAL"), description: z.string().trim().min(2).max(1000), instructions: z.string().trim().max(2000).default("") }),
  z.object({ kind: z.literal("MEDICATION"), description: z.string().trim().min(2).max(1000), instructions: z.string().trim().min(3).max(2000), medicineId: id, quantity: z.number().int().positive().max(100000), days: z.number().int().positive().max(3650) }),
]);
export const clinicalRecordInput = z.object({
  budgetUnitId: id, personId: id, professionalRoleId: id, discipline: disciplineInput,
  attendedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  occupationalContext: z.string().trim().min(5).max(2000), narrative: z.string().trim().min(5).max(20000),
  opinion: z.string().trim().min(5).max(20000), diagnosis: z.string().trim().max(10000).default(""),
  cidCodes: z.array(z.string().trim().toUpperCase().regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,2})?$/)).max(30).default([]),
  requests: z.array(clinicalRequest).max(100).default([]), questionnaireVersionId: z.string().max(100).default(""),
  answers: z.record(z.string(), z.unknown()).default({}), submissionKey: z.uuid(),
}).superRefine((input, context) => {
  if (input.discipline !== "MEDICINE" && input.requests.some((request) => request.kind !== "REFERRAL")) context.addIssue({ code: "custom", message: "Prescrição e solicitação médica de exames exigem atuação em Medicina." });
  if (!input.questionnaireVersionId && Object.keys(input.answers).length) context.addIssue({ code: "custom", message: "Respostas exigem a versão do questionário utilizada." });
});
export const vaccinationInput = z.object({ budgetUnitId: id, personId: id, professionalRoleId: id, vaccineId: id, administeredAt: sstCivilDate, doseNumber: z.coerce.number().int().positive().max(100), lotNumber: z.string().trim().min(1).max(100), source: z.enum(["EXTERNAL_PROOF"]), occupationalContext: z.string().trim().min(5).max(2000), nextDoseAt: z.preprocess((value) => value === "" || value == null ? null : value, sstCivilDate.nullable()), submissionKey: z.uuid() }).refine((input) => !input.nextDoseAt || input.nextDoseAt > input.administeredAt, "A próxima dose deve ser posterior à registrada.");
export const clinicalSnapshot = z.object({ personName: z.string(), professionalName: z.string(), council: z.string(), unitName: z.string(), recordedByName: z.string() });
