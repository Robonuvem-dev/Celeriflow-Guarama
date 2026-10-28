import { z } from "zod";
import { SstValidationError } from "./errors";

export const asoKinds = {
  ADMISSIONAL: "Admissional", PERIODICO: "Periódico", RETORNO_TRABALHO: "Retorno ao trabalho",
  MUDANCA_RISCOS: "Mudança de riscos", DEMISSIONAL: "Demissional",
  LICENCA_SEM_VENCIMENTOS: "Licença sem vencimentos", MONITORACAO: "Monitoração pontual",
} as const;
export const asoResults = {
  APTO: "Apto", INAPTO: "Inapto", APTO_RESTRICOES: "Apto com restrições",
  APTO_RECOMENDACOES: "Apto com recomendações", INAPTO_TEMPORARIO: "Inapto temporário",
} as const;

// Civil dates, not instants: reject rollover (e.g. 31 February) and retain the calendar day.
export const sstCivilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Informe uma data válida.").transform((value) => new Date(`${value}T00:00:00.000Z`));
const id = z.string().min(1).max(100);
export const asoExamInput = z.object({
  name: z.string().trim().min(2).max(200), kind: z.enum(["CLINICO", "COMPLEMENTAR", "TOXICOLOGICO"]),
  source: z.enum(["REALIZADO", "APRESENTADO"]), performedAt: sstCivilDate, validUntil: sstCivilDate,
  result: z.string().trim().min(2).max(10000), professionalPersonId: id,
  professionalCouncil: z.string().trim().min(2).max(100),
  professionalDiscipline: z.enum(["MEDICINE", "NURSING", "PSYCHOLOGY", "SOCIAL_WORK"]).default("MEDICINE"),
  laboratoryCompanyId: z.string().max(100).default(""), reportNumber: z.string().trim().max(100).default(""),
}).superRefine((exam, context) => {
  if (exam.validUntil < exam.performedAt) context.addIssue({ code: "custom", message: "A validade do exame não pode preceder sua realização." });
  if (exam.kind === "TOXICOLOGICO" && (!exam.laboratoryCompanyId || !exam.reportNumber)) context.addIssue({ code: "custom", message: "O toxicológico exige laboratório e número do laudo." });
  if (exam.kind === "CLINICO" && exam.professionalDiscipline !== "MEDICINE") context.addIssue({ code: "custom", message: "Exame clínico de ASO exige Medicina." });
  if (exam.professionalDiscipline === "SOCIAL_WORK" || (exam.kind === "TOXICOLOGICO" && exam.professionalDiscipline !== "MEDICINE")) context.addIssue({ code: "custom", message: "Atuação profissional incompatível com o tipo de exame ocupacional." });
});
export const asoInput = z.object({
  budgetUnitId: id, personId: id, programGroupId: id, examinerPersonId: id,
  examinerCouncil: z.string().trim().min(2).max(100),
  candidateReference: z.string().trim().max(200).default(""),
  functionalPeriodId: z.string().max(100).default(""),
  anamnesis: z.object({ questionnaireVersionId: id, answers: z.record(z.string(), z.unknown()) }),
  kind: z.enum(Object.keys(asoKinds) as [keyof typeof asoKinds, ...(keyof typeof asoKinds)[]]),
  result: z.enum(Object.keys(asoResults) as [keyof typeof asoResults, ...(keyof typeof asoResults)[]]),
  performedAt: sstCivilDate, validUntil: sstCivilDate,
  recommendations: z.string().trim().max(10000).default(""), submissionKey: z.uuid(),
  exams: z.array(asoExamInput).min(1, "Informe pelo menos o exame clínico.").max(100),
}).superRefine((input, context) => {
  if (input.validUntil < input.performedAt) context.addIssue({ code: "custom", message: "A validade do ASO não pode preceder sua realização." });
  if (["APTO_RESTRICOES", "APTO_RECOMENDACOES", "INAPTO_TEMPORARIO"].includes(input.result) && input.recommendations.length < 5) context.addIssue({ code: "custom", message: "Detalhe as restrições, recomendações ou a condição temporária." });
  if (!input.exams.some((exam) => exam.kind === "CLINICO")) context.addIssue({ code: "custom", message: "Registre o exame clínico antes de emitir o ASO." });
  if (input.exams.some((exam) => exam.kind === "CLINICO" && (exam.professionalPersonId !== input.examinerPersonId || exam.professionalCouncil !== input.examinerCouncil || exam.performedAt.getTime() !== input.performedAt.getTime()))) context.addIssue({ code: "custom", message: "O exame clínico deve corresponder ao médico, conselho e data de realização do ASO." });
  if (input.exams.some((exam) => exam.performedAt > input.performedAt || exam.validUntil < input.performedAt)) context.addIssue({ code: "custom", message: "Os exames devem estar realizados e válidos na data do ASO." });
});

