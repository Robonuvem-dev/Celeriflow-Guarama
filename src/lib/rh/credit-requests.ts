import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { suppliers } from "@/db/schema/registry";
import { hrEmploymentContracts, hrPayrollRuns, hrPayrollStatements, hrPortalRequests, payrolls } from "@/db/schema/personnel-workforce";
import { lockPersonnel, personnelJson as json, requireHrIntegrationEvent } from "@/db/repositories/personnel/integration";
import { requireEmploymentContract, requireHrPortalRequest, requirePayroll, requirePayrollRule, requirePayrollRun } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { consignmentMarginSchema } from "./consignment-margin";
import { reserveConsignmentAgreementInTransaction } from "./consignment-service";
import { enqueueHrIntegration } from "./workforce-service";

const positiveAmount = z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/).refine(value => new Decimal(value).gt(0), "Parcela deve ser positiva.");
export const creditRequestInputSchema = z.object({ requestKey: z.string().trim().min(1).max(140), contractId: z.string().min(1), supplierId: z.string().min(1), sourceRunId: z.string().min(1), ruleId: z.string().min(1), firstCompetence: z.string(), count: z.coerce.number().int().min(1).max(120), amount: positiveAmount, description: z.string().trim().min(10).max(4000) }).strict();

/** Identity is supplied by authenticated Portal access, never by a browser field. */
export async function submitEmployeeCreditRequest(db: DatabaseConnection, actorId: string, employeeId: string, raw: unknown) {
  const input = creditRequestInputSchema.parse(raw);
  input.amount = new Decimal(input.amount).toFixed(2);
  const first = payrollPeriod(input.firstCompetence).start;
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, `request:${input.requestKey}`);
    const [previous] = await tx.select().from(hrPortalRequests).where(eq(hrPortalRequests.requestKey, input.requestKey)).limit(1);
    if (previous) {
      if (previous.employeeId !== employeeId || previous.kind !== "CREDITO_CONSIGNADO" || JSON.stringify(creditRequestInputSchema.parse((previous.payload as { input: unknown }).input)) !== JSON.stringify(input)) throw new Error("Chave da solicitação reutilizada com outros dados ou titular.");
      return previous;
    }
    await lockPersonnel(tx, `employee:${employeeId}`);
    const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    const [contract] = await tx.select().from(hrEmploymentContracts).where(and(eq(hrEmploymentContracts.id, input.contractId), eq(hrEmploymentContracts.employeeId, employeeId))).limit(1);
    if (!employee?.isActive || !employee.personId || !contract) throw new Error("Contrato indisponível para o titular.");
    const sourceRun = await requirePayrollRun(tx, input.sourceRunId);
    const statementRows = await tx.select({ statement: hrPayrollStatements }).from(hrPayrollStatements).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId)).where(and(eq(hrPayrollStatements.runId, sourceRun.id), eq(hrEmploymentContracts.employeeId, employeeId), lte(hrPayrollStatements.releaseAt, new Date()), isNull(hrPayrollStatements.revokedAt)));
    const run = { ...sourceRun, payroll: await requirePayroll(tx, sourceRun.payrollId), statements: statementRows.map(row => row.statement) };
    if (run.mode !== "OFICIAL" || run.status !== "FECHADA" || run.payroll.type !== "Mensal" || !run.statements.some(statement => statement.contractId === contract.id)) throw new Error("Crédito exige referência mensal oficial fechada e publicada para o titular.");
    const rule = await requirePayrollRule(tx, input.ruleId);
    const policy = z.object({ origin: z.literal("CONSIGNACAO_CONTRATOS"), maxInstallments: z.number().int().min(1).max(120), referenceValidityMonths: z.number().int().min(1).max(24), supplierIds: z.array(z.string().min(1)).min(1), legalReference: z.string().trim().min(3) }).strict().parse(rule.value);
    const reference = payrollPeriod(run.payroll.competence).start;
    const interval = (first.getUTCFullYear() - reference.getUTCFullYear()) * 12 + first.getUTCMonth() - reference.getUTCMonth();
    if (!rule.isActive || rule.code !== "CONSIGNACAO_CONTRATOS" || rule.ruleSetId !== run.ruleSetId || rule.ruleSet.status !== "ATIVA" || rule.ruleSet.scope !== run.scope || !policy.supplierIds.includes(input.supplierId) || input.count > policy.maxInstallments || interval < 1 || interval > policy.referenceValidityMonths) throw new Error("Consignatária, prazo ou política incompatível com a referência.");
    if (run.scope === "PRODUCAO" && (rule.ruleSet.isDemo || !rule.ruleSet.approvedAt || rule.ruleSet.approvedAt > new Date() || !rule.ruleSet.legalReference)) throw new Error("Solicitação de produção exige política oficial aprovada.");
    const [supplier] = await tx.select({ id: suppliers.id, status: suppliers.status }).from(suppliers).where(eq(suppliers.id, input.supplierId)).limit(1);
    if (!supplier) throw new Error("Consignatária não encontrada.");
    if (supplier.status !== "Ativo") throw new Error("Consignatária inativa.");
    const newer = await tx.select({ competence: payrolls.competence }).from(hrPayrollRuns).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(and(eq(hrPayrollRuns.scope, run.scope), eq(hrPayrollRuns.mode, "OFICIAL"), eq(hrPayrollRuns.status, "FECHADA"), eq(payrolls.type, "Mensal"), sql`EXISTS (SELECT 1 FROM ${hrPayrollStatements} JOIN ${hrEmploymentContracts} ON ${hrEmploymentContracts.id}=${hrPayrollStatements.contractId} WHERE ${hrPayrollStatements.runId}=${hrPayrollRuns.id} AND ${hrEmploymentContracts.employeeId}=${employeeId})`));
    if (newer.some(row => payrollPeriod(row.competence).start > reference)) throw new Error("Use a folha de referência mais recente do titular.");
    const margin = z.object({ consignmentMargin: consignmentMarginSchema }).parse(run.statements[0].snapshot).consignmentMargin;
    if (!margin.contractIds.includes(contract.id) || new Decimal(input.amount).gt(margin.limit)) throw new Error("Parcela excede o limite da margem de referência.");
    const [request] = await tx.insert(hrPortalRequests).values({ requestKey: input.requestKey, employeeId, kind: "CREDITO_CONSIGNADO", actorId, payload: json({ description: input.description, input, scope: run.scope, margin, policy, reservesMargin: false }) }).returning();
    return request;
  });
}

