import { createHash } from "node:crypto";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { sstHealthPlans, sstBeneficiaries, sstBenefitEntries, sstBenefitConfigs, sstPayrollBenefits } from "@/db/schema/sst-benefits";
import { suppliers, companies } from "@/db/schema/registry";
import { employees } from "@/db/schema/administration";
import { dependents } from "@/db/schema/personnel-records";
import { hrPayrollRubrics, hrPayrollRuleSets } from "@/db/schema/personnel-configuration";
import { payrollEvents } from "@/db/schema/personnel-workforce";
import { findSstHealthPlan, findSstBenefitBeneficiary, findSstBenefitRubric } from "@/db/repositories/sst/benefits";
import { sstContextConnection } from "./database";
import { AccessError, assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { SstValidationError } from "./errors";
import { beneficiaryInput, benefitEntryInput, benefitCoversCompetence, competenceInterval, ExactDecimal, healthPlanInput } from "./benefit-policy";
import { buildBenefitCandidate } from "./benefit-integration";

const digest = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
function assertCreate(context: AppContext) {
  if (!canPerformModuleOperation(context.user, "SST", "create")) throw new AccessError("O perfil não permite incluir benefícios SST.", 403);
}
async function audit(tx: DatabaseTransaction, context: AppContext, targetType: string, targetId: string) {
  await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType, targetId });
}
export async function registerHealthPlan(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  assertCreate(context);
  const input = healthPlanInput.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_PLAN:${input.benefitConfigId}`}))`);
    const [existing] = await tx.select().from(sstHealthPlans).where(eq(sstHealthPlans.benefitConfigId, input.benefitConfigId));
    if (existing) {
      if (existing.budgetUnitId !== input.budgetUnitId || digest(Object.fromEntries(Object.keys(input).map((key) => [key, existing[key as keyof typeof existing]]))) !== digest(input)) throw new SstValidationError("Benefício já possui extensão SST com outros dados; preserve o histórico contratual.");
      return existing.id;
    }
    const [configRow] = await tx.select({ config: sstBenefitConfigs, supplier: suppliers, company: companies }).from(sstBenefitConfigs).leftJoin(suppliers, eq(suppliers.id, sstBenefitConfigs.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).where(eq(sstBenefitConfigs.id, input.benefitConfigId));
    const config = configRow ? { ...configRow.config, supplier: configRow.supplier ? { ...configRow.supplier, company: configRow.company } : null } : null;
    if (!config?.isActive || config.type.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() !== "plano de saude" || config.supplier?.status !== "Ativo" || config.supplier.company?.status !== "Ativo") throw new SstValidationError("Selecione benefício Plano de Saúde ativo, com fornecedor e operadora Company ativos no Cadastro Único.");
    const rubrics = await tx.select({ rubric: hrPayrollRubrics, ruleSet: hrPayrollRuleSets }).from(hrPayrollRubrics).innerJoin(hrPayrollRuleSets, eq(hrPayrollRuleSets.id, hrPayrollRubrics.ruleSetId)).where(and(inArray(hrPayrollRubrics.id, [input.monthlyRubricId, input.extraordinaryRubricId]), eq(hrPayrollRubrics.type, "DESCONTO"), eq(hrPayrollRubrics.isActive, true))).then(rows => rows.map(row => ({ ...row.rubric, ruleSet: row.ruleSet })));
    if (rubrics.length !== 2 || rubrics[0].ruleSetId !== rubrics[1].ruleSetId) throw new SstValidationError("Rubricas devem ser descontos ativos, distintos e da mesma parametrização RH.");
    const eventIds = [input.monthlyEventId, input.extraordinaryEventId].filter((id): id is string => !!id);
    if (new Set(eventIds).size !== eventIds.length || (eventIds.length && (await tx.select({ id: payrollEvents.id }).from(payrollEvents).where(and(inArray(payrollEvents.id, eventIds), eq(payrollEvents.isActive, true), eq(payrollEvents.type, "Desconto")))).length !== eventIds.length)) throw new SstValidationError("Mapeamento legado exige eventos de desconto ativos e distintos.");
    const [plan] = await tx.insert(sstHealthPlans).values({ ...input, supplierId: config.supplier.id, operatorCompanyId: config.supplier.company.id, snapshot: { benefitName: config.name, operatorName: config.supplier.company.corporateName, operatorCnpj: config.supplier.company.cnpj, supplierId: config.supplier.id, companyId: config.supplier.company.id, rubricCodes: rubrics.map((rubric) => ({ id: rubric.id, code: rubric.code, ruleSetId: rubric.ruleSetId })) }, createdById: context.user.id }).returning({ id: sstHealthPlans.id });
    await audit(tx, context, "SST_HEALTH_PLAN", plan.id);
    return plan.id;
  });
}

