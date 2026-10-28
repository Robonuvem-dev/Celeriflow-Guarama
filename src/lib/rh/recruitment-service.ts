import { createHash, randomUUID } from "node:crypto";
import type { DatabaseConnection } from "@/db/connection";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import type { RecruitmentApplication, RecruitmentApplicationPage, RecruitmentContext, PublicRecruitmentNotice } from "@/lib/contracts/personnel-recruitment";
import { countNoticeRecruitmentApplications, countRecruitmentApplications, findRecruitmentApplicationReplay, hasActiveRecruitmentApplicant, lockRecruitmentApplicationRow, nextRecruitmentApplicationNumber, readInstitutionalRecruitmentVersions, readOwnRecruitmentApplicationRows, readPublicRecruitmentRules, readRecruitmentReviewRows, recruitmentApplicationScope, requireRecruitmentRule, requireRecruitmentRuleSet, requireRecruitmentRuleWithSet } from "@/db/repositories/personnel-recruitment/reads";
import { createRecruitmentNoticeRule, insertRecruitmentApplication, lockRecruitment, updateRecruitmentApplicationDecision, updateRecruitmentNoticeRule } from "@/db/repositories/personnel-recruitment/writes";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";

export type { RecruitmentApplication } from "@/lib/contracts/personnel-recruitment";

function recruitmentConnection(context: RecruitmentContext, connection: DatabaseConnection): DatabaseConnection {
  if (context.database && context.database !== connection.db) throw new Error("A conexão de recrutamento deve corresponder ao banco do contexto.");
  return connection;
}

export const recruitmentNoticeSchema = z.object({
  origin: z.literal("EDITAL_RECRUTAMENTO"), kind: z.enum(["CONCURSO", "PSS"]), number: z.string().trim().min(1).max(100), budgetUnitId: z.string().min(1),
  documentVersionId: z.string().min(1), instructions: z.string().min(10).max(10000), startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
  roles: z.array(z.object({ code: z.string().regex(/^[A-Z0-9_]{1,64}$/), name: z.string().min(1).max(250), requirements: z.string().max(4000) }).strict()).min(1).max(200),
  acceptance: z.string().min(10).max(4000),
}).strict().refine(value => new Date(value.endsAt) >= new Date(value.startsAt) && new Set(value.roles.map(role => role.code)).size === value.roles.length, "Janela ou cargos do edital inválidos.");

const applicationInput = z.object({ noticeId: z.string().min(1), roleCode: z.string().min(1), cpf: z.string().transform(value => requireValidCpf(value)), fullName: z.string().trim().min(3).max(250), birthDate: z.iso.date(), phone: z.string().trim().min(8).max(50), accepted: z.literal(true) }).strict();

export async function listPublicRecruitmentNotices(db: DatabaseExecutor): Promise<PublicRecruitmentNotice[]> {
  const now = new Date();
  const rules = await readPublicRecruitmentRules(db, now);
  const notices = rules.flatMap(rule => { const parsed = recruitmentNoticeSchema.safeParse(rule.value); return parsed.success ? [{ id: rule.id, name: rule.name, policy: parsed.data }] : []; });
  const versions = await readInstitutionalRecruitmentVersions(db, notices.map(notice => notice.policy.documentVersionId));
  return notices.filter(notice => versions.some(version => version.id === notice.policy.documentVersionId));
}

export async function saveRecruitmentNotice(context: RecruitmentContext, raw: unknown, connection: DatabaseConnection = databaseConnection): Promise<string> {
  const input = z.object({ id: z.string().min(1).optional(), ruleSetId: z.string().min(1), code: z.string().regex(/^PORTAL_EDITAL_[A-Z0-9_]{1,45}$/), name: z.string().trim().min(3).max(160), isActive: z.boolean(), value: recruitmentNoticeSchema }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", input.id ? "update" : "create")) throw new AccessError("Sem autorização para publicar editais.", 403);
  assertBudgetUnitAccess(context.user, input.value.budgetUnitId);
  return withDatabaseTransaction(recruitmentConnection(context, connection), async tx => {
    await lockRecruitment(tx, `RH:EDITAL:${input.ruleSetId}:${input.code}`);
    const set = await requireRecruitmentRuleSet(tx, input.ruleSetId);
    if (set.status !== "ATIVA") throw new Error("Configuração RH ativa obrigatória.");
    if (!(await readInstitutionalRecruitmentVersions(tx, [input.value.documentVersionId])).length) throw new Error("Edital exige versão GED institucional válida, sem vinculação a pessoa física.");
    const previous = input.id ? await requireRecruitmentRule(tx, input.id) : null;
    if (previous) {
      await lockRecruitment(tx, `RH:INSCRICAO_EDITAL:${previous.id}`);
      const prior = recruitmentNoticeSchema.parse(previous.value);
      assertBudgetUnitAccess(context.user, prior.budgetUnitId);
      if (previous.ruleSetId !== input.ruleSetId || previous.code !== input.code || previous.category !== "PORTAL") throw new Error("Preserve a origem do edital.");
      const count = await countNoticeRecruitmentApplications(tx, previous.id);
      if (count && JSON.stringify(prior) !== JSON.stringify(input.value)) throw new Error("Edital com inscrições exige novo código para retificação, preservando os termos e inscrições anteriores.");
    }
    const data = { name: input.name, category: "PORTAL", valueType: "JSON", isActive: input.isActive, value: JSON.parse(JSON.stringify(input.value)) as JsonValue };
    const id = previous ? await updateRecruitmentNoticeRule(tx, previous.id, data) : await createRecruitmentNoticeRule(tx, { ...data, ruleSetId: input.ruleSetId, code: input.code });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "RECRUITMENT_NOTICE", targetId: id });
    return id;
  });
}

