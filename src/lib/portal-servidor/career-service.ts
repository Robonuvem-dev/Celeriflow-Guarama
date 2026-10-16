import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const coursePolicySchema = z.object({
  origin: z.literal("CAPACITACAO_FUNCIONAL"), budgetUnitId: z.string().min(1), employeeIds: z.array(z.string().min(1)),
  enrollmentStartsAt: z.iso.datetime({ offset: true }), enrollmentEndsAt: z.iso.datetime({ offset: true }),
  startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
  capacity: z.number().int().positive(), hours: z.number().positive(), minAttendancePercentage: z.number().min(0).max(100),
  location: z.string().trim().min(1).max(500), issuerName: z.string().trim().min(3).max(160), instructions: z.string().max(4000),
}).strict().refine(value => new Date(value.enrollmentEndsAt) >= new Date(value.enrollmentStartsAt) && new Date(value.startsAt) >= new Date(value.enrollmentEndsAt) && new Date(value.endsAt) >= new Date(value.startsAt), "Períodos do curso fora de ordem.");
export const evaluationPolicySchema = z.object({
  origin: z.literal("AVALIACAO_FUNCIONAL"), budgetUnitId: z.string().min(1), kind: z.enum(["DESEMPENHO", "ESTAGIO_PROBATORIO"]),
  employeeIds: z.array(z.string().min(1)).min(1), commissionUserIds: z.array(z.string().min(1)).min(1),
  startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
  instructions: z.string().max(4000), legalReference: z.string().trim().min(3).max(2000),
  questions: z.array(z.object({ code: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/), label: z.string().trim().min(1).max(500), min: z.number(), max: z.number(), weight: z.number().positive() }).strict().refine(value => value.max >= value.min, "Escala inválida.")).min(1).max(100),
}).strict().refine(value => new Date(value.endsAt) >= new Date(value.startsAt) && new Set(value.questions.map(question => question.code)).size === value.questions.length && new Set(value.commissionUserIds).size === value.commissionUserIds.length, "Período, critérios ou comissão inválidos.");

async function activeEmployee(context: AppContext) {
  const employee = await context.prisma.employee.findFirst({ where: { id: context.user.employeeId || "__SEM_VINCULO__", isActive: true }, select: { id: true, name: true } });
  if (!employee) throw new AccessError("Acesso funcional indisponível.", 403);
  return employee;
}