export function asoOccasion(kind: keyof typeof asoKinds) {
  if (kind === "MUDANCA_RISCOS") return "MUDANCA_FUNCAO";
  if (kind === "LICENCA_SEM_VENCIMENTOS") return "MONITORACAO";
  return kind;
}

export const asoGroupSnapshot = z.object({
  code: z.string(), name: z.string(), departmentIds: z.array(z.string()).nullable().transform(value => value ?? []), roleIds: z.array(z.string()).nullable().transform(value => value ?? []),
  startsAt: z.string(), endsAt: z.string().nullable(),
});
function programCivilDay(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
export function assertAsoProgram(input: z.infer<typeof asoInput>, program: {
  budgetUnitId: string; kind: string; startsAt: Date; endsAt: Date;
}, group: z.infer<typeof asoGroupSnapshot>, prescribed: { name: string; occasion: string }[], employee: {
  isActive: boolean; secretariatId: string | null; departmentId: string | null; roleId: string | null;
} | null, secretariatId: string) {
  const day = input.performedAt.toISOString().slice(0, 10);
  if (program.budgetUnitId !== input.budgetUnitId || program.kind !== "PCMSO" || day < programCivilDay(program.startsAt) || day > programCivilDay(program.endsAt)) throw new SstValidationError("Selecione uma versão PCMSO vigente da mesma UG na data do ASO.");
  if (day < programCivilDay(new Date(group.startsAt)) || (group.endsAt && day > programCivilDay(new Date(group.endsAt)))) throw new SstValidationError("O GHE está fora da vigência na data do ASO.");
  if (!employee) {
    if (input.kind !== "ADMISSIONAL" || !input.candidateReference) throw new SstValidationError("Sem vínculo funcional, informe ASO admissional e a referência do concurso/processo seletivo.");
  } else {
    // Demissional must remain possible after the functional record is inactivated.
    if ((!employee.isActive && input.kind !== "DEMISSIONAL") || employee.secretariatId !== secretariatId) throw new SstValidationError("O vínculo funcional não é compatível com a UG ou está inativo.");
    if ((group.departmentIds.length && !group.departmentIds.includes(employee.departmentId || "")) || (group.roleIds.length && !group.roleIds.includes(employee.roleId || ""))) throw new SstValidationError("O servidor não atende aos critérios de local/cargo deste GHE.");
  }
  const normalize = (name: string) => name.trim().normalize("NFKC").toLocaleLowerCase("pt-BR");
  const provided = new Set(input.exams.map((exam) => normalize(exam.name)));
  if (prescribed.filter((exam) => exam.occasion === asoOccasion(input.kind)).some((exam) => !provided.has(normalize(exam.name)))) throw new SstValidationError("Registre todos os exames previstos pelo PCMSO para este tipo de ASO.");
}

export const asoSnapshot = z.object({
  personName: z.string(), cpf: z.string(), registration: z.string().nullable(),
  role: z.string().nullable(), department: z.string().nullable(), unitName: z.string(),
  examinerName: z.string(), programCode: z.string(), programVersion: z.number(),
  group: asoGroupSnapshot, prescribedExams: z.array(z.object({ name: z.string(), occasion: z.string() })),
  functional: z.object({ id: z.string(), governmentEntityId: z.string(), contractReference: z.string(), employmentRegimeId: z.string(), localId: z.string(), costCenterId: z.string(), startsAt: z.string(), endsAt: z.string() }).nullable().optional(),
});
export const asoExamSnapshot = z.object({ professionalName: z.string(), laboratoryName: z.string().nullable() });
export function formatSstCivilDate(value: Date) {
  return value.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