/** Approval reserves the entire schedule and records the decision atomically.
 * It never represents a bank disbursement or a supplier repayment. */
export async function decideEmployeeCreditRequest(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), status: z.enum(["DEFERIDA", "INDEFERIDA"]), decision: z.string().trim().min(10).max(4000), number: z.string().trim().max(100).default(""), rubricCode: z.string().trim().default("") }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, input.requestId);
    if (request.kind !== "CREDITO_CONSIGNADO") throw new Error("Selecione uma solicitação de crédito consignado.");
    const payload = z.object({ input: creditRequestInputSchema, scope: z.string() }).parse(request.payload);
    const decisionKey = `DECISAO_CREDITO:${request.id}`;
    if (request.status !== "EM_ANALISE") {
      const previous = await requireHrIntegrationEvent(tx, decisionKey);
      if (request.status !== input.status || JSON.stringify(z.object({ requestId: z.string(), status: z.string(), decision: z.string(), number: z.string(), rubricCode: z.string() }).parse((previous.payload as { input: unknown }).input)) !== JSON.stringify(input)) throw new Error("Solicitação de crédito já decidida com outros dados.");
      return request;
    }
    const contract = await requireEmploymentContract(tx, payload.input.contractId);
    if (contract.employeeId !== request.employeeId) throw new Error("Contrato diverge do titular da solicitação.");
    let agreementId: string | null = null;
    if (input.status === "DEFERIDA") {
      if (!input.number || !input.rubricCode) throw new Error("Deferimento exige número contratual e rubrica de desconto.");
      if (!(await tx.select({ id: hrPayrollStatements.id }).from(hrPayrollStatements).where(and(eq(hrPayrollStatements.runId, payload.input.sourceRunId), eq(hrPayrollStatements.contractId, contract.id), lte(hrPayrollStatements.releaseAt, new Date()), isNull(hrPayrollStatements.revokedAt))).limit(1)).length) throw new Error("Referência do pedido deixou de estar publicada para o titular.");
      const agreement = await reserveConsignmentAgreementInTransaction(tx, actorId, { sourceKey: `PORTAL:CREDITO:${request.id}`, contractId: payload.input.contractId, supplierId: payload.input.supplierId, sourceRunId: payload.input.sourceRunId, ruleId: payload.input.ruleId, number: input.number, rubricCode: input.rubricCode, firstCompetence: payload.input.firstCompetence, count: payload.input.count, amount: payload.input.amount, reason: input.decision });
      agreementId = agreement.id;
    }
    const decidedAt = new Date();
    const [updated] = await tx.update(hrPortalRequests).set({ status: input.status, decision: input.decision, decidedBy: actorId, decidedAt }).where(eq(hrPortalRequests.id, request.id)).returning();
    await enqueueHrIntegration(tx, { sourceKey: decisionKey, domain: "PORTAL", environment: payload.scope, eventType: "CREDITO_CONSIGNADO_DECIDIDO", payload: json({ input, requestId: request.id, employeeId: request.employeeId, agreementId, decidedAt, actorId, bankDisbursement: false }) });
    return updated;
  }, { timeoutMs: 60000 });
}
