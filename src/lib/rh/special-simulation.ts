import { and, asc, eq, inArray } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrEmploymentRegimes, hrPayrollRubricIncidences, hrPayrollRubrics, hrSocialSecuritySchemes } from "@/db/schema/personnel-configuration";
import { hrPayrollRuns, hrPayrollStatements } from "@/db/schema/personnel-workforce";
import { lockPersonnel, personnelJson as json } from "@/db/repositories/personnel/integration";
import { findActivePayrollRule, requireEmploymentIdentityHistory, requirePayroll, requirePayrollRule } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { calculateContractRubrics, HR_PAYROLL_TYPES, payrollPeriod } from "./calculation-engine";
import { resolveContractRevision } from "./contract-timeline";
import { selectReceiptMessages } from "./receipt-messages";

const parameterSchema = z.object({ value: z.string().regex(/^-?\d{1,16}(?:\.\d{1,6})?$/), sourceReference: z.string().trim().min(3).max(1000) }).strict();
const policySchema = z.object({ origin: z.literal("SIMULACAO_FOLHA_ESPECIAL"), payrollType: z.enum(HR_PAYROLL_TYPES), rubricCodes: z.array(z.string().min(1)).min(1), inputNames: z.array(z.string().regex(/^[A-Z_][A-Z_0-9]*$/)), legalReference: z.string().min(3), premises: z.string().min(10) }).strict();

