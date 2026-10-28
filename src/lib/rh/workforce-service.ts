import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type DecimalJs from "decimal.js";
import type { JsonValue } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { employees, roles, departments } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { costCenters } from "@/db/schema/master-data";
import { dependents } from "@/db/schema/personnel-records";
import { hrEmploymentRegimes } from "@/db/schema/personnel-configuration";
import { hrEmploymentContracts, hrEmploymentRevisions, hrMovements, hrPayrollRuns, hrPayrollStatements, hrPayrollItemOrigins, hrPortalRequests, hrRightEntries, payrolls, payrollItems, payrollEvents } from "@/db/schema/personnel-workforce";
import { enqueueHrIntegration, findHrIntegrationEvent, lockPersonnel as lock, personnelJson as json, stablePersonnelJson as stableJson } from "@/db/repositories/personnel/integration";
import { findActivePayrollRule, listClosedContractCompetences, listEmploymentContracts, requireEmployeeWithPerson, requireEmploymentContract, requireEmploymentRegime, requireEmploymentWorkspace, requireEmploymentHolderHistory, requirePayroll, requirePayrollRun, requirePayrollStatement } from "@/db/repositories/personnel/workforce";
import { listCanonicalPayrollItems, listSocialSecuritySchemes, requirePayrollCalculationRules } from "@/db/repositories/personnel/payroll";
import { createHash } from "node:crypto";
import { z } from "zod";
import { allocatePayrollAmount, calculateContractRubrics, calculateContribution, payrollPeriod } from "./calculation-engine";
import { resolveContractRevision } from "./contract-timeline";
import { calculateConsignmentMargin } from "./consignment-margin";
import { assertConsignmentSchedulePosted } from "./consignment-service";
import { assessPayrollDependents, dependentAssessmentSchema, familyWagePolicySchema, familyWageSnapshotSchema } from "./dependent-eligibility";
import { contractCustomFieldsPolicySchema, contractCustomFieldsPolicyHash, validateContractCustomFields } from "./contract-custom-fields";
import { assertPositionPlanForContract, positionPlanSchema } from "./position-plan";
import { selectReceiptMessages } from "./receipt-messages";
import { assertServiceTimeAllowanceCurrent } from "./service-time-allowance";
import { calculateIncomeTax, incomeTaxBandSchema } from "./income-tax";
import { pocSpecialParametersSchema, pocSpecialPolicySchema, preparePocSpecialRubrics } from "./poc-special-payroll";
import { loadSpecialPayrollHistory } from "./special-payroll-history";
import { calculatePayrollPensions, payrollPensionPolicySchema } from "./payroll-pensions";
import { calculateProratedMonthlyRubrics, resolveMonthlyContractSegments, monthlyProrationPolicySchema } from "./monthly-proration";
import { loadVacationPayrollReservations } from "./vacation-payroll-link";

export { enqueueHrIntegration } from "@/db/repositories/personnel/integration";
type Tx = DatabaseTransaction;
const D = (value: DecimalJs.Value) => new Decimal(value);
const money = z.string().trim().regex(/^-?\d{1,16}(?:\.\d{1,2})?$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((value, ctx) => {
  const result = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value) {
    ctx.addIssue({ code: "custom", message: "Data civil inválida." }); return z.NEVER;
  }
  return result;
});
const optionalDate = z.union([date, z.literal("")]).transform(value => value === "" ? null : value);
export const hrContractInputSchema = z.object({
  id: z.string().optional(), version: z.coerce.number().int().positive().optional(),
  effectiveFrom: z.union([date, z.literal("")]).optional().transform(value => value || undefined),
  employeeId: z.string().min(1), registration: z.string().trim().min(1).max(64),
  regimeId: z.string().min(1), roleId: z.string().min(1), departmentId: z.string().optional(),
  costCenterId: z.string().optional(), workLocation: z.string().trim().min(1).max(200), salaryLevel: z.string().optional(),
  admittedAt: date, appointedAt: optionalDate, swornAt: optionalDate, endsAt: optionalDate,
  monthlyHours: z.coerce.number().int().min(1).max(744), salary: money.refine(v => D(v).gte(0)),
  details: z.record(z.string(), z.unknown()).default({}), reason: z.string().trim().min(3).max(2000),
  customFields: z.record(z.string(), z.unknown()).optional(), customFieldsPolicyHash: z.string().optional(),
}).strict();

async function lockPositionPlans(tx: Tx, regimeIds: string[]) {
  const regimes = await tx.select({ ruleSetId: hrEmploymentRegimes.ruleSetId }).from(hrEmploymentRegimes).where(inArray(hrEmploymentRegimes.id, [...new Set(regimeIds)]));
  for (const ruleSetId of [...new Set(regimes.map(regime => regime.ruleSetId))].sort()) await lock(tx, `POSITION_PLAN:${ruleSetId}`);
}

export async function saveEmploymentContract(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = hrContractInputSchema.parse(raw);
  return withDatabaseTransaction(db, tx => saveEmploymentContractInTransaction(tx, actorId, input));
}

export async function saveEmploymentContractInTransaction(tx: Tx, actorId: string, input: z.infer<typeof hrContractInputSchema>, deferPositionPlan = false) {
  if (input.endsAt && input.endsAt < input.admittedAt) throw new Error("Término anterior à admissão.");
    await lock(tx, `employee:${input.employeeId}`);
    if (input.id) await lock(tx, `contract:${input.id}`);
    const employee = await requireEmployeeWithPerson(tx, input.employeeId);
    if (!employee.person || !employee.isActive || employee.person.status !== "Ativo") throw new Error("Servidor deve estar ativo e vinculado à pessoa física do Cadastro Único.");
    const regime = await requireEmploymentRegime(tx, input.regimeId);
    await lockPositionPlans(tx, [input.regimeId]);
    const [role] = await tx.select().from(roles).where(eq(roles.id, input.roleId)).limit(1);
    if (!role) throw new Error("Cargo não encontrado.");
    if (!regime.isActive || !role.isActive) throw new Error("Regime/cargo inativo.");
    if (input.departmentId && !(await tx.select({ id: departments.id }).from(departments).where(eq(departments.id, input.departmentId)).limit(1)).length) throw new Error("Departamento não encontrado.");
    if (input.costCenterId && !(await tx.select({ id: costCenters.id }).from(costCenters).where(eq(costCenters.id, input.costCenterId)).limit(1)).length) throw new Error("Centro de custo não encontrado.");
    const termRule = await findActivePayrollRule(tx, regime.ruleSetId, `CONTRATO_LIMITE_DIAS_${regime.code}`);
    if (termRule) {
      const limit = z.coerce.number().int().min(1).max(36500).parse(termRule.value);
      const days = input.endsAt ? Math.round((input.endsAt.getTime() - input.admittedAt.getTime()) / 86400000) + 1 : Infinity;
      if (days > limit) throw new Error("Prazo do contrato excede o limite do regime.");
    }
    const previous = input.id ? await requireEmploymentContract(tx, input.id) : null;
    if (previous && (previous.employeeId !== input.employeeId || previous.version !== input.version)) throw new Error("Contrato alterado por outro operador ou titular incompatível. Recarregue a ficha.");
    const effectiveFrom = input.effectiveFrom ?? input.admittedAt;
    if (effectiveFrom < input.admittedAt) throw new Error("Vigência anterior à admissão.");
    const customRule = await findActivePayrollRule(tx, regime.ruleSetId, "CAMPOS_CONTRATO");
    const details = { ...input.details };
    const positionRule = await findActivePayrollRule(tx, regime.ruleSetId, "QUADRO_CARGOS");
    if (positionRule) details.positionPlan = { ruleId: positionRule.id, definition: positionPlanSchema.parse(positionRule.value) };
    else {
      if ((previous?.details as { positionPlan?: unknown } | undefined)?.positionPlan) throw new Error("Contrato possui quadro de cargos histórico; preserve uma política ativa antes de alterá-lo.");
      delete details.positionPlan;
    }
    if (customRule) {
      if (regime.ruleSet.effectiveFrom > effectiveFrom || (regime.ruleSet.effectiveUntil && regime.ruleSet.effectiveUntil < effectiveFrom)) throw new Error("Política de campos configuráveis não cobre a vigência contratual.");
      const policy = contractCustomFieldsPolicySchema.parse(customRule.value);
      const policyHash = contractCustomFieldsPolicyHash(policy);
      if (input.customFields !== undefined && input.customFieldsPolicyHash !== policyHash) throw new Error("Definição dos campos configuráveis mudou. Recarregue a ficha antes de salvar.");
      const previousValues = (previous?.details as { customFields?: Record<string, unknown> } | undefined)?.customFields || {};
      if (Object.keys(previousValues).some(code => !policy.fields.some(field => field.code === code))) throw new Error("Campo histórico retirado da política exige saneamento explícito; preserve a definição antes de alterar o contrato.");
      details.customFields = validateContractCustomFields(policy, input.customFields ?? details.customFields ?? {});
      details.customFieldsPolicy = { ruleId: customRule.id, hash: policyHash, definition: policy };
    } else if (input.customFields !== undefined || input.customFieldsPolicyHash !== undefined) {
      throw new Error("Regime sem política ativa de campos configuráveis. Recarregue a ficha.");
    } else if (previous && (previous.details as { customFieldsPolicy?: unknown }).customFieldsPolicy) {
      throw new Error("Contrato possui campos configuráveis históricos; preserve a política ativa antes de alterá-lo.");
    } else if (details.customFields !== undefined || details.customFieldsPolicy !== undefined) {
      throw new Error("Campos configuráveis exigem política ativa do regime.");
    }
    if (previous) {
      if (!input.effectiveFrom) throw new Error("Informe a vigência da alteração contratual.");
      if (previous.admittedAt.getTime() !== input.admittedAt.getTime()) throw new Error("Admissão original é preservada; correção exige saneamento próprio.");
      const [latest] = await tx.select().from(hrEmploymentRevisions).where(eq(hrEmploymentRevisions.contractId, previous.id)).orderBy(desc(hrEmploymentRevisions.effectiveFrom), desc(hrEmploymentRevisions.version)).limit(1);
      if (latest && effectiveFrom < latest.effectiveFrom) throw new Error("Alteração anterior à última vigência. Registre correção temporal sem sobrepor o histórico.");
      const closed = await listClosedContractCompetences(tx, previous.id);
      if (closed.some(statement => effectiveFrom <= payrollPeriod(statement.competence).end)) throw new Error("Vigência alcança competência fechada. A alteração deve começar após o último fechamento.");
    }
    const { id, version: _version, effectiveFrom: _effectiveFrom, reason, customFields: _customFields, customFieldsPolicyHash: _customFieldsPolicyHash, ...fields } = input;
    void _version;
    void _effectiveFrom;
    void _customFields;
    void _customFieldsPolicyHash;
    const data = { ...fields, salary: D(input.salary), details: json(details), departmentId: input.departmentId || null, costCenterId: input.costCenterId || null, salaryLevel: input.salaryLevel || null };
    const [contract] = id ? await tx.update(hrEmploymentContracts).set({ ...data, version: sql`${hrEmploymentContracts.version} + 1` }).where(eq(hrEmploymentContracts.id, id)).returning() : await tx.insert(hrEmploymentContracts).values(data).returning();
    await tx.insert(hrEmploymentRevisions).values({ contractId: contract.id, version: contract.version, effectiveFrom, snapshot: json(contract), actorId, reason });
    if (!deferPositionPlan) await assertPositionPlanForContract(tx, contract, effectiveFrom);
    if (!previous && !(await tx.select({ id: hrPortalRequests.id }).from(hrPortalRequests).where(eq(hrPortalRequests.requestKey, `INVITE:${employee.id}`)).limit(1)).length) await tx.insert(hrPortalRequests).values({ employeeId: employee.id, requestKey: `INVITE:${employee.id}`, kind: "ACESSO_PORTAL", payload: json({ personId: employee.personId, contractId: contract.id, email: employee.person.email }), actorId });
    return contract;
}

