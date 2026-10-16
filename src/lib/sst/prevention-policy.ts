import { z } from "zod";
import { questionnaireQuestions } from "./questionnaire-policy";

const id = z.string().trim().min(1).max(100);
const text = z.string().trim().min(2).max(10000);
const instant = z.iso.datetime({ offset: true }).transform(v => new Date(v).toISOString());
const people = z.array(id).min(1).max(100).refine(v => new Set(v).size === v.length, "Não repita responsáveis.");
export const exactCost = z.string().regex(/^\d{1,12}\.\d{2}$/, "Use valor decimal exato, por exemplo 125.50.");
const period = { startsAt: instant, endsAt: instant };
const activity = z.object({ title: text, actions: text, goals: text, location: text, strategy: text, ...period, responsiblePersonIds: people });
const attachment = z.object({ name: z.string().min(1).max(150), mime: z.enum(["application/pdf", "image/png", "image/jpeg"]), base64: z.string().max(2800000).regex(/^[A-Za-z0-9+/]+={0,2}$/) });
const attachments = z.array(attachment).max(5).default([]);
export const preventionKinds = { CIPA: "Mandato CIPA", PLAN: "Plano de trabalho CIPA", INSPECTION: "Inspeção", MEETING: "Reunião CIPA", SIPAT: "SIPAT", ELECTION: "Eleição CIPA", VISIT: "Visita técnica", BRIGADE: "Brigada", EXTINGUISHER: "Extintor", MAINTENANCE: "Recarga / teste hidrostático", ERGONOMICS: "Ergonomia", PCA: "Conservação auditiva", AUDIOMETRY: "Audiometria" } as const;
export const preventionKind = z.enum(Object.keys(preventionKinds) as [keyof typeof preventionKinds, ...Array<keyof typeof preventionKinds>]);
export const preventionPayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CIPA"), ...period, members: z.array(z.object({ employeeId: id, function: text, representation: z.enum(["EMPLOYER", "EMPLOYEE"]), alternate: z.boolean() })).min(1).max(100) }),
  z.object({ kind: z.literal("PLAN"), cipaId: id, activities: z.array(activity).min(1).max(100) }),
  z.object({ kind: z.literal("INSPECTION"), cipaId: id.optional(), at: instant, location: text, responsiblePersonId: id, formScope: z.literal("SST_OPERATIONAL_INSPECTION"), formTitle: text, questions: questionnaireQuestions, answers: z.record(z.string(), z.unknown()) }),
  z.object({ kind: z.literal("MEETING"), cipaId: id, at: instant, type: z.enum(["ORDINARY", "EXTRAORDINARY"]), location: text, agenda: text }),
  z.object({ kind: z.literal("SIPAT"), ...period, organizerPersonIds: people, activities: z.array(z.object({ title: text, location: text, at: instant, cost: exactCost, responsiblePersonIds: people })).min(1).max(100) }),
  z.object({ kind: z.literal("ELECTION"), cipaId: id, registrationStartsAt: instant, registrationEndsAt: instant, ...period, commissionEmployeeIds: people, minimumParticipation: z.number().min(0).max(100) }),
  z.object({ kind: z.literal("VISIT"), type: text, at: instant, location: text, responsiblePersonId: id, details: text }),
  z.object({ kind: z.literal("BRIGADE"), building: text, floors: z.array(text).min(1).max(100), memberEmployeeIds: people, trainings: z.array(z.object({ title: text, at: instant, instructorPersonId: id, participantEmployeeIds: people })).min(1).max(100), requiredExams: z.array(text).min(1).max(100), actionPlan: z.array(activity).min(1).max(100), meetings: z.array(z.object({ at: instant, agenda: text, minutes: text, participantEmployeeIds: people })).max(100) }),
  z.object({ kind: z.literal("EXTINGUISHER"), serial: text, type: text, location: text, installedAt: instant, validUntil: instant, responsiblePersonId: id, supplierId: id.optional(), assetId: id.optional() }),
  z.object({ kind: z.literal("MAINTENANCE"), extinguisherId: id, type: z.enum(["RECHARGE", "HYDROSTATIC_TEST"]), at: instant, validUntil: instant, supplierId: id, technicalResponsiblePersonId: id, certificateNumber: text }),
  z.object({ kind: z.literal("ERGONOMICS"), scope: z.enum(["COLLECTIVE", "INDIVIDUAL"]), clinical: z.boolean(), professionalRoleId: id.optional(), employeeId: id.optional(), responsiblePersonId: id, at: instant, location: text, machines: text, furniture: text, equipment: text, lighting: text, temperature: text, noise: text, recommendations: text, attachments }),
  z.object({ kind: z.literal("PCA"), ...period, responsiblePersonId: id, goals: text, noiseAssessment: text, controls: text, monitoring: text, activities: z.array(activity).min(1).max(100) }),
  z.object({ kind: z.literal("AUDIOMETRY"), pcaId: id, employeeId: id, professionalRoleId: id, at: instant, nextAt: instant, technique: text, conclusion: text, right: z.array(z.object({ hz: z.number().int().min(125).max(16000), db: z.number().min(-20).max(140) })).min(1).max(20), left: z.array(z.object({ hz: z.number().int().min(125).max(16000), db: z.number().min(-20).max(140) })).min(1).max(20), attachments }),
]).superRefine((v, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if ("startsAt" in v && v.startsAt >= v.endsAt) issue("O fim deve ser posterior ao início.");
  if (v.kind === "ELECTION" && !(v.registrationStartsAt < v.registrationEndsAt && v.registrationEndsAt <= v.startsAt)) issue("Inscrições devem encerrar antes da votação.");
  if (v.kind === "ERGONOMICS" && ((v.scope === "INDIVIDUAL") !== !!v.employeeId)) issue("Avaliação individual exige servidor; coletiva não aceita servidor.");
  if (v.kind === "ERGONOMICS" && v.clinical && !v.professionalRoleId) issue("Avaliação clínica exige autoria médica ocupacional.");
  if (v.kind === "CIPA" && new Set(v.members.map(m => m.employeeId)).size !== v.members.length) issue("Membro repetido.");
  if ("activities" in v) for (const a of v.activities) {
    if ("startsAt" in a && a.startsAt >= a.endsAt) issue("Período inválido na atividade.");
    if ("startsAt" in v && ("at" in a ? a.at < v.startsAt || a.at > v.endsAt : a.startsAt < v.startsAt || a.endsAt > v.endsAt)) issue("Atividade fora da vigência do programa.");
  }
  if (v.kind === "EXTINGUISHER" && v.validUntil <= v.installedAt) issue("Validade deve ser posterior à instalação.");
  if (v.kind === "MAINTENANCE" && v.validUntil <= v.at) issue("Validade deve ser posterior à manutenção.");
  if (v.kind === "AUDIOMETRY" && v.nextAt <= v.at) issue("Próximo exame deve ser posterior ao exame atual.");
});
export const preventionInput = z.object({ budgetUnitId: id, title: z.string().trim().min(2).max(200), submissionKey: z.uuid(), payload: preventionPayload });
export type PreventionPayload = z.infer<typeof preventionPayload>;
export const postponeInput = z.object({ id, at: instant, reason: text });
export const minutesInput = z.object({ id, minutes: text, presence: z.array(z.object({ employeeId: id, present: z.boolean() })).min(1).max(100) });
export const electionChoiceInput = z.object({ electionId: id, candidateId: id.nullable() });
export function participationPercent(turnout: number, eligible: number) { return eligible ? Math.round(turnout * 10000 / eligible) / 100 : null; }