export async function listOwnCareerActivities(context: AppContext) {
  const employee = await activeEmployee(context), now = new Date();
  const rules = await context.prisma.hrPayrollRule.findMany({ where: { category: "PORTAL", valueType: "JSON", isActive: true, ruleSet: { status: "ATIVA", effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const courses = rules.flatMap(rule => { const policy = coursePolicySchema.safeParse(rule.value); return policy.success && (!policy.data.employeeIds.length || policy.data.employeeIds.includes(employee.id)) ? [{ id: rule.id, name: rule.name, policy: policy.data }] : []; });
  const evaluations = rules.flatMap(rule => { const policy = evaluationPolicySchema.safeParse(rule.value); return policy.success && (policy.data.employeeIds.includes(employee.id) || policy.data.commissionUserIds.includes(context.user.id)) ? [{ id: rule.id, name: rule.name, policy: policy.data }] : []; });
  const enrollments = await context.prisma.hrPortalRequest.findMany({ where: { employeeId: employee.id, kind: "CAPACITACAO_INSCRICAO" }, orderBy: { createdAt: "desc" } });
  const assignedCycles = evaluations.filter(cycle => cycle.policy.commissionUserIds.includes(context.user.id));
  const assessments = await context.prisma.hrPortalRequest.findMany({ where: { kind: "AVALIACAO_FUNCIONAL", OR: [{ employeeId: employee.id }, ...assignedCycles.map(cycle => ({ AND: [{ payload: { path: ["cycleId"], equals: cycle.id } }, { payload: { path: ["commissionUserIds"], array_contains: [context.user.id] } }] }))] }, orderBy: { createdAt: "desc" } });
  return { courses, evaluations, enrollments, assessments };
}

export async function enrollOwnCourse(context: AppContext, raw: unknown) {
  const input = z.object({ courseId: z.string().min(1) }).strict().parse(raw), employee = await activeEmployee(context);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL:CURSO:${input.courseId}`}))`;
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.courseId }, include: { ruleSet: true } });
    const policy = coursePolicySchema.parse(rule.value), now = new Date();
    if (!rule.isActive || rule.category !== "PORTAL" || rule.ruleSet.status !== "ATIVA" || now < rule.ruleSet.effectiveFrom || rule.ruleSet.effectiveUntil && now > rule.ruleSet.effectiveUntil || policy.employeeIds.length && !policy.employeeIds.includes(employee.id) || now < new Date(policy.enrollmentStartsAt) || now > new Date(policy.enrollmentEndsAt)) throw new Error("Inscrição fora da janela ou do público autorizado.");
    if (!await tx.employee.findFirst({ where: { id: employee.id, isActive: true } })) throw new Error("Cadastro funcional inativo.");
    const requestKey = `PORTAL:CURSO:${rule.id}:${employee.id}`;
    const previous = await tx.hrPortalRequest.findUnique({ where: { requestKey } });
    if (previous) return previous.id;
    const occupied = await tx.hrPortalRequest.count({ where: { kind: "CAPACITACAO_INSCRICAO", status: { in: ["INSCRITA", "CONCLUIDA"] }, payload: { path: ["courseId"], equals: rule.id } } });
    if (occupied >= policy.capacity) throw new Error("Não há vagas disponíveis neste curso.");
    const request = await tx.hrPortalRequest.create({ data: { requestKey, employeeId: employee.id, actorId: context.user.id, kind: "CAPACITACAO_INSCRICAO", status: "INSCRITA", payload: JSON.parse(JSON.stringify({ courseId: rule.id, courseName: rule.name, employeeName: employee.name, policy, description: `Inscrição: ${rule.name}` })) as Prisma.InputJsonValue } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.formSubmit, targetType: "EMPLOYEE_COURSE_ENROLLMENT", targetId: request.id });
    return request.id;
  });
}