export async function simulateSpecialPayroll(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ payrollId: z.string().min(1), requestKey: z.string().min(1).max(160), contractIds: z.array(z.string().min(1)).min(1), ruleId: z.string().min(1), referenceDays: z.coerce.number().int().min(0).max(31), parameters: z.record(z.string(), parameterSchema), scope: z.enum(["DEMONSTRACAO", "HOMOLOGACAO", "PRODUCAO"]) }).strict().parse(raw);
  const ids = [...new Set(input.contractIds)].sort();
  const fingerprint = JSON.stringify({ ...input, contractIds: ids, parameters: Object.fromEntries(Object.entries(input.parameters).sort(([a], [b]) => a.localeCompare(b))) });
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, `payroll:${input.payrollId}`);
    const [replay] = await tx.select().from(hrPayrollRuns).where(eq(hrPayrollRuns.requestKey, input.requestKey)).limit(1);
    if (replay) {
      if ((replay.snapshot as { fingerprint?: string }).fingerprint !== fingerprint) throw new Error("Chave da simulação reutilizada com cenário diferente.");
      return { ...replay, statements: await tx.select().from(hrPayrollStatements).where(eq(hrPayrollStatements.runId, replay.id)) };
    }
    const payroll = await requirePayroll(tx, input.payrollId);
    if (payroll.type === "Mensal" || !(HR_PAYROLL_TYPES as readonly string[]).includes(payroll.type)) throw new Error("Use o cálculo mensal para Mensal; selecione um dos oito tipos especiais.");
    const period = payrollPeriod(payroll.competence);
    const storedRule = await requirePayrollRule(tx, input.ruleId);
    const ruleRubrics = await tx.select().from(hrPayrollRubrics).where(and(eq(hrPayrollRubrics.ruleSetId, storedRule.ruleSetId), eq(hrPayrollRubrics.isActive, true))).orderBy(asc(hrPayrollRubrics.priority), asc(hrPayrollRubrics.code));
    const incidences = await tx.select().from(hrPayrollRubricIncidences).where(inArray(hrPayrollRubricIncidences.rubricId, ruleRubrics.map(rubric => rubric.id)));
    const rule = { ...storedRule, ruleSet: { ...storedRule.ruleSet, rubrics: ruleRubrics.map(rubric => ({ ...rubric, incidences: incidences.filter(incidence => incidence.rubricId === rubric.id) })) } };
    const policy = policySchema.parse(rule.value);
    if (!rule.isActive || rule.ruleSet.status !== "ATIVA" || rule.ruleSet.scope !== input.scope || policy.payrollType !== payroll.type || rule.ruleSet.effectiveFrom > period.start || (rule.ruleSet.effectiveUntil && rule.ruleSet.effectiveUntil < period.end)) throw new Error("Política ativa, escopo, tipo e vigência devem corresponder ao cenário.");
    if (new Set(policy.inputNames).size !== policy.inputNames.length || new Set(policy.rubricCodes).size !== policy.rubricCodes.length) throw new Error("Política com parâmetros/rubricas duplicados.");
    if (Object.keys(input.parameters).length !== policy.inputNames.length || policy.inputNames.some(name => !(name in input.parameters))) throw new Error("Informe exatamente os parâmetros e fontes requeridos pela política.");
    const rubrics = rule.ruleSet.rubrics.filter(rubric => policy.rubricCodes.includes(rubric.code));
    if (rubrics.length !== policy.rubricCodes.length) throw new Error("Política refere rubrica inativa ou inexistente.");
    for (const id of ids) await lockPersonnel(tx, `contract:${id}`);
    const contracts = [];
    for (const id of ids) contracts.push(await requireEmploymentIdentityHistory(tx, id));
    if (contracts.length !== ids.length) throw new Error("Contrato selecionado não encontrado.");
    const rows: { contract: Omit<(typeof contracts)[number], "revisions">; regime: typeof hrEmploymentRegimes.$inferSelect & { socialSecurityScheme: typeof hrSocialSecuritySchemes.$inferSelect | null }; result: ReturnType<typeof calculateContractRubrics> }[] = [];
    for (const stored of contracts) {
      const { revisions, ...record } = stored;
      const contract = resolveContractRevision(record, revisions, period).contract;
      if (!contract.employee.isActive || !contract.employee.person || contract.admittedAt > period.end) throw new Error("Servidor/identidade funcional inválidos para o cenário.");
      const [regimeRow] = await tx.select().from(hrEmploymentRegimes).where(eq(hrEmploymentRegimes.id, contract.regimeId)).limit(1);
      if (!regimeRow) throw new Error("Regime não encontrado.");
      const [scheme] = regimeRow.socialSecuritySchemeId ? await tx.select().from(hrSocialSecuritySchemes).where(eq(hrSocialSecuritySchemes.id, regimeRow.socialSecuritySchemeId)).limit(1) : [];
      const regime = { ...regimeRow, socialSecurityScheme: scheme ?? null };
      if (!regime.isActive || regime.ruleSetId !== rule.ruleSetId) throw new Error("Regime deve corresponder ao conjunto de regras da simulação.");
      const result = calculateContractRubrics({ salary: contract.salary, days: input.referenceDays, monthlyHours: contract.monthlyHours, movements: {}, parameters: Object.fromEntries(Object.entries(input.parameters).map(([name, parameter]) => [name, parameter.value])), rubrics });
      rows.push({ contract, regime, result });
    }
    const sum = (key: "gross" | "deductions" | "net" | "employer") => rows.reduce((total, row) => total.add(row.result[key]), new Decimal(0));
    const messagesRule = await findActivePayrollRule(tx, rule.ruleSetId, "MENSAGENS_RECIBO");
    const [run] = await tx.insert(hrPayrollRuns).values({ payrollId: payroll.id, requestKey: input.requestKey, mode: "SIMULACAO", scope: input.scope, ruleSetId: rule.ruleSetId, actorId, gross: sum("gross"), deductions: sum("deductions"), net: sum("net"), employer: sum("employer"), snapshot: json({ fingerprint, payroll, policy, rule, contractIds: ids, parameters: input.parameters, officialReady: false, taxCalculation: "SOMENTE_RUBRICAS_EXPLICITAS_NA_POLITICA", rightsConsumed: false }) }).returning();
    const statements = await tx.insert(hrPayrollStatements).values(rows.map(row => ({ runId: run.id, contractId: row.contract.id, gross: row.result.gross, deductions: row.result.deductions, net: row.result.net, employer: row.result.employer, snapshot: json({ contract: row.contract, regime: row.regime, days: input.referenceDays, items: row.result.items, bases: row.result.bases, messages: messagesRule ? selectReceiptMessages(messagesRule.value, messagesRule.id, { contractId: row.contract.id, regimeId: row.regime.id, payrollType: payroll.type, period }) : [], policy, parameters: input.parameters, officialReady: false }) }))).returning();
    return { ...run, statements };
  }, { timeoutMs: 60000 });
}
