import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AccessError, type AppContext } from "@/lib/platform/tenant-context";
import { reserveConsignmentAgreementInTransaction, postConsignmentInstallment } from "./consignment-service";
import { enqueueHrIntegration } from "./workforce-service";

export const partnerDiscountPolicySchema = z.object({ origin: z.literal("DESCONTOS_CONVENENTES"), budgetUnitId: z.string().min(1), actorUserIds: z.array(z.string().min(1)).min(1), supplierId: z.string().min(1), contractIds: z.array(z.string().min(1)).min(1), sourceRunId: z.string().min(1), consignmentRuleId: z.string().min(1), rubricCode: z.string().min(1), payrollIds: z.array(z.string().min(1)), instructions: z.string().max(4000) }).strict();

export async function listOwnPartnerDiscountGrants(context: AppContext) {
  const now = new Date();
  const rules = await context.prisma.hrPayrollRule.findMany({ where: { category: "PORTAL", valueType: "JSON", isActive: true, ruleSet: { status: "ATIVA", effectiveFrom: { lte: now }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: now } }] } }, orderBy: { name: "asc" } });
  const grants = rules.flatMap(rule => { const policy = partnerDiscountPolicySchema.safeParse(rule.value); return policy.success && policy.data.actorUserIds.includes(context.user.id) ? [{ id: rule.id, name: rule.name, policy: policy.data }] : []; });
  const contracts = await context.prisma.hrEmploymentContract.findMany({ where: { id: { in: [...new Set(grants.flatMap(grant => grant.policy.contractIds))] }, employee: { isActive: true } }, select: { id: true, registration: true, employee: { select: { name: true, secretariatId: true } } } });
  const units = await context.prisma.budgetUnit.findMany({ where: { id: { in: [...new Set(grants.map(grant => grant.policy.budgetUnitId))] } }, select: { id: true, secretariatId: true } });
  return grants.map(grant => ({ ...grant, contracts: contracts.filter(contract => grant.policy.contractIds.includes(contract.id) && contract.employee.secretariatId === units.find(unit => unit.id === grant.policy.budgetUnitId)?.secretariatId).map(contract => ({ id: contract.id, label: `${contract.registration} · ${contract.employee.name}` })) }));
}

export async function reservePartnerDiscount(context: AppContext, raw: unknown) {
  const input = z.object({ grantId: z.string().min(1), contractId: z.string().min(1), requestKey: z.uuid(), number: z.string().trim().min(1).max(100), firstCompetence: z.string(), count: z.coerce.number().int().min(1).max(120), amount: z.string(), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const rule = await tx.hrPayrollRule.findUniqueOrThrow({ where: { id: input.grantId }, include: { ruleSet: true } });
    const policy = partnerDiscountPolicySchema.parse(rule.value), now = new Date();
    if (rule.category !== "PORTAL" || !rule.isActive || rule.ruleSet.status !== "ATIVA" || now < rule.ruleSet.effectiveFrom || rule.ruleSet.effectiveUntil && now > rule.ruleSet.effectiveUntil || !policy.actorUserIds.includes(context.user.id) || !policy.contractIds.includes(input.contractId)) throw new AccessError("Lançamento fora da autorização do convenente.", 403);
    const contract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: input.contractId }, include: { employee: { select: { secretariatId: true } } } });
    const unit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: policy.budgetUnitId } });
    if (contract.employee.secretariatId !== unit.secretariatId) throw new AccessError("Contrato fora da unidade autorizada.", 403);
    const referenceRun = await tx.hrPayrollRun.findUniqueOrThrow({ where: { id: policy.sourceRunId }, select: { payrollId: true } });
    const scope = await tx.sstBenefitPayrollScope.findUnique({ where: { payrollId: referenceRun.payrollId } });
    if (scope && scope.budgetUnitId !== policy.budgetUnitId) throw new AccessError("Referência de folha fora da unidade autorizada.", 403);
    const result = await reserveConsignmentAgreementInTransaction(tx, context.user.id, { sourceKey: `CONVENENTE:${context.user.id}:${input.requestKey}`, contractId: contract.id, supplierId: policy.supplierId, sourceRunId: policy.sourceRunId, ruleId: policy.consignmentRuleId, rubricCode: policy.rubricCode, number: input.number, firstCompetence: input.firstCompetence, count: input.count, amount: input.amount, reason: input.reason });
    const event = await enqueueHrIntegration(tx, { sourceKey: `CONVENENTE:PEDIDO:${result.id}`, domain: "PORTAL", environment: "INTERNO", eventType: "DESCONTO_CONVENENTE_RESERVADO", payload: { grantId: rule.id, agreementId: result.id, actorId: context.user.id, supplierId: policy.supplierId, budgetUnitId: policy.budgetUnitId } });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    return result.id;
  }, { timeout: 60000 });
}

export async function listOwnPartnerDiscounts(context: AppContext) {
  const grants = await listOwnPartnerDiscountGrants(context);
  const where: Prisma.HrConsignmentAgreementWhereInput = { OR: grants.map(grant => ({ supplierId: grant.policy.supplierId, contractId: { in: grant.contracts.map(contract => contract.id) }, sourceRunId: grant.policy.sourceRunId })) };
  const agreements = grants.length ? await context.prisma.hrConsignmentAgreement.findMany({ where, include: { installments: { include: { entries: { select: { kind: true } } }, orderBy: { sequence: "asc" } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }) : [];
  return { grants, agreements };
}

export async function postPartnerDiscount(context: AppContext, raw: unknown) {
  const input = z.object({ grantId: z.string().min(1), installmentId: z.string().min(1), payrollId: z.string().min(1) }).strict().parse(raw);
  const grant = (await listOwnPartnerDiscountGrants(context)).find(row => row.id === input.grantId);
  if (!grant || !grant.policy.payrollIds.includes(input.payrollId)) throw new AccessError("Folha fora da autorização do convenente.", 403);
  const installment = await context.prisma.hrConsignmentInstallment.findFirst({ where: { id: input.installmentId, agreement: { supplierId: grant.policy.supplierId, contractId: { in: grant.contracts.map(contract => contract.id) }, sourceRunId: grant.policy.sourceRunId } }, select: { id: true } });
  if (!installment) throw new AccessError("Parcela indisponível para o convenente.", 403);
  const scope = await context.prisma.sstBenefitPayrollScope.findUnique({ where: { payrollId: input.payrollId } });
  if (scope && scope.budgetUnitId !== grant.policy.budgetUnitId) throw new AccessError("Folha fora da unidade autorizada.", 403);
  return postConsignmentInstallment(context.prisma, context.user.id, { installmentId: installment.id, payrollId: input.payrollId });
}
