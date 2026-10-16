import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

export const recruitmentNoticeSchema = z.object({
  origin: z.literal("EDITAL_RECRUTAMENTO"), kind: z.enum(["CONCURSO", "PSS"]), number: z.string().trim().min(1).max(100), budgetUnitId: z.string().min(1),
  documentVersionId: z.string().min(1), instructions: z.string().min(10).max(10000), startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
  roles: z.array(z.object({ code: z.string().regex(/^[A-Z0-9_]{1,64}$/), name: z.string().min(1).max(250), requirements: z.string().max(4000) }).strict()).min(1).max(200),
  acceptance: z.string().min(10).max(4000),
}).strict().refine(value => new Date(value.endsAt) >= new Date(value.startsAt) && new Set(value.roles.map(role => role.code)).size === value.roles.length, "Janela ou cargos do edital inválidos.");

export type RecruitmentApplication = { id: string; noticeRuleId: string; applicantUserId: string; cpf: string; roleCode: string; number: number; status: string; snapshot: Prisma.JsonValue; requestHash: string; decision: string | null; decidedById: string | null; createdAt: Date; decidedAt: Date | null };
const applicationInput = z.object({ noticeId: z.string().min(1), roleCode: z.string().min(1), cpf: z.string().transform(value => requireValidCpf(value)), fullName: z.string().trim().min(3).max(250), birthDate: z.iso.date(), phone: z.string().trim().min(8).max(50), accepted: z.literal(true) }).strict();

export async function listPublicRecruitmentNotices(db: PrismaClient) {
  const now = new Date();
  const rules = await db.hrPayrollRule.findMany({ where: { category: "PORTAL", valueType: "JSON", isActive: true, ruleSet: { status: "ATIVA", effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  const notices = rules.flatMap(rule => { const parsed = recruitmentNoticeSchema.safeParse(rule.value); return parsed.success ? [{ id: rule.id, name: rule.name, policy: parsed.data }] : []; });
  const versions = await db.documentVersion.findMany({ where: { id: { in: notices.map(notice => notice.policy.documentVersionId) }, status: { in: ["FINAL", "SIGNED"] }, document: { status: "Válido", personId: null } }, select: { id: true } });
  return notices.filter(notice => versions.some(version => version.id === notice.policy.documentVersionId));
}

export async function saveRecruitmentNotice(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().min(1).optional(), ruleSetId: z.string().min(1), code: z.string().regex(/^PORTAL_EDITAL_[A-Z0-9_]{1,45}$/), name: z.string().trim().min(3).max(160), isActive: z.boolean(), value: recruitmentNoticeSchema }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", input.id ? "update" : "create")) throw new AccessError("Sem autorização para publicar editais.", 403);
  assertBudgetUnitAccess(context.user, input.value.budgetUnitId);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:EDITAL:${input.ruleSetId}:${input.code}`}))`;
    const set = await tx.hrPayrollRuleSet.findUniqueOrThrow({ where: { id: input.ruleSetId } });
    if (set.status !== "ATIVA") throw new Error("Configuração RH ativa obrigatória.");
    if (!await tx.documentVersion.findFirst({ where: { id: input.value.documentVersionId, status: { in: ["FINAL", "SIGNED"] }, document: { status: "Válido", personId: null } }, select: { id: true } })) throw new Error("Edital exige versão GED institucional válida, sem vinculação a pessoa física.");
    const previous = input.id ? await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.id } }) : null;
    if (previous) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:INSCRICAO_EDITAL:${previous.id}`}))`;
      const prior = recruitmentNoticeSchema.parse(previous.value);
      assertBudgetUnitAccess(context.user, prior.budgetUnitId);
      if (previous.ruleSetId !== input.ruleSetId || previous.code !== input.code || previous.category !== "PORTAL") throw new Error("Preserve a origem do edital.");
      const [count] = await tx.$queryRaw<{ total: number }[]>`SELECT count(*)::int total FROM "HrRecruitmentApplication" WHERE "noticeRuleId"=${previous.id}`;
      if (count.total && JSON.stringify(prior) !== JSON.stringify(input.value)) throw new Error("Edital com inscrições exige novo código para retificação, preservando os termos e inscrições anteriores.");
    }
    const data = { name: input.name, category: "PORTAL", valueType: "JSON", isActive: input.isActive, value: JSON.parse(JSON.stringify(input.value)) as Prisma.InputJsonValue };
    const rule = previous ? await tx.hrPayrollRule.update({ where: { id: previous.id }, data }) : await tx.hrPayrollRule.create({ data: { ...data, ruleSetId: input.ruleSetId, code: input.code } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "RECRUITMENT_NOTICE", targetId: rule.id });
    return rule.id;
  });
}

