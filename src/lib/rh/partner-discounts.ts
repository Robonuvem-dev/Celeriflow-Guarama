import { db, databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import type { ExternalOperationsContext, ExternalPayrollMovement, PartnerDiscountAgreement, PartnerDiscountGrant } from "@/lib/contracts/personnel-external-operations";
import { requirePayrollRule } from "@/db/repositories/personnel/workforce";
import { findPartnerInstallment, findPartnerPayrollScope, markPartnerEventProcessed, readPartnerAgreements, readPartnerContractOptions, readPartnerPortalRules, readPartnerUnits, requirePartnerContract, requirePartnerReferenceRun, requirePartnerUnit } from "@/db/repositories/personnel-external-operations/partners";
import { z } from "zod";
import { AccessError } from "@/lib/platform/access-error";
import { reserveConsignmentAgreementInTransaction, postConsignmentInstallment } from "./consignment-service";
import { enqueueHrIntegration } from "@/db/repositories/personnel/integration";

function partnerConnection(context: ExternalOperationsContext, connection: DatabaseConnection): DatabaseConnection {
  if (context.database && context.database !== connection.db) throw new Error("A conexão do convenente deve corresponder ao banco do contexto.");
  return connection;
}

export const partnerDiscountPolicySchema = z.object({ origin: z.literal("DESCONTOS_CONVENENTES"), budgetUnitId: z.string().min(1), actorUserIds: z.array(z.string().min(1)).min(1), supplierId: z.string().min(1), contractIds: z.array(z.string().min(1)).min(1), sourceRunId: z.string().min(1), consignmentRuleId: z.string().min(1), rubricCode: z.string().min(1), payrollIds: z.array(z.string().min(1)), instructions: z.string().max(4000) }).strict();

async function readOwnPartnerDiscountGrants(executor: DatabaseExecutor, userId: string): Promise<PartnerDiscountGrant[]> {
  const now = new Date();
  const rules = await readPartnerPortalRules(executor, now);
  const grants = rules.flatMap(rule => { const policy = partnerDiscountPolicySchema.safeParse(rule.value); return policy.success && policy.data.actorUserIds.includes(userId) ? [{ id: rule.id, name: rule.name, policy: policy.data }] : []; });
  const contracts = await readPartnerContractOptions(executor, [...new Set(grants.flatMap(grant => grant.policy.contractIds))]);
  const units = await readPartnerUnits(executor, [...new Set(grants.map(grant => grant.policy.budgetUnitId))]);
  return grants.map(grant => ({ ...grant, contracts: contracts.filter(contract => grant.policy.contractIds.includes(contract.id) && contract.employee.secretariatId === units.find(unit => unit.id === grant.policy.budgetUnitId)?.secretariatId).map(contract => ({ id: contract.id, label: `${contract.registration} · ${contract.employee.name}` })) }));
}

export async function listOwnPartnerDiscountGrants(context: ExternalOperationsContext): Promise<PartnerDiscountGrant[]> {
  return readOwnPartnerDiscountGrants(context.database ?? db, context.user.id);
}

export async function reservePartnerDiscount(context: ExternalOperationsContext, raw: unknown, connection: DatabaseConnection = databaseConnection): Promise<string> {
  const input = z.object({ grantId: z.string().min(1), contractId: z.string().min(1), requestKey: z.uuid(), number: z.string().trim().min(1).max(100), firstCompetence: z.string(), count: z.coerce.number().int().min(1).max(120), amount: z.string(), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(partnerConnection(context, connection), async tx => {
    const rule = await requirePayrollRule(tx, input.grantId);
    const policy = partnerDiscountPolicySchema.parse(rule.value), now = new Date();
    if (rule.category !== "PORTAL" || !rule.isActive || rule.ruleSet.status !== "ATIVA" || now < rule.ruleSet.effectiveFrom || rule.ruleSet.effectiveUntil && now > rule.ruleSet.effectiveUntil || !policy.actorUserIds.includes(context.user.id) || !policy.contractIds.includes(input.contractId)) throw new AccessError("Lançamento fora da autorização do convenente.", 403);
    const contract = await requirePartnerContract(tx, input.contractId);
    const unit = await requirePartnerUnit(tx, policy.budgetUnitId);
    if (contract.employee.secretariatId !== unit.secretariatId) throw new AccessError("Contrato fora da unidade autorizada.", 403);
    const referenceRun = await requirePartnerReferenceRun(tx, policy.sourceRunId);
    const scope = await findPartnerPayrollScope(tx, referenceRun.payrollId);
    if (scope && scope.budgetUnitId !== policy.budgetUnitId) throw new AccessError("Referência de folha fora da unidade autorizada.", 403);
    const result = await reserveConsignmentAgreementInTransaction(tx, context.user.id, { sourceKey: `CONVENENTE:${context.user.id}:${input.requestKey}`, contractId: contract.id, supplierId: policy.supplierId, sourceRunId: policy.sourceRunId, ruleId: policy.consignmentRuleId, rubricCode: policy.rubricCode, number: input.number, firstCompetence: input.firstCompetence, count: input.count, amount: input.amount, reason: input.reason });
    const event = await enqueueHrIntegration(tx, { sourceKey: `CONVENENTE:PEDIDO:${result.id}`, domain: "PORTAL", environment: "INTERNO", eventType: "DESCONTO_CONVENENTE_RESERVADO", payload: { grantId: rule.id, agreementId: result.id, actorId: context.user.id, supplierId: policy.supplierId, budgetUnitId: policy.budgetUnitId } });
    await markPartnerEventProcessed(tx, event.id);
    return result.id;
  }, { timeoutMs: 60000 });
}

export async function listOwnPartnerDiscounts(context: ExternalOperationsContext): Promise<{ grants: PartnerDiscountGrant[]; agreements: PartnerDiscountAgreement[] }> {
  const grants = await listOwnPartnerDiscountGrants(context);
  const agreements = await readPartnerAgreements(context.database ?? db, grants);
  return { grants, agreements };
}

export async function postPartnerDiscount(context: ExternalOperationsContext, raw: unknown, connection: DatabaseConnection = databaseConnection): Promise<ExternalPayrollMovement> {
  const input = z.object({ grantId: z.string().min(1), installmentId: z.string().min(1), payrollId: z.string().min(1) }).strict().parse(raw);
  const source = partnerConnection(context, connection);
  const grant = (await readOwnPartnerDiscountGrants(source.db, context.user.id)).find(row => row.id === input.grantId);
  if (!grant || !grant.policy.payrollIds.includes(input.payrollId)) throw new AccessError("Folha fora da autorização do convenente.", 403);
  const installment = await findPartnerInstallment(source.db, input.installmentId, grant);
  if (!installment) throw new AccessError("Parcela indisponível para o convenente.", 403);
  const scope = await findPartnerPayrollScope(source.db, input.payrollId);
  if (scope && scope.budgetUnitId !== grant.policy.budgetUnitId) throw new AccessError("Folha fora da unidade autorizada.", 403);
  return postConsignmentInstallment(source, context.user.id, { installmentId: installment.id, payrollId: input.payrollId });
}
