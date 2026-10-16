import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { SstValidationError } from "./errors";
import { beneficiaryInput, benefitEntryInput, benefitCoversCompetence, competenceInterval, ExactDecimal, healthPlanInput } from "./benefit-policy";
import { buildBenefitCandidate } from "./benefit-integration";

const digest = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
function assertCreate(context: AppContext) {
  if (!canPerformModuleOperation(context.user, "SST", "create")) throw new AccessError("O perfil não permite incluir benefícios SST.", 403);
}
async function audit(tx: Prisma.TransactionClient, context: AppContext, targetType: string, targetId: string) {
  await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType, targetId });
}
export async function registerHealthPlan(context: AppContext, raw: unknown) {
  assertCreate(context);
  const input = healthPlanInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_PLAN:${input.benefitConfigId}`}))`;
    const existing = await tx.sstHealthPlan.findUnique({ where: { benefitConfigId: input.benefitConfigId } });
    if (existing) {
      if (existing.budgetUnitId !== input.budgetUnitId || digest(Object.fromEntries(Object.keys(input).map((key) => [key, existing[key as keyof typeof existing]]))) !== digest(input)) throw new SstValidationError("Benefício já possui extensão SST com outros dados; preserve o histórico contratual.");
      return existing.id;
    }
    const config = await tx.benefitConfig.findUnique({ where: { id: input.benefitConfigId }, include: { supplier: { include: { company: true } } } });
    if (!config?.isActive || config.type.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() !== "plano de saude" || config.supplier?.status !== "Ativo" || config.supplier.company?.status !== "Ativo") throw new SstValidationError("Selecione benefício Plano de Saúde ativo, com fornecedor e operadora Company ativos no Cadastro Único.");
    const rubrics = await tx.hrPayrollRubric.findMany({ where: { id: { in: [input.monthlyRubricId, input.extraordinaryRubricId] }, type: "DESCONTO", isActive: true }, include: { ruleSet: true } });
    if (rubrics.length !== 2 || rubrics[0].ruleSetId !== rubrics[1].ruleSetId) throw new SstValidationError("Rubricas devem ser descontos ativos, distintos e da mesma parametrização RH.");
    const eventIds = [input.monthlyEventId, input.extraordinaryEventId].filter((id): id is string => !!id);
    if (new Set(eventIds).size !== eventIds.length || (eventIds.length && await tx.payrollEvent.count({ where: { id: { in: eventIds }, isActive: true, type: "Desconto" } }) !== eventIds.length)) throw new SstValidationError("Mapeamento legado exige eventos de desconto ativos e distintos.");
    const plan = await tx.sstHealthPlan.create({ data: { ...input, supplierId: config.supplier.id, operatorCompanyId: config.supplier.company.id, snapshot: { benefitName: config.name, operatorName: config.supplier.company.corporateName, operatorCnpj: config.supplier.company.cnpj, supplierId: config.supplier.id, companyId: config.supplier.company.id, rubricCodes: rubrics.map((rubric) => ({ id: rubric.id, code: rubric.code, ruleSetId: rubric.ruleSetId })) }, createdById: context.user.id } });
    await audit(tx, context, "SST_HEALTH_PLAN", plan.id);
    return plan.id;
  });
}

export async function registerBenefitBeneficiary(context: AppContext, raw: unknown) {
  assertCreate(context);
  const input = beneficiaryInput.parse(raw);
  return context.prisma.$transaction(async (tx) => {
    const plan = await tx.sstHealthPlan.findUniqueOrThrow({ where: { id: input.planId }, include: { budgetUnit: true, benefitConfig: true } });
    assertBudgetUnitAccess(context.user, plan.budgetUnitId);
    const assignment = await tx.payrollBenefit.findUnique({ where: { id: input.payrollBenefitId }, include: { employee: true } });
    if (!assignment || assignment.benefitConfigId !== plan.benefitConfigId || assignment.status !== "Ativo" || !plan.benefitConfig.isActive || !assignment.employee.isActive || !plan.budgetUnit.secretariatId || assignment.employee.secretariatId !== plan.budgetUnit.secretariatId) throw new SstValidationError("Vínculo RH inativo ou incompatível com benefício e secretaria da UG.");
    const dependent = input.dependentId ? await tx.dependent.findUnique({ where: { id: input.dependentId } }) : null;
    if (input.dependentId && dependent?.employeeId !== assignment.employeeId) throw new SstValidationError("Dependente não pertence ao titular canônico.");
    const beneficiaryKey = input.dependentId || "TITULAR";
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_BENEFICIARY:${assignment.employeeId}:${plan.benefitConfigId}:${beneficiaryKey}`}))`;
    const existing = await tx.sstBenefitBeneficiary.findUnique({ where: { payrollBenefitId_beneficiaryKey_startsAt: { payrollBenefitId: input.payrollBenefitId, beneficiaryKey, startsAt: input.startsAt } } });
    if (existing) {
      const same = existing.planId === input.planId && existing.cardNumber === input.cardNumber && existing.endsAt.getTime() === input.endsAt.getTime() && existing.admissionDate.getTime() === input.admissionDate.getTime() && existing.monthlyAmount.eq(input.monthlyAmount) && existing.contractReference === input.contractReference;
      if (!same) throw new SstValidationError("Vigência já registrada com outros dados.");
      return existing.id;
    }
    const overlap = await tx.sstBenefitBeneficiary.count({ where: { payrollBenefit: { employeeId: assignment.employeeId, benefitConfigId: plan.benefitConfigId }, beneficiaryKey, startsAt: { lte: input.endsAt }, endsAt: { gte: input.startsAt } } });
    if (overlap) throw new SstValidationError("Já existe período de cobertura sobreposto para o beneficiário.");
    const record = await tx.sstBenefitBeneficiary.create({ data: { ...input, beneficiaryKey, snapshot: { employeeId: assignment.employeeId, employeeName: assignment.employee.name, registration: assignment.employee.registration, beneficiaryName: dependent?.name ?? assignment.employee.name, beneficiaryCpf: dependent?.cpf ?? assignment.employee.cpf, employeeCpf: assignment.employee.cpf, relationship: dependent?.relationship ?? "TITULAR", plan: plan.snapshot, billingPolicy: "FULL_COVERAGE_MONTH_ONLY_PARTIAL_MONTH_REQUIRES_CONTRACT_RULE" }, createdById: context.user.id } });
    await audit(tx, context, "SST_BENEFIT_BENEFICIARY", record.id);
    return record.id;
  });
}

