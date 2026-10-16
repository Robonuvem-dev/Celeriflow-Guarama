import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { enqueueHrIntegration } from "./workforce-service";
import { AccessError, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { applyRecertificationDetails, captureRecertificationDetails, emptyRecertificationDetails, recertificationDetailsSchema, recertificationSections, validateRecertificationSections } from "./recertification-details";

const fields = ["email", "emailSecondary", "phonePrimary", "phoneSecondary", "whatsapp", "maritalStatus", "profession", "educationLevel", "socialName", "rg", "rgIssuer", "motherName", "fatherName", "nationality", "birthPlace", "gender", "raceColor"] as const;
export const recertificationCampaignSchema = z.object({
  origin: z.literal("CAMPANHA_RECADASTRAMENTO"), startsAt: z.string().datetime(), endsAt: z.string().datetime(),
  employeeIds: z.array(z.string().min(1)).min(1), fields: z.array(z.enum(fields)), instructions: z.string().max(4000),
  sections: z.array(z.enum(recertificationSections)).default([]), requireEvidence: z.boolean().default(false),
  evidenceDocumentClassCode: z.string().min(1).optional(),
  budgetUnitId: z.string().min(1).optional(),
}).strict().refine(value => new Date(value.endsAt) >= new Date(value.startsAt) && (value.fields.length > 0 || value.sections.length > 0) && new Set(value.fields).size === value.fields.length, "Período ou campos/seções de campanha inválidos.");

const proposalSchema = z.partialRecord(z.enum(fields), z.string().trim().max(250));
type ContactValues = Partial<Record<typeof fields[number], string | null>>;

export async function listMyRecertificationCampaigns(db: PrismaClient, employeeId: string) {
  const now = new Date();
  const rules = await db.hrPayrollRule.findMany({ where: { category: "PORTAL", valueType: "JSON", isActive: true, ruleSet: { status: "ATIVA", effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
  const campaigns = rules.flatMap(rule => {
    const parsed = recertificationCampaignSchema.safeParse(rule.value);
    if (!parsed.success || !parsed.data.employeeIds.includes(employeeId)) return [];
    return [{ id: rule.id, name: rule.name, ...parsed.data }];
  });
  const requests = await db.hrPortalRequest.findMany({ where: { employeeId, kind: "RECADASTRAMENTO" }, orderBy: { createdAt: "desc" } });
  return campaigns.map(campaign => ({ ...campaign, request: requests.find(request => (request.payload as { campaignRuleId?: string }).campaignRuleId === campaign.id) || null }));
}

export async function assertRecertificationReviewScope(context: AppContext, requestId: string) {
  if (!canPerformModuleOperation(context.user, "RH", "update")) throw new AccessError("Sem autorização para analisar recadastramento.", 403);
  const request = await context.prisma.hrPortalRequest.findFirst({ where: { id: requestId, kind: "RECADASTRAMENTO" } });
  if (!request) throw new AccessError("Proposta indisponível.", 404);
  if (isSystemAdministrator(context.user)) return request;
  const employee = await context.prisma.employee.findUnique({ where: { id: request.employeeId }, select: { secretariatId: true } });
  if (!employee?.secretariatId || !await context.prisma.budgetUnit.findFirst({ where: { id: { in: context.user.allowedBudgetUnitIds }, secretariatId: employee.secretariatId }, select: { id: true } })) throw new AccessError("Proposta fora das unidades autorizadas.", 403);
  return request;
}

export async function requestRecertificationCorrection(context: AppContext, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), instructions: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  await assertRecertificationReviewScope(context, input.requestId);
  return context.prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    if (request.status !== "EM_ANALISE") throw new Error("Proposta não está disponível para correção.");
    const now = new Date();
    const event = await enqueueHrIntegration(tx, { sourceKey: `RECADASTRAMENTO:PENDENCIA:${request.id}:${now.toISOString()}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "RECADASTRAMENTO_CORRECAO_SOLICITADA", payload: { requestId: request.id, employeeId: request.employeeId, instructions: input.instructions, actorId: context.user.id, payload: request.payload } });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    return tx.hrPortalRequest.update({ where: { id: request.id }, data: { status: "PENDENTE_CORRECAO", decision: input.instructions, decidedBy: context.user.id, decidedAt: now } });
  });
}

export async function listRecertificationProgress(db: PrismaClient, scope?: { employeeIds: string[]; budgetUnitIds: string[] }) {
  const rules = await db.hrPayrollRule.findMany({ where: { category: "PORTAL", valueType: "JSON" }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  const campaigns = rules.flatMap(rule => {
    const parsed = recertificationCampaignSchema.safeParse(rule.value);
    if (!parsed.success || scope && parsed.data.budgetUnitId && !scope.budgetUnitIds.includes(parsed.data.budgetUnitId)) return [];
    const employeeIds = scope ? parsed.data.employeeIds.filter(id => scope.employeeIds.includes(id)) : parsed.data.employeeIds;
    return employeeIds.length ? [{ id: rule.id, name: rule.name, active: rule.isActive, ...parsed.data, employeeIds }] : [];
  });
  const employeeIds = [...new Set(campaigns.flatMap(campaign => campaign.employeeIds))];
  const employees = await db.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, name: true, isActive: true } });
  const requests = await db.hrPortalRequest.findMany({ where: { kind: "RECADASTRAMENTO", employeeId: { in: employeeIds } }, orderBy: { createdAt: "desc" } });
  return campaigns.map(campaign => ({ ...campaign, recipients: [...new Set(campaign.employeeIds)].map(employeeId => {
    const employee = employees.find(employee => employee.id === employeeId);
    const request = requests.find(request => request.employeeId === employeeId && (request.payload as { campaignRuleId?: string }).campaignRuleId === campaign.id);
    return { employeeId, name: employee?.name || "Cadastro não encontrado", employeeActive: employee?.isActive || false, status: request?.status || "PENDENTE", requestId: request?.id || null };
  }) }));
}

export async function submitRecertificationProposal(db: PrismaClient, actorId: string, employeeId: string, raw: unknown) {
  const input = z.object({ campaignRuleId: z.string().min(1), proposal: proposalSchema, details: recertificationDetailsSchema.optional() }).strict().parse(raw);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:recertification:${input.campaignRuleId}:${employeeId}`}))`;
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.campaignRuleId }, include: { ruleSet: true } });
    const campaign = recertificationCampaignSchema.parse(rule.value); const now = new Date();
    if (!rule.isActive || rule.category !== "PORTAL" || rule.ruleSet.status !== "ATIVA" || now < rule.ruleSet.effectiveFrom || rule.ruleSet.effectiveUntil && now > rule.ruleSet.effectiveUntil || !campaign.employeeIds.includes(employeeId) || now < new Date(campaign.startsAt) || now > new Date(campaign.endsAt)) throw new Error("Campanha fora da vigência ou do público autorizado.");
    for (const name of Object.keys(input.proposal)) if (!campaign.fields.includes(name as typeof fields[number])) throw new Error("Campo não habilitado para esta campanha.");
    if (Object.keys(input.proposal).length !== campaign.fields.length || campaign.fields.some(field => !(field in input.proposal))) throw new Error("Preencha todos os campos habilitados na campanha.");
    if (input.proposal.email && !z.email().safeParse(input.proposal.email).success) throw new Error("E-mail inválido.");
    if (input.proposal.emailSecondary && !z.email().safeParse(input.proposal.emailSecondary).success) throw new Error("E-mail secundário inválido.");
    const employee = await tx.employee.findUniqueOrThrow({ where: { id: employeeId }, include: { person: true } });
    if (!employee.isActive || !employee.person || employee.person.status !== "Ativo") throw new Error("Servidor sem pessoa física ativa.");
    const details = input.details || emptyRecertificationDetails();
    validateRecertificationSections(details, campaign.sections);
    if (campaign.requireEvidence && !details.documentVersionIds.length) throw new Error("Anexe a comprovação documental exigida pela campanha.");
    const requestKey = `RECADASTRAMENTO:${rule.id}:${employeeId}`;
    const previous = await tx.hrPortalRequest.findUnique({ where: { requestKey } });
    if (previous) {
      const proposal = (previous.payload as { proposal: ContactValues }).proposal;
      const same = !campaign.fields.some(field => proposal[field] !== input.proposal[field]) && JSON.stringify((previous.payload as { details?: unknown }).details || emptyRecertificationDetails()) === JSON.stringify(details);
      if (previous.status !== "PENDENTE_CORRECAO") {
        if (!same) throw new Error("Campanha já respondida; a proposta anterior foi preservada.");
        return previous;
      }
      const event = await enqueueHrIntegration(tx, { sourceKey: `RECADASTRAMENTO:REVISAO:${previous.id}:${previous.decidedAt?.toISOString()}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "RECADASTRAMENTO_REVISAO_PRESERVADA", payload: { requestId: previous.id, previousPayload: previous.payload, instructions: previous.decision, actorId } });
      await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    }
    const before: ContactValues = {};
    for (const field of campaign.fields) before[field] = employee.person[field];
    const beforeDetails = await captureRecertificationDetails(tx, employee.id, employee.person.id, details);
    const payload = { description: `Recadastramento: ${rule.name}`, campaignRuleId: rule.id, campaign, personId: employee.person.id, before, proposal: input.proposal, details, beforeDetails };
    return previous ? tx.hrPortalRequest.update({ where: { id: previous.id }, data: { payload, status: "EM_ANALISE", decision: null, decidedAt: null, decidedBy: null } }) : tx.hrPortalRequest.create({ data: { employeeId, requestKey, kind: "RECADASTRAMENTO", actorId, payload } });
  });
}