export async function submitRecruitmentApplication(context: RecruitmentContext, raw: unknown, connection: DatabaseConnection = databaseConnection): Promise<string> {
  const input = applicationInput.parse(raw);
  if (new Date(`${input.birthDate}T00:00:00Z`) > new Date()) throw new Error("Nascimento fora de ordem.");
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return withDatabaseTransaction(recruitmentConnection(context, connection), async tx => {
    await lockRecruitment(tx, `RH:INSCRICAO_EDITAL:${input.noticeId}`);
    const rule = await requireRecruitmentRuleWithSet(tx, input.noticeId);
    const policy = recruitmentNoticeSchema.parse(rule.value), now = new Date();
    const previous = await findRecruitmentApplicationReplay(tx, rule.id, input.cpf, context.user.id);
    if (previous) {
      if (previous.applicantUserId !== context.user.id || previous.requestHash !== hash) throw new Error("Já existe inscrição para a conta ou CPF neste edital. O registro anterior foi preservado.");
      return previous.id;
    }
    if (rule.category !== "PORTAL" || !rule.isActive || rule.ruleSet.status !== "ATIVA" || now < rule.ruleSet.effectiveFrom || rule.ruleSet.effectiveUntil && now > rule.ruleSet.effectiveUntil || now < new Date(policy.startsAt) || now > new Date(policy.endsAt) || !policy.roles.some(role => role.code === input.roleCode)) throw new Error("Edital, janela ou cargo indisponível para inscrição.");
    if (!await hasActiveRecruitmentApplicant(tx, context.user.id)) throw new AccessError("Conta indisponível.", 403);
    const number = await nextRecruitmentApplicationNumber(tx, rule.id);
    const id = randomUUID(), snapshot = { noticeName: rule.name, policy, ...input, email: context.user.email, acceptedAt: now.toISOString() };
    await insertRecruitmentApplication(tx, { id, noticeRuleId: rule.id, applicantUserId: context.user.id, cpf: input.cpf, roleCode: input.roleCode, number, snapshot, requestHash: hash });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.formSubmit, targetType: "RECRUITMENT_APPLICATION", targetId: id });
    return id;
  });
}

export async function readOwnRecruitmentApplications(context: RecruitmentContext): Promise<RecruitmentApplication[]> {
  return readOwnRecruitmentApplicationRows(context.database ?? db, context.user.id);
}

export async function listRecruitmentApplicationsForReview(context: RecruitmentContext, requestedPage = 1): Promise<RecruitmentApplicationPage> {
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para analisar inscrições.", 403);
  const executor = context.database ?? db;
  const scope = recruitmentApplicationScope(isSystemAdministrator(context.user), context.user.allowedBudgetUnitIds);
  const total = await countRecruitmentApplications(executor, scope);
  const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(total / 20)));
  const rows = await readRecruitmentReviewRows(executor, scope, (page - 1) * 20);
  return { rows, page, total };
}

export async function decideRecruitmentApplication(context: RecruitmentContext, raw: unknown, connection: DatabaseConnection = databaseConnection): Promise<string> {
  const input = z.object({ id: z.string().min(1), status: z.enum(["DEFERIDA", "INDEFERIDA"]), decision: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para analisar inscrições.", 403);
  return withDatabaseTransaction(recruitmentConnection(context, connection), async tx => {
    const application = await lockRecruitmentApplicationRow(tx, input.id);
    if (!application) throw new AccessError("Inscrição indisponível.", 404);
    const snapshot = z.object({ policy: recruitmentNoticeSchema }).parse(application.snapshot);
    assertBudgetUnitAccess(context.user, snapshot.policy.budgetUnitId);
    if (application.applicantUserId === context.user.id) throw new AccessError("O candidato não pode decidir a própria inscrição.", 403);
    if (application.status !== "RECEBIDA") {
      if (application.status === input.status && application.decision === input.decision) return application.id;
      throw new Error("Inscrição já decidida com outros dados.");
    }
    await updateRecruitmentApplicationDecision(tx, application.id, { status: input.status, decision: input.decision, decidedById: context.user.id });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "RECRUITMENT_APPLICATION_DECISION", targetId: application.id });
    return application.id;
  });
}
