import { createHash } from "node:crypto";
import { AccessError, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { and, desc, eq, sql } from "drizzle-orm";
import { sstQuestionnaires, sstAnamneses, sstAsos } from "@/db/schema/sst-clinical";
import { withDatabaseTransaction } from "@/db/transaction";
import type { DatabaseConnection } from "@/db/connection";
import { sstContextConnection, sstDatabase } from "./database";
import { assertSstClinicalAccess } from "./access";
import { questionnaireInput, questionnaireQuestions, anamnesisInput, validateQuestionnaireAnswers } from "./questionnaire-policy";
import { asoSnapshot } from "./aso-policy";
import { SstValidationError } from "./errors";
import { assertDisciplineAccess } from "./clinical-access";

function assertCreate(context: AppContext) {
  if (!canPerformModuleOperation(context.user, "SST", "create")) throw new AccessError("O perfil não permite incluir registros ocupacionais.", 403);
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function registerQuestionnaireVersion(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  assertCreate(context);
  const input = questionnaireInput.parse(raw);
  await assertSstClinicalAccess(context, input.budgetUnitId, true);
  if (input.discipline !== "MEDICINE") await assertDisciplineAccess(context, input.budgetUnitId, input.discipline, true);
  const requestHash = hash(input);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_QUESTIONNAIRE_SUBMIT:${input.budgetUnitId}:${input.submissionKey}`}))`);
    const [existing] = await tx.select().from(sstQuestionnaires).where(and(eq(sstQuestionnaires.budgetUnitId, input.budgetUnitId), eq(sstQuestionnaires.submissionKey, input.submissionKey)));
    if (existing) {
      if (existing.createdById !== context.user.id || existing.requestHash !== requestHash) throw new SstValidationError("Esta submissão já foi utilizada com outros dados. Abra um novo formulário.");
      return existing.id;
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_QUESTIONNAIRE_CODE:${input.budgetUnitId}:${input.code}`}))`);
    const [previous] = await tx.select({ version: sstQuestionnaires.version }).from(sstQuestionnaires).where(and(eq(sstQuestionnaires.budgetUnitId, input.budgetUnitId), eq(sstQuestionnaires.code, input.code))).orderBy(desc(sstQuestionnaires.version)).limit(1);
    const [record] = await tx.insert(sstQuestionnaires).values({ ...input, version: (previous?.version || 0) + 1, requestHash, createdById: context.user.id }).returning({ id: sstQuestionnaires.id });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_QUESTIONNAIRE_VERSION", targetId: record.id });
    return record.id;
  });
}

export async function registerAnamnesis(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  assertCreate(context);
  const input = anamnesisInput.parse(raw);
  const [scope] = await sstDatabase(context).select({ budgetUnitId: sstAsos.budgetUnitId }).from(sstAsos).where(eq(sstAsos.id, input.asoId));
  if (!scope) throw new SstValidationError("ASO não encontrado.");
  await assertSstClinicalAccess(context, scope.budgetUnitId, true);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_ANAMNESIS:${input.asoId}`}))`);
    const [questionnaire] = await tx.select().from(sstQuestionnaires).where(eq(sstQuestionnaires.id, input.questionnaireVersionId));
    if (!questionnaire || questionnaire.budgetUnitId !== scope.budgetUnitId) throw new SstValidationError("O questionário não pertence à UG do ASO.");
    if (questionnaire.discipline && questionnaire.discipline !== "MEDICINE") throw new SstValidationError("Anamnese de ASO exige questionário de Medicina.");
    const questions = questionnaireQuestions.parse(questionnaire.questions);
    const answers = validateQuestionnaireAnswers(questions, input.answers);
    const requestHash = hash({ ...input, answers });
    const [existing] = await tx.select().from(sstAnamneses).where(and(eq(sstAnamneses.asoId, input.asoId), eq(sstAnamneses.submissionKey, input.submissionKey)));
    if (existing) {
      if (existing.createdById !== context.user.id || existing.requestHash !== requestHash) throw new SstValidationError("Esta submissão já foi utilizada com outros dados. Abra um novo formulário.");
      return existing.id;
    }
    const [previous] = await tx.select({ revision: sstAnamneses.revision }).from(sstAnamneses).where(eq(sstAnamneses.asoId, input.asoId)).orderBy(desc(sstAnamneses.revision)).limit(1);
    if (previous && input.revisionReason.length < 10) throw new SstValidationError("Justifique a nova revisão da anamnese (mínimo 10 caracteres).");
    const [aso] = await tx.select({ snapshot: sstAsos.snapshot, examinerCouncil: sstAsos.examinerCouncil }).from(sstAsos).where(eq(sstAsos.id, input.asoId));
    if (!aso) throw new SstValidationError("ASO não encontrado.");
    const subject = asoSnapshot.parse(aso.snapshot);
    const [record] = await tx.insert(sstAnamneses).values({
      asoId: input.asoId, questionnaireVersionId: questionnaire.id, revision: (previous?.revision || 0) + 1,
      answers, revisionReason: input.revisionReason, submissionKey: input.submissionKey, requestHash, createdById: context.user.id,
      snapshot: { title: questionnaire.title, code: questionnaire.code, version: questionnaire.version, questions, personName: subject.personName, examinerName: subject.examinerName, examinerCouncil: aso.examinerCouncil, recordedByName: context.user.name },
    }).returning({ id: sstAnamneses.id });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_ANAMNESIS", targetId: record.id });
    return record.id;
  });
}