export async function submitRecruitmentApplication(context: AppContext, raw: unknown) {
  const input = applicationInput.parse(raw);
  if (new Date(`${input.birthDate}T00:00:00Z`) > new Date()) throw new Error("Nascimento fora de ordem.");
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:INSCRICAO_EDITAL:${input.noticeId}`}))`;
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.noticeId }, include: { ruleSet: true } });
    const policy = recruitmentNoticeSchema.parse(rule.value), now = new Date();
    const [previous] = await tx.$queryRaw<RecruitmentApplication[]>`SELECT * FROM "HrRecruitmentApplication" WHERE "noticeRuleId"=${rule.id} AND (cpf=${input.cpf} OR "applicantUserId"=${context.user.id})`;
    if (previous) {
      if (previous.applicantUserId !== context.user.id || previous.requestHash !== hash) throw new Error("Já existe inscrição para a conta ou CPF neste edital. O registro anterior foi preservado.");
      return previous.id;
    }
    if (rule.category !== "PORTAL" || !rule.isActive || rule.ruleSet.status !== "ATIVA" || now < rule.ruleSet.effectiveFrom || rule.ruleSet.effectiveUntil && now > rule.ruleSet.effectiveUntil || now < new Date(policy.startsAt) || now > new Date(policy.endsAt) || !policy.roles.some(role => role.code === input.roleCode)) throw new Error("Edital, janela ou cargo indisponível para inscrição.");
    if (!await tx.usuario.findFirst({ where: { id: context.user.id, ativo: true, perfil: { ativo: true } }, select: { id: true } })) throw new AccessError("Conta indisponível.", 403);
    const [sequence] = await tx.$queryRaw<{ next: number }[]>`SELECT COALESCE(MAX(number),0)::int+1 AS next FROM "HrRecruitmentApplication" WHERE "noticeRuleId"=${rule.id}`;
    const id = randomUUID(), snapshot = { noticeName: rule.name, policy, ...input, email: context.user.email, acceptedAt: now.toISOString() };
    await tx.$executeRaw`INSERT INTO "HrRecruitmentApplication" (id,"noticeRuleId","applicantUserId",cpf,"roleCode",number,status,snapshot,"requestHash") VALUES (${id},${rule.id},${context.user.id},${input.cpf},${input.roleCode},${sequence.next},'RECEBIDA',${JSON.stringify(snapshot)}::jsonb,${hash})`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.formSubmit, targetType: "RECRUITMENT_APPLICATION", targetId: id });
    return id;
  });
}

export async function readOwnRecruitmentApplications(context: AppContext) {
  return context.prisma.$queryRaw<RecruitmentApplication[]>`SELECT * FROM "HrRecruitmentApplication" WHERE "applicantUserId"=${context.user.id} ORDER BY "createdAt" DESC,id`;
}

export async function listRecruitmentApplicationsForReview(context: AppContext, requestedPage = 1) {
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para analisar inscrições.", 403);
  const scope = isSystemAdministrator(context.user) ? Prisma.sql`true` : context.user.allowedBudgetUnitIds.length ? Prisma.sql`snapshot #>> '{policy,budgetUnitId}' IN (${Prisma.join(context.user.allowedBudgetUnitIds)})` : Prisma.sql`false`;
  const [count] = await context.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int total FROM "HrRecruitmentApplication" WHERE ${scope}`;
  const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(count.total / 20)));
  const rows = await context.prisma.$queryRaw<RecruitmentApplication[]>`SELECT * FROM "HrRecruitmentApplication" WHERE ${scope} ORDER BY "createdAt",id LIMIT 20 OFFSET ${(page - 1) * 20}`;
  return { rows, page, total: count.total };
}

export async function decideRecruitmentApplication(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().min(1), status: z.enum(["DEFERIDA", "INDEFERIDA"]), decision: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para analisar inscrições.", 403);
  return context.prisma.$transaction(async tx => {
    const [application] = await tx.$queryRaw<RecruitmentApplication[]>`SELECT * FROM "HrRecruitmentApplication" WHERE id=${input.id} FOR UPDATE`;
    if (!application) throw new AccessError("Inscrição indisponível.", 404);
    const snapshot = z.object({ policy: recruitmentNoticeSchema }).parse(application.snapshot);
    assertBudgetUnitAccess(context.user, snapshot.policy.budgetUnitId);
    if (application.applicantUserId === context.user.id) throw new AccessError("O candidato não pode decidir a própria inscrição.", 403);
    if (application.status !== "RECEBIDA") {
      if (application.status === input.status && application.decision === input.decision) return application.id;
      throw new Error("Inscrição já decidida com outros dados.");
    }
    await tx.$executeRaw`UPDATE "HrRecruitmentApplication" SET status=${input.status},decision=${input.decision},"decidedById"=${context.user.id},"decidedAt"=now() WHERE id=${application.id}`;
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "RECRUITMENT_APPLICATION_DECISION", targetId: application.id });
    return application.id;
  });
}
