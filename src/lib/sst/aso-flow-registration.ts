import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertAsoProfessional } from "./aso-flow-policy";
import { questionnaireQuestions, validateQuestionnaireAnswers } from "./questionnaire-policy";
import { SstValidationError } from "./errors";
import type { asoInput } from "./aso-policy";

type AsoFunctionalSource = {
  id: string;
  governmentEntityId: string;
  contractReference: string;
  employmentRegimeId: string;
  localId: string;
  costCenterId: string;
  startsAt: Date;
  endsAt: Date;
  sourceReference: string;
  roleId: string;
  departmentId: string;
  snapshot: unknown;
};

export async function prepareAsoFlow(tx: Prisma.TransactionClient, input: z.infer<typeof asoInput>, employeeId: string | undefined) {
  const personIds = [input.examinerPersonId, ...input.exams.map((e) => e.professionalPersonId)];
  await tx.$queryRaw`SELECT id FROM "SstProfessionalRole" WHERE "budgetUnitId"=${input.budgetUnitId} AND "personId"=ANY(${personIds}::text[]) ORDER BY id FOR SHARE`;
  const roles = await tx.sstProfessionalRole.findMany({ where: { budgetUnitId: input.budgetUnitId, isActive: true, personId: { in: personIds } } });
  const physician = roles.find((r) => r.personId === input.examinerPersonId && r.discipline === "MEDICINE" && r.council === input.examinerCouncil && r.startsAt <= input.performedAt && r.endsAt >= input.performedAt);
  assertAsoProfessional(physician, { budgetUnitId: input.budgetUnitId, personId: input.examinerPersonId, discipline: "MEDICINE", council: input.examinerCouncil, performedAt: input.performedAt });
  for (const exam of input.exams) {
    const role = roles.find((r) => r.personId === exam.professionalPersonId && r.discipline === exam.professionalDiscipline && r.council === exam.professionalCouncil && r.startsAt <= exam.performedAt && r.endsAt >= exam.performedAt);
    assertAsoProfessional(role, { budgetUnitId: input.budgetUnitId, personId: exam.professionalPersonId, discipline: exam.professionalDiscipline, council: exam.professionalCouncil, performedAt: exam.performedAt });
  }
  const questionnaire = await tx.sstQuestionnaireVersion.findUnique({ where: { id: input.anamnesis.questionnaireVersionId } });
  if (!questionnaire || questionnaire.budgetUnitId !== input.budgetUnitId || questionnaire.discipline !== "MEDICINE") throw new SstValidationError("Selecione uma versão de anamnese de Medicina da mesma UG antes da emissão.");
  const questions = questionnaireQuestions.parse(questionnaire.questions);
  const answers = validateQuestionnaireAnswers(questions, input.anamnesis.answers);
  if (!employeeId && input.functionalPeriodId) throw new SstValidationError("Candidato sem servidor não pode indicar vínculo funcional.");
  const periods = employeeId
    ? await tx.$queryRaw<AsoFunctionalSource[]>`SELECT p.id,p."governmentEntityId",p."contractReference",p."employmentRegimeId",p."localId",p."costCenterId",p."startsAt",p."endsAt",p."sourceReference",p."roleId",p."departmentId",p.snapshot FROM "HrEmployeeFunctionalPeriod" p WHERE p.id=${input.functionalPeriodId} AND p."employeeId"=${employeeId} AND p."budgetUnitId"=${input.budgetUnitId} AND ((p."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date<=${input.performedAt}::date AND ((p."endsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date>${input.performedAt}::date AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id)`
    : [];
  const functional: AsoFunctionalSource | null = periods[0] ?? null;
  if (employeeId && !functional) throw new SstValidationError("Selecione o vínculo funcional histórico explícito de RH da mesma UG/entidade, vigente na data do ASO.");
  return { physicianRoleId: physician!.id, questionnaire, questions, answers, functional, professionalRoles: roles.map(({ id, personId, discipline, council, startsAt, endsAt }) => ({ id, personId, discipline, council, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })) };
}