export async function registerBenefitBeneficiary(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  assertCreate(context);
  const input = beneficiaryInput.parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    const plan = await findSstHealthPlan(tx, input.planId);
    if (!plan) throw new SstValidationError("Plano não encontrado.");
    assertBudgetUnitAccess(context.user, plan.budgetUnitId);
    const [assignmentRow] = await tx.select({ assignment: sstPayrollBenefits, employee: employees }).from(sstPayrollBenefits).innerJoin(employees, eq(employees.id, sstPayrollBenefits.employeeId)).where(eq(sstPayrollBenefits.id, input.payrollBenefitId));
    const assignment = assignmentRow ? { ...assignmentRow.assignment, employee: assignmentRow.employee } : null;
    if (!assignment || assignment.benefitConfigId !== plan.benefitConfigId || assignment.status !== "Ativo" || !plan.benefitConfig.isActive || !assignment.employee.isActive || !plan.budgetUnit.secretariatId || assignment.employee.secretariatId !== plan.budgetUnit.secretariatId) throw new SstValidationError("Vínculo RH inativo ou incompatível com benefício e secretaria da UG.");
    const dependent = input.dependentId ? (await tx.select().from(dependents).where(eq(dependents.id, input.dependentId)))[0] : null;
    if (input.dependentId && dependent?.employeeId !== assignment.employeeId) throw new SstValidationError("Dependente não pertence ao titular canônico.");
    const beneficiaryKey = input.dependentId || "TITULAR";
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_BENEFICIARY:${assignment.employeeId}:${plan.benefitConfigId}:${beneficiaryKey}`}))`);
    const [existing] = await tx.select().from(sstBeneficiaries).where(and(eq(sstBeneficiaries.payrollBenefitId, input.payrollBenefitId), eq(sstBeneficiaries.beneficiaryKey, beneficiaryKey), eq(sstBeneficiaries.startsAt, input.startsAt)));
    if (existing) {
      const same = existing.planId === input.planId && existing.cardNumber === input.cardNumber && existing.endsAt.getTime() === input.endsAt.getTime() && existing.admissionDate.getTime() === input.admissionDate.getTime() && existing.monthlyAmount.eq(input.monthlyAmount) && existing.contractReference === input.contractReference;
      if (!same) throw new SstValidationError("Vigência já registrada com outros dados.");
      return existing.id;
    }
    const overlap = await tx.select({ id: sstBeneficiaries.id }).from(sstBeneficiaries).innerJoin(sstPayrollBenefits, eq(sstPayrollBenefits.id, sstBeneficiaries.payrollBenefitId)).where(and(eq(sstPayrollBenefits.employeeId, assignment.employeeId), eq(sstPayrollBenefits.benefitConfigId, plan.benefitConfigId), eq(sstBeneficiaries.beneficiaryKey, beneficiaryKey), lte(sstBeneficiaries.startsAt, input.endsAt), gte(sstBeneficiaries.endsAt, input.startsAt))).limit(1);
    if (overlap.length) throw new SstValidationError("Já existe período de cobertura sobreposto para o beneficiário.");
    const [record] = await tx.insert(sstBeneficiaries).values({ ...input, monthlyAmount: new ExactDecimal(input.monthlyAmount), beneficiaryKey, snapshot: { employeeId: assignment.employeeId, employeeName: assignment.employee.name, registration: assignment.employee.registration, beneficiaryName: dependent?.name ?? assignment.employee.name, beneficiaryCpf: dependent?.cpf ?? assignment.employee.cpf, employeeCpf: assignment.employee.cpf, relationship: dependent?.relationship ?? "TITULAR", plan: plan.snapshot, billingPolicy: "FULL_COVERAGE_MONTH_ONLY_PARTIAL_MONTH_REQUIRES_CONTRACT_RULE" }, createdById: context.user.id }).returning({ id: sstBeneficiaries.id });
    await audit(tx, context, "SST_BENEFIT_BENEFICIARY", record.id);
    return record.id;
  });
}