export async function decideRecertificationProposal(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), status: z.enum(["DEFERIDA", "INDEFERIDA"]), decision: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`;
    const request = await tx.hrPortalRequest.findUniqueOrThrow({ where: { id: input.requestId } });
    if (request.kind !== "RECADASTRAMENTO") throw new Error("Solicitação não é de recadastramento.");
    if (request.status !== "EM_ANALISE") {
      if (request.status === input.status && request.decision === input.decision) return request;
      throw new Error("Solicitação já decidida; a decisão foi preservada.");
    }
    const payload = z.object({ personId: z.string(), before: z.record(z.string(), z.string().nullable()), proposal: proposalSchema, campaign: recertificationCampaignSchema, details: recertificationDetailsSchema.optional(), beforeDetails: z.unknown().optional() }).parse(request.payload);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${request.employeeId}`}))`;
    const employee = await tx.employee.findUniqueOrThrow({ where: { id: request.employeeId } });
    if (employee.personId !== payload.personId || !employee.isActive) throw new Error("Titularidade funcional mudou após o pedido. Revise a proposta.");
    await tx.$queryRaw`SELECT id FROM "Person" WHERE id=${payload.personId} FOR UPDATE`;
    const person = await tx.person.findUniqueOrThrow({ where: { id: payload.personId } });
    if (person.status !== "Ativo") throw new Error("Pessoa física inativa.");
    const updates: ContactValues = {};
    let appliedDetails: Awaited<ReturnType<typeof applyRecertificationDetails>> | null = null;
    if (input.status === "DEFERIDA") {
      for (const field of payload.campaign.fields) {
        if (person[field] !== payload.before[field]) throw new Error("Cadastro central alterado após a proposta. Revise o conflito antes de deferir.");
        updates[field] = payload.proposal[field] || null;
      }
      const updated = await tx.person.update({ where: { id: person.id }, data: updates });
      await tx.employee.update({ where: { id: employee.id }, data: { email: updated.email, phone: updated.phonePrimary } });
      if (payload.details) appliedDetails = await applyRecertificationDetails(tx, employee.id, person.id, payload.details, payload.beforeDetails);
    }
    const decidedAt = new Date();
    const event = await enqueueHrIntegration(tx, { sourceKey: `RECADASTRAMENTO:DECISAO:${request.id}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "RECADASTRAMENTO_DECIDIDO", payload: { requestId: request.id, employeeId: request.employeeId, personId: person.id, actorId, before: payload.before, after: input.status === "DEFERIDA" ? updates : payload.before, beforeDetails: payload.beforeDetails || null, appliedDetails, status: input.status, decision: input.decision, decidedAt } });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    return tx.hrPortalRequest.update({ where: { id: request.id }, data: { status: input.status, decision: input.decision, decidedBy: actorId, decidedAt } });
  });
}