export async function completeFunctionalCourse(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), attendancePercentage: z.number().min(0).max(100), approved: z.boolean(), evidenceReference: z.string().trim().min(5).max(2000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para reconhecer a conclusão do curso.", 403);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    if (request.kind !== "CAPACITACAO_INSCRICAO") throw new Error("Inscrição incompatível.");
    const payload = z.object({ courseId: z.string(), courseName: z.string(), employeeName: z.string(), policy: coursePolicySchema }).parse(request.payload);
    assertBudgetUnitAccess(context.user, payload.policy.budgetUnitId);
    const sourceKey = `PORTAL:CERTIFICADO:${request.id}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const stored = previous.payload as { evidenceReference: string; attendancePercentage: number; approved: boolean };
      if (stored.evidenceReference !== input.evidenceReference || stored.attendancePercentage !== input.attendancePercentage || stored.approved !== input.approved) throw new Error("Conclusão já registrada com outros dados.");
      return previous.id;
    }
    if (request.status !== "INSCRITA" || new Date() < new Date(payload.policy.endsAt)) throw new Error("Curso ainda não encerrado ou inscrição não disponível.");
    if (!input.approved || input.attendancePercentage < payload.policy.minAttendancePercentage) throw new Error("Participação não atende aos requisitos para emissão do certificado.");
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "PORTAL", environment: "INTERNO", eventType: "CERTIFICADO_CURSO_EMITIDO", payload: { ...payload, ...input, employeeId: request.employeeId, issuerId: context.user.id, certificateCode: randomUUID(), issuedAt: new Date().toISOString() } });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    await tx.hrPortalRequest.update({ where: { id: request.id }, data: { status: "CONCLUIDA", decision: input.evidenceReference, decidedBy: context.user.id, decidedAt: new Date() } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "EMPLOYEE_COURSE_CERTIFICATE", targetId: event.id });
    return event.id;
  });
}

export async function submitOwnFunctionalEvaluation(context: AppContext, raw: unknown) {
  const input = z.object({ cycleId: z.string().min(1), answers: z.record(z.string(), z.number()), comment: z.string().trim().max(4000) }).strict().parse(raw), employee = await activeEmployee(context);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL:AVALIACAO:${input.cycleId}:${employee.id}`}))`;
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.cycleId }, include: { ruleSet: true } }), policy = evaluationPolicySchema.parse(rule.value), now = new Date();
    if (!rule.isActive || rule.category !== "PORTAL" || rule.ruleSet.status !== "ATIVA" || now < rule.ruleSet.effectiveFrom || rule.ruleSet.effectiveUntil && now > rule.ruleSet.effectiveUntil || !policy.employeeIds.includes(employee.id) || now < new Date(policy.startsAt) || now > new Date(policy.endsAt)) throw new Error("Avaliação fora da janela ou do público autorizado.");
    if (!await tx.employee.findFirst({ where: { id: employee.id, isActive: true } })) throw new AccessError("Acesso funcional indisponível.", 403);
    validateAnswers(policy, input.answers);
    const requestKey = `PORTAL:AVALIACAO:${rule.id}:${employee.id}`, previous = await tx.hrPortalRequest.findUnique({ where: { requestKey } });
    if (previous) {
      const stored = previous.payload as { answers: Record<string, number>; comment: string };
      if (stored.comment !== input.comment || policy.questions.some(question => stored.answers[question.code] !== input.answers[question.code])) throw new Error("Autoavaliação já enviada; o histórico foi preservado.");
      return previous.id;
    }
    const request = await tx.hrPortalRequest.create({ data: { employeeId: employee.id, actorId: context.user.id, requestKey, kind: "AVALIACAO_FUNCIONAL", payload: JSON.parse(JSON.stringify({ cycleId: rule.id, cycleName: rule.name, employeeName: employee.name, policy, commissionUserIds: policy.commissionUserIds, answers: input.answers, comment: input.comment, description: `Autoavaliação: ${rule.name}` })) as Prisma.InputJsonValue } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.formSubmit, targetType: "EMPLOYEE_SELF_ASSESSMENT", targetId: request.id });
    return request.id;
  });
}

function validateAnswers(policy: z.infer<typeof evaluationPolicySchema>, answers: Record<string, number>) {
  if (Object.keys(answers).length !== policy.questions.length || Object.keys(answers).some(code => !policy.questions.some(question => question.code === code))) throw new Error("Responda somente e todos os critérios do instrumento.");
  for (const question of policy.questions) if (!Number.isFinite(answers[question.code]) || answers[question.code] < question.min || answers[question.code] > question.max) throw new Error(`Nota fora da escala: ${question.label}.`);
}

export async function submitCommissionEvaluation(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), answers: z.record(z.string(), z.number()), comment: z.string().trim().min(5).max(4000) }).strict().parse(raw);
  await activeEmployee(context);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    if (request.kind !== "AVALIACAO_FUNCIONAL") throw new AccessError("Avaliação indisponível.", 404);
    const payload = z.object({ cycleId: z.string(), policy: evaluationPolicySchema }).parse(request.payload), now = new Date();
    const cycle = await tx.hrPayrollRule.findUnique({ where: { id: payload.cycleId }, include: { ruleSet: true } });
    const currentPolicy = evaluationPolicySchema.safeParse(cycle?.value);
    if (!cycle?.isActive || cycle.category !== "PORTAL" || cycle.ruleSet.status !== "ATIVA" || now < cycle.ruleSet.effectiveFrom || cycle.ruleSet.effectiveUntil && now > cycle.ruleSet.effectiveUntil || !currentPolicy.success || !currentPolicy.data.commissionUserIds.includes(context.user.id)) throw new AccessError("Designação de comissão não está vigente.", 403);
    if (!await tx.employee.findFirst({ where: { id: context.user.employeeId || "__SEM_VINCULO__", isActive: true } })) throw new AccessError("Acesso funcional indisponível.", 403);
    if (!payload.policy.commissionUserIds.includes(context.user.id) || request.employeeId === context.user.employeeId) throw new AccessError("Avaliação não atribuída a este avaliador.", 403);
    if (now < new Date(payload.policy.startsAt) || now > new Date(payload.policy.endsAt)) throw new Error("Avaliação fora da janela configurada.");
    validateAnswers(payload.policy, input.answers);
    const sourceKey = `PORTAL:COMISSAO:${request.id}:${context.user.id}`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const stored = z.object({ answers: z.record(z.string(), z.number()), comment: z.string() }).parse(previous.payload);
      if (previous.status !== "PROCESSADO" || stored.comment !== input.comment || payload.policy.questions.some(question => stored.answers[question.code] !== input.answers[question.code])) throw new Error("Parecer já registrado com outros dados; o histórico foi preservado.");
      return previous.id;
    }
    if (request.status !== "EM_ANALISE") throw new Error("Avaliação encerrada para novos pareceres.");
    const score = payload.policy.questions.reduce((sum, question) => sum.add(new Prisma.Decimal(String(input.answers[question.code])).mul(String(question.weight))), new Prisma.Decimal(0)).div(payload.policy.questions.reduce((sum, question) => sum.add(String(question.weight)), new Prisma.Decimal(0))).toFixed(4);
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "PORTAL", environment: "INTERNO", eventType: "AVALIACAO_COMISSAO_REGISTRADA", payload: { ...input, employeeId: request.employeeId, actorId: context.user.id, score } });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    const completed = await tx.hrIntegrationEvent.count({ where: { domain: "PORTAL", eventType: "AVALIACAO_COMISSAO_REGISTRADA", payload: { path: ["requestId"], equals: request.id } } });
    if (completed === payload.policy.commissionUserIds.length) await tx.hrPortalRequest.update({ where: { id: request.id }, data: { status: "AVALIADA", decidedAt: now } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "EMPLOYEE_COMMISSION_ASSESSMENT", targetId: event.id });
    return event.id;
  });
}

export async function saveCareerPolicy(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().min(1).optional(), ruleSetId: z.string().min(1), code: z.string().regex(/^PORTAL_(CURSO|AVALIACAO)_[A-Z0-9_]{1,45}$/), name: z.string().trim().min(3).max(160), isActive: z.boolean(), value: z.unknown() }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", input.id ? "update" : "create")) throw new AccessError("Sem autorização para configurar capacitação e avaliações.", 403);
  const policy = input.code.startsWith("PORTAL_CURSO_") ? coursePolicySchema.parse(input.value) : evaluationPolicySchema.parse(input.value);
  assertBudgetUnitAccess(context.user, policy.budgetUnitId);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL:ATIVIDADE:${input.ruleSetId}:${input.code}`}))`;
    const ruleSet = await tx.hrPayrollRuleSet.findUniqueOrThrow({ where: { id: input.ruleSetId } });
    if (ruleSet.status !== "ATIVA") throw new Error("Configuração RH ativa obrigatória.");
    if (policy.employeeIds.length && await tx.employee.count({ where: { id: { in: policy.employeeIds }, isActive: true } }) !== new Set(policy.employeeIds).size) throw new Error("Público contém cadastros funcionais indisponíveis.");
    if ("commissionUserIds" in policy && await tx.usuario.count({ where: { id: { in: policy.commissionUserIds }, ativo: true } }) !== policy.commissionUserIds.length) throw new Error("Comissão contém usuários indisponíveis.");
    const previous = input.id ? await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.id } }) : null;
    if (previous) {
      const prior = input.code.startsWith("PORTAL_CURSO_") ? coursePolicySchema.parse(previous.value) : evaluationPolicySchema.parse(previous.value);
      assertBudgetUnitAccess(context.user, prior.budgetUnitId);
      if (previous.category !== "PORTAL" || previous.ruleSetId !== input.ruleSetId || previous.code !== input.code) throw new Error("Preserve a origem e o código da atividade.");
    }
    const data = { name: input.name, category: "PORTAL", valueType: "JSON", value: JSON.parse(JSON.stringify(policy)) as Prisma.InputJsonValue, isActive: input.isActive };
    const rule = previous ? await tx.hrPayrollRule.update({ where: { id: previous.id }, data }) : await tx.hrPayrollRule.create({ data: { ...data, ruleSetId: input.ruleSetId, code: input.code } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "EMPLOYEE_CAREER_ACTIVITY", targetId: rule.id });
    return rule.id;
  });
}