async function createEntry(tx: DatabaseTransaction, context: AppContext, input: ReturnType<typeof benefitEntryInput.parse>) {
  const beneficiary = await findSstBenefitBeneficiary(tx, input.beneficiaryId);
  if (!beneficiary) throw new SstValidationError("Beneficiário não encontrado.");
  assertBudgetUnitAccess(context.user, beneficiary.plan.budgetUnitId);
  if (!beneficiary.plan.budgetUnit.secretariatId || beneficiary.payrollBenefit.employee.secretariatId !== beneficiary.plan.budgetUnit.secretariatId) throw new SstValidationError("Servidor fora do escopo funcional da UG.");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_ENTRY:${beneficiary.id}:${input.competence}`}))`);
  const requestHash = digest(input);
  const [existing] = await tx.select().from(sstBenefitEntries).where(and(eq(sstBenefitEntries.beneficiaryId, beneficiary.id), eq(sstBenefitEntries.sourceReference, input.sourceReference)));
  if (existing) { if (existing.requestHash !== requestHash) throw new SstValidationError("Referência de origem já utilizada com outros dados."); return existing.id; }
  if (input.kind !== "REFUND" && !benefitCoversCompetence(beneficiary.startsAt, beneficiary.endsAt, input.competence)) throw new SstValidationError("Competência fora da cobertura do beneficiário.");
  if (input.kind === "MONTHLY" && !beneficiary.monthlyAmount.eq(input.amount)) throw new SstValidationError("Mensalidade deve coincidir com o valor contratual registrado.");
  const month = competenceInterval(input.competence);
  if (input.kind === "MONTHLY" && (beneficiary.startsAt > month.start || beneficiary.endsAt < month.end)) throw new SstValidationError("Cobertura parcial do mês exige regra contratual de cobrança/pro rata ainda não configurada.");
  if (input.kind === "MONTHLY" && (await tx.select({ id: sstBenefitEntries.id }).from(sstBenefitEntries).where(and(eq(sstBenefitEntries.beneficiaryId, beneficiary.id), eq(sstBenefitEntries.competence, input.competence), eq(sstBenefitEntries.kind, "MONTHLY"))).limit(1)).length) throw new SstValidationError("Mensalidade já gerada para esta vigência/competência.");
  const origin = input.refundOfId ? (await tx.select().from(sstBenefitEntries).where(eq(sstBenefitEntries.id, input.refundOfId)))[0] : null;
  if (input.kind === "REFUND" && (!origin || origin.beneficiaryId !== beneficiary.id || origin.kind === "REFUND")) throw new SstValidationError("Devolução deve referenciar cobrança do mesmo beneficiário.");
  const monthly = input.kind === "MONTHLY" || origin?.kind === "MONTHLY";
  const amount = new ExactDecimal(input.amount).mul(input.kind === "REFUND" ? -1 : 1).toFixed(2);
  const rubric = await findSstBenefitRubric(tx, monthly ? beneficiary.plan.monthlyRubricId : beneficiary.plan.extraordinaryRubricId);
  if (!rubric) throw new SstValidationError("Rubrica não encontrada.");
  const candidate = buildBenefitCandidate({ employeeId: beneficiary.payrollBenefit.employeeId, dependentId: beneficiary.dependentId, payrollBenefitId: beneficiary.payrollBenefitId, competence: input.competence, kind: input.kind, chargeKind: origin?.kind, amount, rubric, eventId: monthly ? beneficiary.plan.monthlyEventId : beneficiary.plan.extraordinaryEventId });
  const [record] = await tx.insert(sstBenefitEntries).values({ ...input, amount: new ExactDecimal(amount), requestHash, candidateSnapshot: { ...candidate }, createdById: context.user.id }).returning({ id: sstBenefitEntries.id });
  await audit(tx, context, "SST_BENEFIT_ENTRY", record.id);
  return record.id;
}
export async function registerBenefitEntry(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  assertCreate(context);
  const input = benefitEntryInput.parse(raw);
  return withDatabaseTransaction(connection, (tx) => createEntry(tx, context, input));
}
export async function generateBenefitMonthly(context: AppContext, beneficiaryId: string, competence: string, connection: DatabaseConnection = sstContextConnection(context)) {
  assertCreate(context);
  return withDatabaseTransaction(connection, async (tx) => {
    const [beneficiary] = await tx.select().from(sstBeneficiaries).where(eq(sstBeneficiaries.id, beneficiaryId));
    if (!beneficiary) throw new SstValidationError("Beneficiário não encontrado.");
    const input = benefitEntryInput.parse({ beneficiaryId, competence, kind: "MONTHLY", amount: beneficiary.monthlyAmount.toFixed(2), sourceReference: `MONTHLY:${competence}`, reason: "Mensalidade contratual integral; sem cálculo presumido de pro rata." });
    return createEntry(tx, context, input);
  });
}