export async function adjustContractSalaries(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ batchKey: z.string().min(1).max(160), contractIds: z.array(z.string().min(1)).min(1), effectiveFrom: date, rate: z.string().regex(/^-?\d+(?:\.\d{1,6})?$/), reason: z.string().trim().min(3).max(2000), mode: z.enum(["PREVIA", "APLICAR"]), previewHash: z.string().default("") }).strict().parse(raw);
  const rate = D(input.rate);
  if (rate.lt(-100)) throw new Error("Reajuste não pode reduzir o salário abaixo de zero.");
  const ids = [...new Set(input.contractIds)].sort();
  const request = { batchKey: input.batchKey, contractIds: ids, effectiveFrom: input.effectiveFrom, rate: rate.toString(), reason: input.reason };
  const requestHash = createHash("sha256").update(stableJson(request)).digest("hex");
  return withDatabaseTransaction(db, async tx => {
    await lock(tx, `adjustment:${input.batchKey}`);
    const existing = await findHrIntegrationEvent(tx, `REAJUSTE:${input.batchKey}`);
    if (existing) {
      const payload = existing.payload as { requestHash: string; previewHash: string; rows: JsonValue[] };
      if (payload.requestHash !== requestHash) throw new Error("Lote de reajuste reutilizado com parâmetros diferentes.");
      return { rows: payload.rows, previewHash: payload.previewHash, applied: true, reused: true };
    }
    const contracts = await tx.select().from(hrEmploymentContracts).where(inArray(hrEmploymentContracts.id, ids)).orderBy(asc(hrEmploymentContracts.id));
    if (contracts.length !== ids.length) throw new Error("Seleção de contratos inválida.");
    for (const employeeId of [...new Set(contracts.map(contract => contract.employeeId))].sort()) await lock(tx, `employee:${employeeId}`);
    for (const id of ids) await lock(tx, `contract:${id}`);
    const current = await tx.select().from(hrEmploymentContracts).where(inArray(hrEmploymentContracts.id, ids)).orderBy(asc(hrEmploymentContracts.id));
    const rows = current.map(contract => ({ id: contract.id, registration: contract.registration, version: contract.version, before: contract.salary.toFixed(2), after: contract.salary.mul(D(1).add(rate.div(100))).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) }));
    const previewHash = createHash("sha256").update(stableJson({ request, rows })).digest("hex");
    if (input.mode === "PREVIA") return { rows: json(rows), previewHash, applied: false, reused: false };
    if (input.previewHash !== previewHash) throw new Error("Confira uma prévia atualizada. Dados ou parâmetros mudaram desde a prévia.");
    const updatedContracts: Awaited<ReturnType<typeof saveEmploymentContractInTransaction>>[] = [];
    await lockPositionPlans(tx, current.map(contract => contract.regimeId));
    for (const contract of current) {
      const row = rows.find(row => row.id === contract.id)!;
      const day = (value: Date | null) => value?.toISOString().slice(0, 10) || "";
      updatedContracts.push(await saveEmploymentContractInTransaction(tx, actorId, hrContractInputSchema.parse({ id: contract.id, version: contract.version, employeeId: contract.employeeId, registration: contract.registration, regimeId: contract.regimeId, roleId: contract.roleId, departmentId: contract.departmentId || undefined, costCenterId: contract.costCenterId || undefined, workLocation: contract.workLocation, salaryLevel: contract.salaryLevel || undefined, admittedAt: day(contract.admittedAt), appointedAt: day(contract.appointedAt), swornAt: day(contract.swornAt), endsAt: day(contract.endsAt), monthlyHours: contract.monthlyHours, salary: row.after, details: contract.details, reason: input.reason, effectiveFrom: day(input.effectiveFrom) }), true));
    }
    for (const contract of updatedContracts) await assertPositionPlanForContract(tx, contract, input.effectiveFrom);
    await enqueueHrIntegration(tx, { sourceKey: `REAJUSTE:${input.batchKey}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "REAJUSTE_CONTRATUAL", payload: { request, requestHash, previewHash, rows, actorId } });
    return { rows: json(rows), previewHash, applied: true, reused: false };
  }, { timeoutMs: 60000 });
}

export async function changeContractsCollectively(db: DatabaseConnection, actorId: string, raw: unknown) {
  const changesSchema = z.object({ regimeId: z.string().min(1).optional(), roleId: z.string().min(1).optional(), departmentId: z.string().min(1).nullable().optional(), costCenterId: z.string().min(1).nullable().optional(), workLocation: z.string().trim().min(1).max(200).optional(), salaryLevel: z.string().trim().min(1).nullable().optional(), salary: money.refine(value => D(value).gte(0)).optional(), monthlyHours: z.number().int().min(1).max(744).optional(), endsAt: optionalDate.optional() }).strict().refine(value => Object.keys(value).length > 0, "Selecione ao menos um campo para alteração.");
  const input = z.object({ batchKey: z.string().min(1).max(160), contractIds: z.array(z.string().min(1)).min(1), effectiveFrom: date, reason: z.string().trim().min(3).max(2000), changes: changesSchema, mode: z.enum(["PREVIA", "APLICAR"]), previewHash: z.string().default("") }).strict().parse(raw);
  const ids = [...new Set(input.contractIds)].sort();
  const request = { batchKey: input.batchKey, contractIds: ids, effectiveFrom: input.effectiveFrom, reason: input.reason, changes: input.changes };
  const requestHash = createHash("sha256").update(stableJson(request)).digest("hex");
  return withDatabaseTransaction(db, async tx => {
    await lock(tx, `collective-contract:${input.batchKey}`);
    const previous = await findHrIntegrationEvent(tx, `CONTRATOS:LOTE:${input.batchKey}`);
    if (previous) {
      const evidence = previous.payload as { requestHash: string; previewHash: string; rows: JsonValue[] };
      if (evidence.requestHash !== requestHash) throw new Error("Lote de contratos reutilizado com parâmetros diferentes.");
      return { rows: evidence.rows, previewHash: evidence.previewHash, applied: true, reused: true };
    }
    const original = await tx.select().from(hrEmploymentContracts).where(inArray(hrEmploymentContracts.id, ids)).orderBy(asc(hrEmploymentContracts.id));
    if (original.length !== ids.length) throw new Error("Seleção de contratos inválida.");
    for (const employeeId of [...new Set(original.map(contract => contract.employeeId))].sort()) await lock(tx, `employee:${employeeId}`);
    for (const id of ids) await lock(tx, `contract:${id}`);
    const contracts = await tx.select().from(hrEmploymentContracts).where(inArray(hrEmploymentContracts.id, ids)).orderBy(asc(hrEmploymentContracts.id));
    const rows = contracts.map(contract => ({ id: contract.id, registration: contract.registration, version: contract.version, before: Object.fromEntries(Object.keys(input.changes).map(key => [key, json(Reflect.get(contract, key))])), after: json(input.changes) }));
    const previewHash = createHash("sha256").update(stableJson({ request, rows })).digest("hex");
    if (input.mode === "PREVIA") return { rows: json(rows), previewHash, applied: false, reused: false };
    if (input.previewHash !== previewHash) throw new Error("Confira uma prévia atualizada; seleção, vigência ou dados foram alterados.");
    const day = (value: Date | null) => value?.toISOString().slice(0, 10) || "";
    const updatedContracts: Awaited<ReturnType<typeof saveEmploymentContractInTransaction>>[] = [];
    await lockPositionPlans(tx, [...contracts.map(contract => contract.regimeId), ...(input.changes.regimeId ? [input.changes.regimeId] : [])]);
    for (const contract of contracts) {
      const updated = { ...contract, ...input.changes };
      updatedContracts.push(await saveEmploymentContractInTransaction(tx, actorId, hrContractInputSchema.parse({ id: contract.id, version: contract.version, employeeId: contract.employeeId, registration: contract.registration, admittedAt: day(contract.admittedAt), appointedAt: day(contract.appointedAt), swornAt: day(contract.swornAt), endsAt: day(updated.endsAt), regimeId: updated.regimeId, roleId: updated.roleId, departmentId: updated.departmentId || undefined, costCenterId: updated.costCenterId || undefined, workLocation: updated.workLocation, salaryLevel: updated.salaryLevel || undefined, monthlyHours: updated.monthlyHours, salary: D(updated.salary).toFixed(2), details: contract.details, effectiveFrom: day(input.effectiveFrom), reason: input.reason }), true));
    }
    for (const contract of updatedContracts) await assertPositionPlanForContract(tx, contract, input.effectiveFrom);
    await enqueueHrIntegration(tx, { sourceKey: `CONTRATOS:LOTE:${input.batchKey}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "ALTERACAO_CONTRATUAL_COLETIVA", payload: { request, requestHash, previewHash, rows, actorId } });
    return { rows: json(rows), previewHash, applied: true, reused: false };
  }, { timeoutMs: 60000 });
}

