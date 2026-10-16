import { createHash } from "node:crypto";
import { AccessError, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { assertSstClinicalAccess } from "./access";
import { questionnaireInput, questionnaireQuestions, anamnesisInput, validateQuestionnaireAnswers } from "./questionnaire-policy";
import { asoSnapshot } from "./aso-policy";
import { SstValidationError } from "./errors";
import { assertDisciplineAccess } from "./clinical-access";

function assertCreate(context: AppContext) {
  if (!canPerformModuleOperation(context.user, "SST", "create")) throw new AccessError("O perfil não permite incluir registros ocupacionais.", 403);
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function registerQuestionnaireVersion(context: AppContext, raw: unknown) {
  assertCreate(context);
  const input = questionnaireInput.parse(raw);
  await assertSstClinicalAccess(context, input.budgetUnitId, true);
  if (input.discipline !== "MEDICINE") await assertDisciplineAccess(context, input.budgetUnitId, input.discipline, true);
  const requestHash = hash(input);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_QUESTIONNAIRE_SUBMIT:${input.budgetUnitId}:${input.submissionKey}`}))`;
    const existing = await tx.sstQuestionnaireVersion.findUnique({ where: { budgetUnitId_submissionKey: { budgetUnitId: input.budgetUnitId, submissionKey: input.submissionKey } } });
    if (existing) {
      if (existing.createdById !== context.user.id || existing.requestHash !== requestHash) throw new SstValidationError("Esta submissão já foi utilizada com outros dados. Abra um novo formulário.");
      return existing.id;
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_QUESTIONNAIRE_CODE:${input.budgetUnitId}:${input.code}`}))`;
    const previous = await tx.sstQuestionnaireVersion.findFirst({ where: { budgetUnitId: input.budgetUnitId, code: input.code }, orderBy: { version: "desc" }, select: { version: true } });
    const record = await tx.sstQuestionnaireVersion.create({ data: { ...input, version: (previous?.version || 0) + 1, requestHash, createdById: context.user.id } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_QUESTIONNAIRE_VERSION", targetId: record.id });
    return record.id;
  });
}

export async function registerAnamnesis(context: AppContext, raw: unknown) {
  assertCreate(context);
  const input = anamnesisInput.parse(raw);
  const scope = await context.prisma.sstAso.findUnique({ where: { id: input.asoId }, select: { budgetUnitId: true } });
  if (!scope) throw new SstValidationError("ASO não encontrado.");
  await assertSstClinicalAccess(context, scope.budgetUnitId, true);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_ANAMNESIS:${input.asoId}`}))`;
    const questionnaire = await tx.sstQuestionnaireVersion.findUnique({ where: { id: input.questionnaireVersionId } });
    if (!questionnaire || questionnaire.budgetUnitId !== scope.budgetUnitId) throw new SstValidationError("O questionário não pertence à UG do ASO.");
    if (questionnaire.discipline && questionnaire.discipline !== "MEDICINE") throw new SstValidationError("Anamnese de ASO exige questionário de Medicina.");
    const questions = questionnaireQuestions.parse(questionnaire.questions);
    const answers = validateQuestionnaireAnswers(questions, input.answers);
    const requestHash = hash({ ...input, answers });
    const existing = await tx.sstAnamnesis.findUnique({ where: { asoId_submissionKey: { asoId: input.asoId, submissionKey: input.submissionKey } } });
    if (existing) {
      if (existing.createdById !== context.user.id || existing.requestHash !== requestHash) throw new SstValidationError("Esta submissão já foi utilizada com outros dados. Abra um novo formulário.");
      return existing.id;
    }
    const previous = await tx.sstAnamnesis.findFirst({ where: { asoId: input.asoId }, orderBy: { revision: "desc" }, select: { revision: true } });
    if (previous && input.revisionReason.length < 10) throw new SstValidationError("Justifique a nova revisão da anamnese (mínimo 10 caracteres).");
    const aso = await tx.sstAso.findUniqueOrThrow({ where: { id: input.asoId }, select: { snapshot: true, examinerCouncil: true } });
    const subject = asoSnapshot.parse(aso.snapshot);
    const record = await tx.sstAnamnesis.create({ data: {
      asoId: input.asoId, questionnaireVersionId: questionnaire.id, revision: (previous?.revision || 0) + 1,
      answers, revisionReason: input.revisionReason, submissionKey: input.submissionKey, requestHash, createdById: context.user.id,
      snapshot: { title: questionnaire.title, code: questionnaire.code, version: questionnaire.version, questions, personName: subject.personName, examinerName: subject.examinerName, examinerCouncil: aso.examinerCouncil, recordedByName: context.user.name },
    } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ANAMNESIS", targetId: record.id });
    return record.id;
  });
}