async function createEntry(tx: Prisma.TransactionClient, context: AppContext, input: ReturnType<typeof benefitEntryInput.parse>) {
  const beneficiary = await tx.sstBenefitBeneficiary.findUniqueOrThrow({ where: { id: input.beneficiaryId }, include: { payrollBenefit: { include: { employee: true } }, plan: { include: { monthlyRubric: { include: { ruleSet: true } }, extraordinaryRubric: { include: { ruleSet: true } }, budgetUnit: true } } } });
  assertBudgetUnitAccess(context.user, beneficiary.plan.budgetUnitId);
  if (!beneficiary.plan.budgetUnit.secretariatId || beneficiary.payrollBenefit.employee.secretariatId !== beneficiary.plan.budgetUnit.secretariatId) throw new SstValidationError("Servidor fora do escopo funcional da UG.");
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_ENTRY:${beneficiary.id}:${input.competence}`}))`;
  const requestHash = digest(input);
  const existing = await tx.sstBenefitEntry.findUnique({ where: { beneficiaryId_sourceReference: { beneficiaryId: beneficiary.id, sourceReference: input.sourceReference } } });
  if (existing) { if (existing.requestHash !== requestHash) throw new SstValidationError("Referência de origem já utilizada com outros dados."); return existing.id; }
  if (input.kind !== "REFUND" && !benefitCoversCompetence(beneficiary.startsAt, beneficiary.endsAt, input.competence)) throw new SstValidationError("Competência fora da cobertura do beneficiário.");
  if (input.kind === "MONTHLY" && !beneficiary.monthlyAmount.eq(input.amount)) throw new SstValidationError("Mensalidade deve coincidir com o valor contratual registrado.");
  const month = competenceInterval(input.competence);
  if (input.kind === "MONTHLY" && (beneficiary.startsAt > month.start || beneficiary.endsAt < month.end)) throw new SstValidationError("Cobertura parcial do mês exige regra contratual de cobrança/pro rata ainda não configurada.");
  if (input.kind === "MONTHLY" && await tx.sstBenefitEntry.count({ where: { beneficiaryId: beneficiary.id, competence: input.competence, kind: "MONTHLY" } })) throw new SstValidationError("Mensalidade já gerada para esta vigência/competência.");
  const origin = input.refundOfId ? await tx.sstBenefitEntry.findUnique({ where: { id: input.refundOfId } }) : null;
  if (input.kind === "REFUND" && (!origin || origin.beneficiaryId !== beneficiary.id || origin.kind === "REFUND")) throw new SstValidationError("Devolução deve referenciar cobrança do mesmo beneficiário.");
  const monthly = input.kind === "MONTHLY" || origin?.kind === "MONTHLY";
  const amount = new ExactDecimal(input.amount).mul(input.kind === "REFUND" ? -1 : 1).toFixed(2);
  const candidate = buildBenefitCandidate({ employeeId: beneficiary.payrollBenefit.employeeId, dependentId: beneficiary.dependentId, payrollBenefitId: beneficiary.payrollBenefitId, competence: input.competence, kind: input.kind, chargeKind: origin?.kind, amount, rubric: monthly ? beneficiary.plan.monthlyRubric : beneficiary.plan.extraordinaryRubric, eventId: monthly ? beneficiary.plan.monthlyEventId : beneficiary.plan.extraordinaryEventId });
  const record = await tx.sstBenefitEntry.create({ data: { ...input, amount, requestHash, candidateSnapshot: { ...candidate }, createdById: context.user.id } });
  await audit(tx, context, "SST_BENEFIT_ENTRY", record.id);
  return record.id;
}
export async function registerBenefitEntry(context: AppContext, raw: unknown) {
  assertCreate(context);
  const input = benefitEntryInput.parse(raw);
  return context.prisma.$transaction((tx) => createEntry(tx, context, input));
}
export async function generateBenefitMonthly(context: AppContext, beneficiaryId: string, competence: string) {
  assertCreate(context);
  return context.prisma.$transaction(async (tx) => {
    const beneficiary = await tx.sstBenefitBeneficiary.findUniqueOrThrow({ where: { id: beneficiaryId } });
    const input = benefitEntryInput.parse({ beneficiaryId, competence, kind: "MONTHLY", amount: beneficiary.monthlyAmount.toFixed(2), sourceReference: `MONTHLY:${competence}`, reason: "Mensalidade contratual integral; sem cálculo presumido de pro rata." });
    return createEntry(tx, context, input);
  });
}