export async function savePayrollMovement(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ contractId: z.string().min(1), sourceKey: z.string().min(1).max(160), rubricCode: z.string().min(1), startsAt: date, endsAt: optionalDate, amount: money, reference: z.string().max(200).optional(), notes: z.string().min(3).max(2000) }).strict().parse(raw);
  if (input.endsAt && input.endsAt < input.startsAt) throw new Error("Vigência inválida.");
  return withDatabaseTransaction(db, async tx => {
    await lock(tx, `contract:${input.contractId}`);
    const contract = await requireEmploymentContract(tx, input.contractId);
    if (contract.status !== "ATIVO") throw new Error("Contrato inativo.");
    const regime = await requireEmploymentRegime(tx, contract.regimeId);
    const rules = await requirePayrollCalculationRules(tx, regime.ruleSetId);
    const rubric = rules.rubrics.find(row => row.code === input.rubricCode);
    if (!rubric) throw new Error("Rubrica ativa não encontrada no conjunto de regras do vínculo.");
    const [replay] = await tx.select().from(hrMovements).where(eq(hrMovements.sourceKey, input.sourceKey)).limit(1);
    if (replay) {
      if (replay.contractId !== input.contractId || replay.rubricCode !== input.rubricCode || !replay.amount.eq(input.amount) || replay.startsAt.getTime() !== input.startsAt.getTime() || replay.endsAt?.getTime() !== input.endsAt?.getTime() || replay.notes !== input.notes || (replay.reference ?? "") !== (input.reference ?? "")) throw new Error("Chave de movimento reutilizada com dados diferentes.");
      return replay;
    }
    const [movement] = await tx.insert(hrMovements).values({ ...input, amount: D(input.amount), actorId }).returning();
    return movement;
  });
}

export async function calculatePayrollRun(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ payrollId: z.string().min(1), requestKey: z.string().min(1).max(160), mode: z.enum(["SIMULACAO", "OFICIAL"]), scope: z.enum(["DEMONSTRACAO", "HOMOLOGACAO", "PRODUCAO"]), contractIds: z.array(z.string().min(1)).min(1), specialParameters: pocSpecialParametersSchema.optional(), monthlyProration: z.boolean().optional() }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    await lock(tx, `payroll:${input.payrollId}`);
    await tx.execute(sql`SELECT id FROM "Payroll" WHERE id=${input.payrollId} FOR UPDATE`);
    const payroll = await requirePayroll(tx, input.payrollId);
    const [previousRun] = await tx.select().from(hrPayrollRuns).where(eq(hrPayrollRuns.requestKey, input.requestKey)).limit(1);
    const replay = previousRun ? { ...previousRun, statements: await tx.select().from(hrPayrollStatements).where(eq(hrPayrollStatements.runId, previousRun.id)) } : null;
    if (replay) {
      const selection = (replay.snapshot as { contractIds?: string[] }).contractIds ?? [];
      if (Boolean((replay.snapshot as { monthlyProration?: boolean }).monthlyProration) !== Boolean(input.monthlyProration)) throw new Error("Solicitação repetida com política de rateio diferente.");
      if (replay.payrollId !== input.payrollId || replay.mode !== input.mode || replay.scope !== input.scope || selection.slice().sort().join() !== [...new Set(input.contractIds)].sort().join() || stableJson((replay.snapshot as { specialParameters?: unknown }).specialParameters ?? null) !== stableJson(input.specialParameters ?? null)) throw new Error("Solicitação de cálculo repetida com seleção diferente.");
      return replay;
    }
    if (["Fechada", "Paga"].includes(payroll.status) && input.mode === "OFICIAL") throw new Error("Folha fechada/paga não pode ser recalculada.");
    const special = payroll.type !== "Mensal";
    if (input.monthlyProration && (special || input.scope !== "DEMONSTRACAO")) throw new Error("Rateio civil estimado exige folha Mensal em DEMONSTRACAO.");
    if (special && (!input.specialParameters || input.scope !== "DEMONSTRACAO")) throw new Error("Folha especial neste fluxo exige parâmetros POC e escopo DEMONSTRACAO.");
    if (!special && input.specialParameters) throw new Error("Parâmetros especiais não se aplicam à folha Mensal.");
    const period = payrollPeriod(payroll.competence);
    const canonicalItems = await listCanonicalPayrollItems(tx, payroll.id);
    const ids = [...new Set(input.contractIds)].sort();
    for (const id of ids) await lock(tx, `contract:${id}`);
    const storedContracts = [];
    for (const id of ids) storedContracts.push(await requireEmploymentWorkspace(tx, id, period));
    const contracts = storedContracts.map(contract => {
      const { revisions, ...record } = contract;
      const segments = input.monthlyProration ? resolveMonthlyContractSegments(record, revisions, period) : null;
      const resolved = segments ? segments[segments.length - 1] : resolveContractRevision(record, revisions, period);
      return { ...resolved.contract, revisionId: resolved.revisionId, monthlySegments: segments };
    }).filter(contract => contract.status === "ATIVO" && contract.admittedAt <= period.end && (!contract.endsAt || contract.endsAt >= period.start));
    if (contracts.length !== ids.length) throw new Error("Seleção contém vínculo inválido ou fora da competência.");
    for (const contract of contracts) await assertServiceTimeAllowanceCurrent(tx, contract.id, payroll.competence);
    const regimeRows = await tx.select().from(hrEmploymentRegimes).where(and(inArray(hrEmploymentRegimes.id, contracts.map(c => c.regimeId)), eq(hrEmploymentRegimes.isActive, true)));
    const schemes = await listSocialSecuritySchemes(tx, regimeRows.flatMap(row => row.socialSecuritySchemeId ? [row.socialSecuritySchemeId] : []));
    const regimes = regimeRows.map(row => ({ ...row, socialSecurityScheme: schemes.find(scheme => scheme.id === row.socialSecuritySchemeId) ?? null }));
    const sets = new Set(regimes.map(r => r.ruleSetId));
    if (sets.size !== 1) throw new Error("Selecione vínculos do mesmo conjunto de regras.");
    const ruleSet = await requirePayrollCalculationRules(tx, [...sets][0]);
    if (ruleSet.status !== "ATIVA" || ruleSet.scope !== input.scope || ruleSet.effectiveFrom > period.start || (ruleSet.effectiveUntil && ruleSet.effectiveUntil < period.end) || !ruleSet.calculationPolicy || !ruleSet.rubrics.length) throw new Error("Regras ativas e política devem cobrir toda a competência e o escopo selecionado.");
    if (input.scope === "PRODUCAO" && (ruleSet.isDemo || !ruleSet.approvedAt || ruleSet.approvedAt > new Date() || !ruleSet.legalReference)) throw new Error("Produção exige regras oficiais aprovadas, com fundamento legal.");
    const prorationRule = ruleSet.rules.find(rule => rule.code === "RATEIO_MENSAL_CIVIL");
    if (input.monthlyProration) {
      if (!ruleSet.isDemo) throw new Error("Rateio civil POC exige conjunto demonstrativo.");
      monthlyProrationPolicySchema.parse(prorationRule?.value);
    }
    if (special) {
      if (!ruleSet.isDemo) throw new Error("Folhas especiais POC exigem conjunto demonstrativo.");
      pocSpecialPolicySchema.parse(ruleSet.rules.find(rule => rule.code === "FOLHAS_ESPECIAIS_POC")?.value);
      if (canonicalItems.length) throw new Error("Folha especial POC deve usar folha própria sem origens legadas/SST.");
    }
    if (input.specialParameters?.sourceRunId && input.specialParameters.previousAdvance !== "0.00" && !D(input.specialParameters.previousAdvance).isZero()) throw new Error("Origem automática não pode ser combinada com abatimento manual.");
    const history = input.specialParameters?.sourceRunId ? await loadSpecialPayrollHistory(tx, { sourceRunId: input.specialParameters.sourceRunId, payrollId: payroll.id, payrollType: payroll.type, competence: payroll.competence, contractIds: ids, ruleSetId: ruleSet.id, scope: input.scope }) : null;
    const linkedDifference = payroll.type === "Diferença 13º" && Boolean(history);
    if (input.specialParameters?.vacationEntryIds && payroll.type !== "Férias") throw new Error("Reservas de férias vinculadas exigem folha Férias.");
    const vacationReservations = input.specialParameters?.vacationEntryIds ? await loadVacationPayrollReservations(tx, { entries: input.specialParameters.vacationEntryIds, contractIds: ids, competence: payroll.competence }) : null;
    const pensionRule = ruleSet.rules.find(rule => rule.code === "PENSOES_FOLHA");
    const pensionPolicy = pensionRule ? payrollPensionPolicySchema.parse(pensionRule.value) : null;
    const beneficiaries = pensionPolicy ? await tx.select({ id: people.id, fullName: people.fullName, cpf: people.cpf }).from(people).where(inArray(people.id, [...new Set(pensionPolicy.entries.map(entry => entry.beneficiaryPersonId))])) : [];
    if (pensionPolicy && beneficiaries.length !== new Set(pensionPolicy.entries.map(entry => entry.beneficiaryPersonId)).size) throw new Error("Beneficiário de pensão não encontrado no cadastro central.");
    if (ruleSet.calculationPolicy.roundingMode !== "HALF_UP" || ruleSet.calculationPolicy.roundingScale !== 2) throw new Error("Este motor requer arredondamento HALF_UP com duas casas; publique política compatível.");
    if (!special) await assertConsignmentSchedulePosted(tx, ids, period.start, input.scope, ruleSet.rules.some(rule => rule.code === "MARGEM_CONSIGNAVEL"));
    const calculated = contracts.map(contract => {
      if (!contract.employee.person || !contract.employee.isActive) throw new Error("Vínculo sem pessoa física/servidor ativo.");
      const regime = regimes.find(r => r.id === contract.regimeId);
      if (!regime) throw new Error("Regime inativo.");
      const start = new Date(Math.max(period.start.getTime(), contract.admittedAt.getTime()));
      const end = new Date(Math.min(period.end.getTime(), contract.endsAt?.getTime() ?? period.end.getTime()));
      const fullMonth = start.getTime() === period.start.getTime() && end.getTime() === period.end.getTime();
      const days = fullMonth ? 30 : Math.min(30, Math.max(0, end.getUTCDate() - start.getUTCDate() + 1));
      const movements: Record<string, Decimal> = {};
      for (const movement of contract.movements) movements[movement.rubricCode] = (movements[movement.rubricCode] ?? D(0)).add(movement.amount);
      for (const item of canonicalItems.filter(i => i.employeeId === contract.employeeId)) {
        const origin = item.sstBenefitOrigin ?? item.sstLeaveOrigin;
        const details = contract.details as Record<string, unknown>;
        if (!origin || item.valueDecimal === null) throw new Error("Lançamento legado sem origem/Decimal exige conciliação antes do cálculo.");
        if (details.functionalPeriodId !== origin.functionalPeriodId) throw new Error("Informe o período funcional canônico do contrato para conciliar origens SST sem inferência de vínculo.");
        const rubric = ruleSet.rubrics.find(r => r.id === origin.rubricId);
        if (!rubric || rubric.calculationMethod !== "MANUAL") throw new Error("Origem SST exige rubrica MANUAL ativa do mesmo conjunto.");
        movements[rubric.code] = (movements[rubric.code] ?? D(0)).add(item.valueDecimal);
      }
      const source = history?.get(contract.id) ?? null;
      if (linkedDifference && source?.schemeCode !== regime.socialSecurityScheme?.code) throw new Error("Diferença de 13º com mudança previdenciária exige conciliação específica.");
      const vacation = vacationReservations?.get(contract.id) ?? null;
      const prepared = special ? preparePocSpecialRubrics({ payrollType: payroll.type, competence: payroll.competence, salary: contract.salary, admittedAt: contract.admittedAt, endsAt: contract.endsAt, parameters: vacation ? { ...input.specialParameters!, vacationDays: vacation.days } : input.specialParameters!, rubrics: ruleSet.rubrics, history: source ?? undefined }) : null;
      const prorated = contract.monthlySegments ? calculateProratedMonthlyRubrics({ segments: contract.monthlySegments, period, rubrics: ruleSet.rubrics, movements, policy: prorationRule!.value }) : null;
      const result = prorated?.result ?? calculateContractRubrics({ salary: contract.salary, monthlyHours: contract.monthlyHours, days, movements: prepared?.movements ?? movements, rubrics: prepared?.rubrics ?? ruleSet.rubrics });
      if (prepared) for (const item of result.items) item.formula = prepared.memory.formulas[item.code];
      return { contract, regime, result, days: prorated ? prorated.memory.calendarDays : days, proration: prorated?.memory ?? null, specialMemory: prepared ? { ...prepared.memory, history: source, vacationReservations: vacation, rightsConsumed: Boolean(vacation), rightsConsumptionOrigin: vacation ? "RESERVAS_JA_DEBITADAS_NO_LEDGER" : null } : null, pensions: [] as (ReturnType<typeof calculatePayrollPensions>[number] & { beneficiary: typeof beneficiaries[number] })[] };
    });
    const samePersons = [...new Set(contracts.map(contract => contract.employee.personId).filter((id): id is string => Boolean(id)))];
    const otherEmployeeRows = await tx.select({ id: employees.id }).from(employees).where(inArray(employees.personId, samePersons));
    const otherContracts = await listEmploymentContracts(tx, and(notInArray(hrEmploymentContracts.id, ids), inArray(hrEmploymentContracts.employeeId, otherEmployeeRows.map(row => row.id))));
    const omitted = otherContracts.some(contract => {
      if (!contract.revisions.some(revision => revision.effectiveFrom <= period.end)) return false;
      if (input.monthlyProration) return resolveMonthlyContractSegments(contract, contract.revisions, period, true).length > 0;
      const resolved = resolveContractRevision(contract, contract.revisions, period).contract;
      return resolved.status === "ATIVO" && resolved.admittedAt <= period.end && (!resolved.endsAt || resolved.endsAt >= period.start);
    });
    if (omitted) throw new Error("Inclua os demais contratos da mesma pessoa física para calcular tetos e retenções sem duplicar benefícios fiscais.");
    const familyRule = ruleSet.rules.find(rule => rule.code === "SALARIO_FAMILIA");
    const familyMemory = new Map<string, unknown>();
    const irrfDependentMemory = new Map<string, unknown>();
    const incomeTaxMemory = new Map<string, ReturnType<typeof calculateIncomeTax>>();
    if (familyRule && !special) {
      const policy = familyWagePolicySchema.parse(familyRule.value);
      const rubric = ruleSet.rubrics.find(rubric => rubric.code === policy.rubricCode);
      if (!rubric || rubric.type !== "PROVENTO" || rubric.calculationMethod !== "MANUAL" || rubric.incidences.some(incidence => incidence.isIncluded)) throw new Error("Salário-família exige rubrica MANUAL de provento sem incidências; configure a política explicitamente.");
      for (const personId of samePersons) {
        const rows = calculated.filter(row => row.contract.employee.personId === personId);
        if (rows.some(row => row.contract.movements.some(movement => movement.rubricCode === policy.rubricCode)) || canonicalItems.some(item => rows.some(row => row.contract.employeeId === item.employeeId) && (item.sstBenefitOrigin?.rubricId === rubric.id || item.sstLeaveOrigin?.rubricId === rubric.id))) throw new Error("Salário-família com origem manual exige conciliação; não duplicar com cálculo automático.");
        const assessment = await assessPayrollDependents(tx, [...new Set(rows.map(row => row.contract.employeeId))], "familyWage", policy.eligibility, period);
        const income = rows.reduce((total, row) => total.add(row.result.gross), D(0));
        const incomeEligible = income.lte(policy.incomeLimit);
        const factor = policy.proration === "INTEGRAL" ? D(1) : D(Math.max(...rows.map(row => row.days))).div(30);
        const value = incomeEligible ? D(policy.quota).mul(assessment.eligibleCount).mul(factor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : D(0);
        const weights = rows.map(row => policy.allocationBasis === "DIAS" ? D(row.days) : Decimal.max(0, row.result.gross));
        const shares = value.isZero() ? rows.map(() => D(0)) : allocatePayrollAmount(value, weights);
        rows.forEach((row, index) => {
          const item = row.result.items.find(item => item.code === rubric.code)!;
          if (!D(item.value).isZero()) throw new Error("Rubrica de salário-família já possui valor; concilie a origem antes da apuração automática.");
          item.value = shares[index].toFixed(2); item.method = "SALARIO_FAMILIA";
          row.result.gross = row.result.gross.add(shares[index]);
        });
        familyMemory.set(personId, { ...assessment, policy, income: income.toFixed(2), incomeEligible, factor: factor.toString(), amount: value.toFixed(2), allocations: rows.map((row, index) => ({ contractId: row.contract.id, value: shares[index].toFixed(2) })) });
      }
    }
    // Apply the social security ceiling once per PF and scheme, then reconcile residual cents.
    const groups = new Map<string, typeof calculated>();
    for (const row of calculated) {
      const scheme = row.regime.socialSecurityScheme;
      if (!scheme || !scheme.isActive) throw new Error("Regime exige esquema previdenciário ativo.");
      const key = `${row.contract.employee.personId}:${scheme.id}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    for (const group of groups.values()) {
      const scheme = group[0].regime.socialSecurityScheme!;
      const bases = group.map(row => row.result.bases[scheme.regime] ?? D(0));
      const priorBase = linkedDifference ? group.reduce((total, row) => total.add(history!.get(row.contract.id)!.bases[scheme.regime] ?? 0), D(0)) : D(0);
      const priorContribution = linkedDifference ? group.reduce((total, row) => total.add(history!.get(row.contract.id)!.socialContribution), D(0)) : D(0);
      const base = bases.reduce((a, b) => a.add(b), D(0));
      const contribution = calculateContribution(base.add(priorBase), scheme.bands, scheme.employeeCalculationMethod, scheme.ceilingValue).sub(priorContribution);
      if (contribution.lt(0)) throw new Error("Diferença previdenciária negativa exige restituição/compensação própria.");
      const shares = allocatePayrollAmount(contribution, bases);
      const employerBasisRule = ruleSet.rules.find(rule => rule.code === `PREVIDENCIA_BASE_PATRONAL_${scheme.code}`);
      const employerRate = (scheme.employerContributionRate ?? D(0)).add(scheme.actuarialContributionRate ?? D(0));
      if (employerRate.lt(0) || employerRate.gt(100)) throw new Error("Alíquota patronal inválida.");
      if (employerRate.gt(0) && !employerBasisRule) throw new Error("Configure a base patronal separadamente do teto de contribuição do servidor.");
      const employerBasis = employerBasisRule ? z.enum(["SEM_TETO", "TETO_SERVIDOR"]).parse(employerBasisRule.value) : "SEM_TETO";
      const employerBase = employerBasis === "TETO_SERVIDOR" && scheme.ceilingValue !== null ? Decimal.min(base.add(priorBase), scheme.ceilingValue) : base.add(priorBase);
      const priorEmployer = linkedDifference ? group.reduce((total, row) => total.add(history!.get(row.contract.id)!.employer), D(0)) : D(0);
      const employerAmount = employerBase.mul(employerRate).div(100).toDecimalPlaces(2).sub(priorEmployer);
      if (employerAmount.lt(0)) throw new Error("Diferença patronal negativa exige restituição/compensação própria.");
      const employer = allocatePayrollAmount(employerAmount, bases);
      group.forEach((row, index) => {
        row.result.deductions = row.result.deductions.add(shares[index]);
        row.result.employer = employer[index];
        row.result.items.push({ code: `PREVIDENCIA_${scheme.code}`, name: scheme.name, type: "DESCONTO", value: shares[index].toFixed(2), method: scheme.employeeCalculationMethod, formula: null, base: scheme.regime, rate: null, fixed: null, movement: "0.00" });
      });
    }
    const postPensions = (phase: "ANTES_IRRF" | "APOS_IRRF") => {
      if (!pensionPolicy) return;
      for (const row of calculated) {
        const socialContribution = row.result.items.filter(item => item.code.startsWith("PREVIDENCIA_")).reduce((total, item) => total.add(item.value), D(0));
        const incomeTax = row.result.items.filter(item => item.code === "IRRF").reduce((total, item) => total.add(item.value), D(0));
        const assessments = calculatePayrollPensions(pensionPolicy, { contractId: row.contract.id, payrollType: payroll.type, start: period.start, end: period.end, gross: row.result.gross, socialContribution, incomeTax, phase });
        for (const assessment of assessments) {
          const code = `PENSAO_${assessment.id}`;
          if (row.result.items.some(item => item.code === code && !D(item.value).isZero())) throw new Error("Pensão já possui origem manual; concilie antes de calcular automaticamente.");
          row.result.deductions = row.result.deductions.add(assessment.amount);
          row.result.items.push({ code, name: `Pensão · ${beneficiaries.find(person => person.id === assessment.beneficiaryPersonId)!.fullName}`, type: "DESCONTO", value: assessment.amount, method: assessment.method, formula: assessment.method === "FIXO" ? "VALOR_JUDICIAL_FIXO" : "BASE_JUDICIAL * PERCENTUAL / 100", base: assessment.basis, rate: assessment.method === "PERCENTUAL" ? assessment.value : null, fixed: assessment.method === "FIXO" ? assessment.value : null, movement: "0.00" });
          row.pensions.push({ ...assessment, beneficiary: beneficiaries.find(person => person.id === assessment.beneficiaryPersonId)! });
        }
      }
    };
    postPensions("ANTES_IRRF");
    // Do not silently omit IRRF. Municipal approval must supply the progressive table.
    const irrfRule = ruleSet.rules.find(r => r.code === "IRRF_FAIXAS");
    const irrfBases = calculated.map(row => row.result.bases.IRRF ?? D(0));
    if (irrfBases.some(base => base.gt(0))) {
      if (!irrfRule || !Array.isArray(irrfRule.value)) throw new Error("Configure IRRF_FAIXAS antes de calcular bases sujeitas ao IRRF.");
      const bands = z.array(incomeTaxBandSchema).parse(irrfRule.value);
      const persons = new Set(calculated.map(row => row.contract.employee.personId));
      for (const person of persons) {
        const rows = calculated.filter(row => row.contract.employee.personId === person);
        const originalBases = rows.map(row => Decimal.max(D(0), row.result.bases.IRRF ?? D(0)));
        const priorIncome = linkedDifference ? rows.reduce((total, row) => total.add(history!.get(row.contract.id)!.bases.IRRF ?? 0), D(0)) : D(0);
        const originalBase = originalBases.reduce((a, b) => a.add(b), D(0)).add(priorIncome);
        const eligibilityRule = ruleSet.rules.find(rule => rule.code === "DEPENDENTES_IRRF");
        const employeeIds = [...new Set(rows.map(row => row.contract.employeeId))];
        const assessment = eligibilityRule ? await assessPayrollDependents(tx, employeeIds, "irrfDependent", eligibilityRule.value, period) : null;
        if (assessment && person) irrfDependentMemory.set(person, assessment);
        const dependentCount = assessment ? assessment.eligibleCount : (await tx.select({ id: dependents.id }).from(dependents).where(and(inArray(dependents.employeeId, employeeIds), eq(dependents.irrfDependent, true)))).length;
        const deductionRule = ruleSet.rules.find(rule => rule.code === "IRRF_DEDUCAO_DEPENDENTE");
        if (dependentCount && !deductionRule) throw new Error("Dependentes de IRRF exigem IRRF_DEDUCAO_DEPENDENTE configurada.");
        const dependentDeduction = deductionRule ? D(z.union([z.string(), z.number()]).parse(deductionRule.value)).mul(dependentCount) : D(0);
        const socialDeduction = rows.reduce((total, row) => total.add(row.result.items.filter(i => i.code.startsWith("PREVIDENCIA_")).reduce((a, b) => a.add(b.value), D(0))).add(linkedDifference ? history!.get(row.contract.id)!.socialContribution : 0), D(0));
        const pensionDeduction = rows.reduce((total, row) => total.add(row.pensions.filter(pension => pension.deductFromIncomeTax).reduce((sum, pension) => sum.add(pension.amount), D(0))).add(linkedDifference ? history!.get(row.contract.id)!.pensionIncomeTaxDeduction : 0), D(0));
        const simplifiedRule = ruleSet.rules.find(rule => rule.code === "IRRF_DEDUCAO_SIMPLIFICADA");
        const simplified = simplifiedRule ? D(z.union([z.string(), z.number()]).parse(simplifiedRule.value)) : D(0);
        if (dependentDeduction.lt(0) || simplified.lt(0)) throw new Error("Deduções IRRF negativas na configuração.");
        const reductionRule = ruleSet.rules.find(rule => rule.code === "IRRF_REDUCAO_MENSAL");
        const rra = payroll.type === "RRA" ? input.specialParameters!.rraMonths : undefined;
        const taxMemory = calculateIncomeTax({ income: originalBase, legalDeductions: dependentDeduction.add(socialDeduction).add(pensionDeduction), simplifiedDeduction: rra ? "0" : simplified, bands, referenceDate: period.end.toISOString().slice(0, 10), reductionPolicy: ["Mensal", "Complementar", "Férias"].includes(payroll.type) ? reductionRule?.value : undefined, rraMonths: rra });
        if (person) incomeTaxMemory.set(person, taxMemory);
        const taxable = D(taxMemory.base);
        const bases = allocatePayrollAmount(taxable, originalBases);
        const priorTax = linkedDifference ? rows.reduce((total, row) => total.add(history!.get(row.contract.id)!.incomeTax), D(0)) : D(0);
        const tax = D(taxMemory.tax).sub(priorTax);
        if (tax.lt(0)) throw new Error("Diferença IRRF negativa exige restituição/compensação própria.");
        const shares = allocatePayrollAmount(tax, bases);
        rows.forEach((row, index) => {
          row.result.deductions = row.result.deductions.add(shares[index]);
          row.result.items.push({ code: "IRRF", name: "Imposto de Renda", type: "DESCONTO", value: shares[index].toFixed(2), method: "PROGRESSIVA", formula: null, base: "IRRF", rate: null, fixed: null, movement: "0.00" });
        });
      }
    }
    const fgtsRate = ruleSet.rules.find(rule => rule.code === "FGTS_ALIQUOTA");
    for (const row of calculated) {
      const fgtsBase = row.result.bases.FGTS ?? D(0);
      if (fgtsBase.gt(0)) {
        if (!fgtsRate) throw new Error("Base FGTS exige FGTS_ALIQUOTA configurada.");
        const rate = D(z.union([z.string(), z.number()]).parse(fgtsRate.value));
        if (rate.lt(0) || rate.gt(100)) throw new Error("Alíquota FGTS inválida.");
        const amount = fgtsBase.mul(rate).div(100).toDecimalPlaces(2);
        row.result.employer = row.result.employer.add(amount);
        row.result.items.push({ code: "FGTS", name: "FGTS", type: "INFORMATIVA", value: amount.toFixed(2), method: "PERCENTUAL", formula: null, base: "FGTS", rate: rate.toString(), fixed: null, movement: "0.00" });
      }
      row.result.net = row.result.gross.sub(row.result.deductions);
      if (row.result.net.lt(0) && ruleSet.calculationPolicy.negativeNetPayPolicy !== "PERMITIR") throw new Error(`Líquido negativo em ${row.contract.registration}.`);
    }
    const marginRule = ruleSet.rules.find(rule => rule.code === "MARGEM_CONSIGNAVEL");
    const margins = new Map<string, ReturnType<typeof calculateConsignmentMargin>>();
    if (marginRule && !special) {
      const rate = ruleSet.calculationPolicy.maxConsignmentMarginRate;
      if (rate === null) throw new Error("Configure o percentual máximo da margem consignável na política de cálculo.");
      for (const personId of samePersons) {
        const rows = calculated.filter(row => row.contract.employee.personId === personId);
        const margin = calculateConsignmentMargin(rows.map(row => ({ contractId: row.contract.id, items: row.result.items })), marginRule.value, rate);
        if (D(margin.excess).gt(0)) throw new Error(`Descontos consignados excedem a margem da pessoa física em R$ ${margin.excess}. Concilie antes do cálculo.`);
        margins.set(personId, margin);
      }
    }
    postPensions("APOS_IRRF");
    const sum = (key: "gross" | "deductions" | "net" | "employer") => calculated.reduce((total, row) => total.add(row.result[key]), D(0));
    const messagesRule = ruleSet.rules.find(rule => rule.code === "MENSAGENS_RECIBO");
    if (canonicalItems.some(item => !contracts.some(c => c.employeeId === item.employeeId))) throw new Error("Inclua todos os servidores com origens lançadas nesta folha.");
    if (new Set(contracts.map(c => c.employeeId)).size !== contracts.length && canonicalItems.length) throw new Error("Origens por servidor exigem alocação explícita entre vínculos antes deste cálculo.");
    const [run] = await tx.insert(hrPayrollRuns).values({ payrollId: input.payrollId, requestKey: input.requestKey, mode: input.mode, scope: input.scope, ruleSetId: ruleSet.id, actorId, snapshot: json({ payroll, ruleSet, contractIds: ids, canonicalItems, monthlyProration: input.monthlyProration ?? false, specialParameters: input.specialParameters ?? null, contractVersions: contracts.map(c => ({ id: c.id, version: c.version })) }), gross: sum("gross"), deductions: sum("deductions"), net: sum("net"), employer: sum("employer") }).returning();
    const statements = await tx.insert(hrPayrollStatements).values(calculated.map(row => ({ runId: run.id, contractId: row.contract.id, gross: row.result.gross, deductions: row.result.deductions, net: row.result.net, employer: row.result.employer, snapshot: json({ contract: row.contract, regime: row.regime, days: row.days, items: row.result.items, bases: row.result.bases, pensions: row.pensions, proration: row.proration, incomeTax: incomeTaxMemory.get(row.contract.employee.personId!) ?? null, specialPayroll: row.specialMemory, messages: messagesRule ? selectReceiptMessages(messagesRule.value, messagesRule.id, { contractId: row.contract.id, regimeId: row.regime.id, payrollType: payroll.type, period }) : [], consignmentMargin: margins.get(row.contract.employee.personId!) ?? null, familyWage: familyMemory.get(row.contract.employee.personId!) ?? null, irrfDependents: irrfDependentMemory.get(row.contract.employee.personId!) ?? null }) }))).returning();
    return { ...run, statements };
  }, { timeoutMs: 60000 });
}

export async function closePayrollRun(db: DatabaseConnection, actorId: string, runId: string) {
  return withDatabaseTransaction(db, async tx => {
    const run = await requirePayrollRun(tx, runId);
    await lock(tx, `payroll:${run.payrollId}`);
    await tx.execute(sql`SELECT id FROM "Payroll" WHERE id=${run.payrollId} FOR UPDATE`);
    const current = await requirePayrollRun(tx, run.id);
    if (current.status === "FECHADA") return current;
    if (current.mode !== "OFICIAL" || current.status !== "CALCULADA") throw new Error("Somente cálculo oficial pode ser fechado.");
    const payroll = await requirePayroll(tx, run.payrollId);
    if (["Fechada", "Paga"].includes(payroll.status)) throw new Error("Folha já consolidada por outra execução.");
    const snapshot = current.snapshot as { canonicalItems?: unknown; contractVersions?: { id: string; version: number }[] };
    const canonicalItems = await listCanonicalPayrollItems(tx, payroll.id);
    if (stableJson(canonicalItems) !== stableJson(snapshot.canonicalItems)) throw new Error("Origens contratuais mudaram após o cálculo. Recalcule antes de fechar.");
    for (const version of snapshot.contractVersions ?? []) {
      await lock(tx, `contract:${version.id}`);
      const storedContract = await requireEmploymentHolderHistory(tx, version.id);
      const prorationEnabled = Boolean((current.snapshot as { monthlyProration?: boolean }).monthlyProration);
      const periodForRevision = payrollPeriod(payroll.competence);
      const segments = prorationEnabled ? resolveMonthlyContractSegments(storedContract, storedContract.revisions, periodForRevision) : null;
      const contract = segments ? segments.at(-1)!.contract : resolveContractRevision(storedContract, storedContract.revisions, periodForRevision).contract;
      await tx.execute(sql`SELECT id FROM "Employee" WHERE id=${contract.employeeId} FOR SHARE`);
      await assertServiceTimeAllowanceCurrent(tx, contract.id, payroll.competence);
      const employee = await requireEmployeeWithPerson(tx, contract.employeeId);
      if (!employee.isActive || contract.status !== "ATIVO") throw new Error("Servidor/contrato inativado após o cálculo. Recalcule a seleção antes de fechar.");
      if (contract.version !== version.version) throw new Error("Contrato mudou após o cálculo. Recalcule antes de fechar.");
      const statement = await requirePayrollStatement(tx, runId, version.id);
      if (segments) {
        const originalSegments = (statement.snapshot as unknown as { contract: { monthlySegments: typeof segments } }).contract.monthlySegments;
        const normalized = (values: typeof segments) => values.map(segment => ({ revisionId: segment.revisionId, start: segment.start, end: segment.end, calendarDays: segment.calendarDays, version: segment.contract.version, salary: segment.contract.salary.toString(), monthlyHours: segment.contract.monthlyHours, regimeId: segment.contract.regimeId, roleId: segment.contract.roleId, departmentId: segment.contract.departmentId, costCenterId: segment.contract.costCenterId, workLocation: segment.contract.workLocation, details: segment.contract.details }));
        // Stored JSON has string salary/dates; normalize through JSON before comparison.
        if (stableJson(normalized(segments)) !== stableJson(normalized(originalSegments))) throw new Error("Vigências do rateio mudaram após o cálculo. Recalcule antes de fechar.");
      }
      const contractSnapshot = (statement.snapshot as { contract: { movements: unknown } }).contract;
      const dependentsSnapshot = statement.snapshot as { familyWage?: unknown; irrfDependents?: unknown };
      if (dependentsSnapshot.familyWage) {
        const family = familyWageSnapshotSchema.parse(dependentsSnapshot.familyWage);
        const currentAssessment = await assessPayrollDependents(tx, [contract.employeeId], "familyWage", family.policy.eligibility, payrollPeriod(payroll.competence));
        if (stableJson(currentAssessment.memory) !== stableJson(family.memory)) throw new Error("Elegibilidade/documentos de salário-família mudaram após o cálculo. Recalcule antes de fechar.");
      }
      if (dependentsSnapshot.irrfDependents) {
        const originalAssessment = dependentAssessmentSchema.parse(dependentsSnapshot.irrfDependents);
        const currentAssessment = await assessPayrollDependents(tx, [contract.employeeId], "irrfDependent", originalAssessment.policy, payrollPeriod(payroll.competence));
        if (stableJson(currentAssessment.memory) !== stableJson(originalAssessment.memory)) throw new Error("Elegibilidade/documentos de IRRF mudaram após o cálculo. Recalcule antes de fechar.");
      }
      const period = payrollPeriod(payroll.competence);
      const movements = await tx.select().from(hrMovements).where(and(eq(hrMovements.contractId, version.id), lte(hrMovements.startsAt, period.end), or(isNull(hrMovements.endsAt), gte(hrMovements.endsAt, period.start))));
      const normalize = (value: unknown) => stableJson((json(value) as unknown as { id: string }[]).sort((a, b) => a.id.localeCompare(b.id)));
      if (normalize(movements) !== normalize(contractSnapshot.movements)) throw new Error("Movimentos mudaram após o cálculo. Recalcule antes de fechar.");
    }
    const ruleSnapshot = (current.snapshot as { ruleSet: { rules: { code: string; value: unknown }[] } }).ruleSet;
    const originalPensions = ruleSnapshot.rules.find(rule => rule.code === "PENSOES_FOLHA")?.value ?? null;
    const currentPensions = await findActivePayrollRule(tx, current.ruleSetId, "PENSOES_FOLHA");
    if (stableJson(originalPensions) !== stableJson(currentPensions?.value ?? null)) throw new Error("Política de pensões mudou após o cálculo. Recalcule antes de fechar.");
    if ((current.snapshot as { monthlyProration?: boolean }).monthlyProration) {
      const original = ruleSnapshot.rules.find(rule => rule.code === "RATEIO_MENSAL_CIVIL")?.value;
      const active = await findActivePayrollRule(tx, current.ruleSetId, "RATEIO_MENSAL_CIVIL");
      if (stableJson(original ?? null) !== stableJson(active?.value ?? null)) throw new Error("Política de rateio mudou após o cálculo. Recalcule antes de fechar.");
    }
    const parameters = (current.snapshot as { specialParameters?: { sourceRunId?: string; vacationEntryIds?: Record<string, string[]> } }).specialParameters;
    if (parameters?.vacationEntryIds) {
      const reservations = await loadVacationPayrollReservations(tx, { entries: parameters.vacationEntryIds, contractIds: (snapshot.contractVersions ?? []).map(version => version.id), competence: payroll.competence });
      for (const [contractId, memory] of reservations) {
        const statement = await requirePayrollStatement(tx, runId, contractId);
        if (stableJson((statement.snapshot as { specialPayroll: { vacationReservations: unknown } }).specialPayroll.vacationReservations) !== stableJson(memory)) throw new Error("Programação de férias mudou após o cálculo. Recalcule antes de fechar.");
        for (const entry of memory.entries) {
          const sourceKey = `FERIAS:FOLHA:${entry.entryId}`;
          await lock(tx, sourceKey);
          const previous = await findHrIntegrationEvent(tx, sourceKey);
          if (previous && (previous.payload as { runId: string }).runId !== runId) throw new Error("Reserva de férias já conciliada em outra folha fechada.");
          if (!previous) await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: current.scope, eventType: "FERIAS_RESERVA_CONCILIADA_FOLHA", payload: { runId, contractId, actorId, entry, additionalRightsDebit: false } });
        }
      }
    }
    if (parameters?.sourceRunId) {
      const linked = await loadSpecialPayrollHistory(tx, { sourceRunId: parameters.sourceRunId, payrollId: payroll.id, payrollType: payroll.type, competence: payroll.competence, contractIds: (snapshot.contractVersions ?? []).map(version => version.id), ruleSetId: current.ruleSetId, scope: current.scope });
      for (const source of [...linked.values()].sort((a, b) => a.statementId.localeCompare(b.statementId))) {
        const sourceKey = `ESPECIAL:CONSUMO:${payroll.type}:${source.statementId}`;
        await lock(tx, sourceKey);
        const previous = await findHrIntegrationEvent(tx, sourceKey);
        if (previous && (previous.payload as { runId: string }).runId !== runId) throw new Error("Origem especial já utilizada em outra parcela/diferença fechada.");
        if (!previous) await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: current.scope, eventType: "ORIGEM_ESPECIAL_CONCILIADA", payload: { runId, actorId, source } });
      }
    }
    if (payroll.type === "Mensal") await assertConsignmentSchedulePosted(tx, (snapshot.contractVersions ?? []).map(version => version.id), payrollPeriod(payroll.competence).start, current.scope, ruleSnapshot.rules.some(rule => rule.code === "MARGEM_CONSIGNAVEL"));
    const mapping = z.record(z.string(), z.string().min(1)).parse(ruleSnapshot.rules.find(rule => rule.code === "FOLHA_EVENTOS")?.value);
    const statementRows = await tx.select().from(hrPayrollStatements).where(eq(hrPayrollStatements.runId, runId)).orderBy(asc(hrPayrollStatements.id));
    const statements = [];
    for (const row of statementRows) statements.push({ ...row, contract: await requireEmploymentContract(tx, row.contractId) });
    for (const statement of statements) {
      const items = (statement.snapshot as { items: { code: string; name: string; type: string; value: string }[] }).items;
      for (const item of items) {
        if (D(item.value).isZero()) continue;
        const eventId = mapping[item.code];
        if (!eventId) throw new Error(`Configure FOLHA_EVENTOS para a rubrica ${item.code}.`);
        const [event] = await tx.select().from(payrollEvents).where(eq(payrollEvents.id, eventId)).limit(1);
        if (!event) throw new Error("Evento de folha não encontrado.");
        const expectedType = item.type === "PROVENTO" ? "Vencimento" : item.type === "DESCONTO" ? "Desconto" : "Base";
        if (!event.isActive || event.type !== expectedType || event.formula?.trim()) throw new Error("Evento de projeção deve ser ativo, sem fórmula concorrente e compatível com a rubrica.");
        const existing = canonicalItems.filter(existing => existing.employeeId === statement.contract.employeeId && existing.eventId === eventId).reduce((total, existing) => total.add(existing.valueDecimal ?? 0), D(0));
        const remaining = D(item.value).sub(existing);
        if (remaining.lt(0)) throw new Error("Origens já lançadas excedem a rubrica. Concilie antes de fechar.");
        if (remaining.isZero()) continue;
        const projection = remaining.toNumber();
        if (!D(projection.toString()).eq(remaining)) throw new Error("Valor excede precisão da projeção legada.");
        const [projected] = await tx.insert(payrollItems).values({ payrollId: run.payrollId, employeeId: statement.contract.employeeId, eventId, valueDecimal: remaining, value: projection, reference: `RH:${statement.id}:${item.code}` }).returning();
        await tx.insert(hrPayrollItemOrigins).values({ payrollItemId: projected.id, runId, statementId: statement.id, rubricCode: item.code, snapshot: json(item) });
      }
    }
    const projectedItems = await listCanonicalPayrollItems(tx, run.payrollId);
    const projectedTotal = projectedItems.reduce((total, item) => total.add(item.event.type === "Vencimento" ? item.valueDecimal ?? item.value : item.event.type === "Desconto" ? D(item.valueDecimal ?? item.value).negated() : 0), D(0));
    if (!projectedTotal.eq(run.net) || !D(projectedTotal.toNumber().toString()).eq(projectedTotal)) throw new Error("Projeção da folha não reconciliou com o líquido do cálculo.");
    await tx.update(payrolls).set({ status: "Fechada", totalValueDecimal: projectedTotal, totalValue: projectedTotal.toNumber() }).where(eq(payrolls.id, run.payrollId));
    const [updated] = await tx.update(hrPayrollRuns).set({ status: "FECHADA", approvedAt: new Date() }).where(eq(hrPayrollRuns.id, run.id)).returning();
    await enqueueHrIntegration(tx, { sourceKey: `FINANCEIRO:${run.id}`, domain: "FINANCEIRO", environment: run.scope, eventType: "FOLHA_FECHADA", payload: { runId, actorId, gross: run.gross, deductions: run.deductions, net: run.net, employer: run.employer } });
    await enqueueHrIntegration(tx, { sourceKey: `ESOCIAL:RESTRITA:${run.id}`, domain: "ESOCIAL", environment: "PRODUCAO_RESTRITA", eventType: "REMUNERACAO", payload: { runId, payrollId: run.payrollId, competence: payroll.competence, scope: run.scope } });
    return updated;
  });
}

export async function cancelPayrollRun(db: DatabaseConnection, actorId: string, runId: string, reason: string) {
  if (reason.trim().length < 3) throw new Error("Informe motivo do cancelamento.");
  return withDatabaseTransaction(db, async tx => {
    const run = await requirePayrollRun(tx, runId);
    await lock(tx, `payroll:${run.payrollId}`);
    const current = await requirePayrollRun(tx, runId);
    if (current.status === "CANCELADA") return current;
    if (current.status === "FECHADA") throw new Error("Cálculo fechado exige compensação contábil antes de cancelar.");
    await enqueueHrIntegration(tx, { sourceKey: `CANCELAMENTO:${run.id}`, domain: "AUDITORIA", environment: run.scope, eventType: "CANCELAMENTO_CALCULO", payload: { runId, actorId, reason } });
    const [updated] = await tx.update(hrPayrollRuns).set({ status: "CANCELADA", cancelledAt: new Date() }).where(eq(hrPayrollRuns.id, runId)).returning();
    return updated;
  });
}

export async function publishPayrollStatements(db: DatabaseConnection, actorId: string, runId: string, releaseAt: Date) {
  if (!Number.isFinite(releaseAt.getTime())) throw new Error("Data de liberação inválida.");
  return withDatabaseTransaction(db, async tx => {
    const run = await requirePayrollRun(tx, runId);
    await lock(tx, `payroll:${run.payrollId}`);
    const current = await requirePayrollRun(tx, runId);
    if (current.mode !== "OFICIAL" || current.status !== "FECHADA") throw new Error("A liberação requer cálculo oficial fechado.");
    await tx.update(hrPayrollStatements).set({ releaseAt }).where(and(eq(hrPayrollStatements.runId, runId), isNull(hrPayrollStatements.releaseAt)));
    return enqueueHrIntegration(tx, { sourceKey: `PUBLICACAO:${runId}`, domain: "PORTAL", environment: run.scope, eventType: "DEMONSTRATIVOS_LIBERADOS", payload: { runId, actorId, releaseAt } });
  });
}

export async function recordHrRightEntry(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ contractId: z.string().min(1), sourceKey: z.string().min(1), kind: z.enum(["FERIAS", "LICENCA_PREMIO", "ATS", "BANCO_HORAS", "PROVISAO_FERIAS", "PROVISAO_13", "PROVISAO_LICENCA"]), periodStart: date, periodEnd: date, quantity: z.string().regex(/^-?\d+(?:\.\d{1,4})?$/), amount: money, details: z.record(z.string(), z.unknown()) }).strict().parse(raw);
  if (input.periodEnd < input.periodStart) throw new Error("Período de direito inválido.");
  return withDatabaseTransaction(db, async tx => {
    await lock(tx, `contract:${input.contractId}`);
    await requireEmploymentContract(tx, input.contractId);
    const [previous] = await tx.select().from(hrRightEntries).where(eq(hrRightEntries.sourceKey, input.sourceKey)).limit(1);
    if (previous) {
      if (previous.contractId !== input.contractId || previous.kind !== input.kind || !previous.quantity.eq(input.quantity) || !previous.amount.eq(input.amount) || previous.periodStart.getTime() !== input.periodStart.getTime() || previous.periodEnd.getTime() !== input.periodEnd.getTime() || stableJson(previous.details) !== stableJson(input.details)) throw new Error("Origem do direito reutilizada com valores diferentes.");
      return previous;
    }
    const balance = await tx.select({ quantity: hrRightEntries.quantity, amount: hrRightEntries.amount }).from(hrRightEntries).where(and(eq(hrRightEntries.contractId, input.contractId), eq(hrRightEntries.kind, input.kind), eq(hrRightEntries.periodStart, input.periodStart), eq(hrRightEntries.periodEnd, input.periodEnd)));
    if (balance.reduce((sum, row) => sum.add(row.quantity), D(0)).add(input.quantity).lt(0) || balance.reduce((sum, row) => sum.add(row.amount), D(0)).add(input.amount).lt(0)) throw new Error("Baixa excede saldo do direito/provisão.");
    const [entry] = await tx.insert(hrRightEntries).values({ ...input, quantity: D(input.quantity), amount: D(input.amount), details: json(input.details), actorId }).returning();
    return entry;
  });
}
