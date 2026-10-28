import { and, eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrRightEntries } from "@/db/schema/personnel-workforce";
import { findHrIntegrationEvent, lockPersonnel, personnelJson as json } from "@/db/repositories/personnel/integration";
import { requirePayrollRun, requirePayrollRunWithStatements, requirePayrollRule, requireRightEntry } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { enqueueHrIntegration } from "./workforce-service";
import { assertAccountingPeriodOpen, type FinanceActor } from "@/lib/financeiro";
import { reverseProvisionAccrualAccounting } from "./provision-accounting";

const percentage = z.string().regex(/^\d+(?:\.\d{1,8})?$/).refine(value => new Decimal(value).lte(100));
export const payrollProvisionPolicySchema = z.object({ origin: z.literal("PROVISOES_FOLHA"), legalReference: z.string().trim().min(3), components: z.array(z.object({ kind: z.enum(["PROVISAO_FERIAS", "PROVISAO_13", "PROVISAO_LICENCA"]), rubricCodes: z.array(z.string().min(1)).min(1), rate: percentage, employerRate: percentage }).strict()).min(1).max(3) }).strict().superRefine((policy, ctx) => {
  if (new Set(policy.components.map(row => row.kind)).size !== policy.components.length || policy.components.some(row => new Set(row.rubricCodes).size !== row.rubricCodes.length)) ctx.addIssue({ code: "custom", message: "Tipo de provisão ou rubrica duplicado." });
});
const snapshotSchema = z.object({ items: z.array(z.object({ code: z.string(), type: z.string(), value: z.string() })), contract: z.object({ registration: z.string(), costCenterId: z.string().nullable() }) });

export function calculatePayrollProvisions(snapshot: unknown, rawPolicy: unknown) {
  const policy = payrollProvisionPolicySchema.parse(rawPolicy); const statement = snapshotSchema.parse(snapshot);
  return policy.components.map(component => {
    const items = component.rubricCodes.map(code => {
      const matches = statement.items.filter(item => item.code === code);
      if (matches.length !== 1 || matches[0].type !== "PROVENTO") throw new Error(`Base de provisão exige uma rubrica de provento ${code} na memória.`);
      return matches[0];
    });
    const base = items.reduce((sum, item) => sum.add(item.value), new Decimal(0));
    if (!base.isFinite() || base.lt(0)) throw new Error("Base de provisão negativa ou inválida exige conciliação.");
    const remuneration = base.mul(component.rate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const employer = remuneration.mul(component.employerRate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return { kind: component.kind, base: base.toFixed(2), rate: component.rate, employerRate: component.employerRate, remuneration: remuneration.toFixed(2), employer: employer.toFixed(2), total: remuneration.add(employer).toFixed(2), items, registration: statement.contract.registration, costCenterId: statement.contract.costCenterId };
  });
}

export async function postPayrollProvisions(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ runId: z.string().min(1), ruleId: z.string().min(1) }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    const initial = await requirePayrollRun(tx, input.runId);
    await lockPersonnel(tx, `payroll:${initial.payrollId}`);
    const sourceKey = `PROVISOES:FOLHA:${initial.id}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const memory = previous.payload as { ruleId: string; entryIds: string[] };
      if (memory.ruleId !== input.ruleId) throw new Error("Provisões já apuradas com outra regra.");
      return { entryIds: memory.entryIds };
    }
    const run = await requirePayrollRunWithStatements(tx, initial.id);
    if (run.mode !== "OFICIAL" || run.status !== "FECHADA" || run.payroll.type !== "Mensal") throw new Error("Provisões exigem cálculo mensal oficial fechado.");
    const period = payrollPeriod(run.payroll.competence);
    const year = period.start.getUTCFullYear(); const periodStart = new Date(Date.UTC(year, 0, 1)); const periodEnd = new Date(Date.UTC(year, 11, 31));
    const rule = await requirePayrollRule(tx, input.ruleId);
    const policy = payrollProvisionPolicySchema.parse(rule.value); const set = rule.ruleSet;
    if (!rule.isActive || rule.ruleSetId !== run.ruleSetId || set.scope !== run.scope || set.status !== "ATIVA" || set.effectiveFrom > period.start || (set.effectiveUntil && set.effectiveUntil < period.end)) throw new Error("Política de provisões ativa deve corresponder ao conjunto/escopo/competência.");
    if (set.scope === "PRODUCAO" && (set.isDemo || !set.approvedAt || set.approvedAt > new Date() || !set.legalReference)) throw new Error("Provisões de produção exigem parâmetros oficiais aprovados.");
    const entryIds = [];
    for (const statement of run.statements) {
      await lockPersonnel(tx, `contract:${statement.contractId}`);
      const rows = calculatePayrollProvisions(statement.snapshot, policy);
      for (const row of rows) {
        const monthlyOrigin = `PROVISAO:${row.kind}:${statement.contractId}:${run.scope}:${run.payroll.competence}`;
        if ((await tx.select({ id: hrRightEntries.id }).from(hrRightEntries).where(eq(hrRightEntries.sourceKey, monthlyOrigin)).limit(1)).length) throw new Error("Contrato/competência já provisionado por outra versão; concilie sem duplicar apropriação.");
        const [entry] = await tx.insert(hrRightEntries).values({ contractId: statement.contractId, sourceKey: monthlyOrigin, kind: row.kind, periodStart, periodEnd, quantity: new Decimal(1), amount: new Decimal(row.total), actorId, details: json({ operation: "APROPRIACAO", scope: run.scope, runId: run.id, statementId: statement.id, ruleId: rule.id, competence: run.payroll.competence, policy, memory: row, effectiveAt: period.end, reason: policy.legalReference }) }).returning();
        entryIds.push(entry.id);
      }
    }
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: run.scope, eventType: "PROVISOES_APROPRIADAS", payload: { runId: run.id, ruleId: rule.id, entryIds, actorId } });
    return { entryIds };
  }, { timeoutMs: 60000 });
}

export async function reversePayrollProvision(db: DatabaseConnection, actorId: string, raw: unknown, financeActor?: FinanceActor) {
  const input = z.object({ entryId: z.string().min(1), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    const original = await requireRightEntry(tx, input.entryId);
    const memory = z.object({ operation: z.literal("APROPRIACAO"), scope: z.string() }).parse(original.details);
    const posting = await findHrIntegrationEvent(tx, `CONTABIL:PROVISAO:${original.id}`);
    const date = new Date();
    if (posting) {
      if (!financeActor || financeActor.usuarioId !== actorId) throw new Error("Estorno de provisão contabilizada exige autorização financeira e escopo de UG.");
      const reference = z.object({ input: z.object({ budgetUnitId: z.string() }), financialYearId: z.string() }).parse(posting.payload);
      if (financeActor.allowedBudgetUnitIds && !financeActor.allowedBudgetUnitIds.includes(reference.input.budgetUnitId)) throw new Error("Provisão fora das UGs autorizadas.");
      await assertAccountingPeriodOpen(tx, reference.financialYearId, date);
    }
    if (!original.kind.startsWith("PROVISAO_") || original.amount.lt(0)) throw new Error("Selecione uma apropriação original de provisão.");
    await lockPersonnel(tx, `contract:${original.contractId}`);
    const sourceKey = `ESTORNO:PROVISAO:${original.id}`;
    const [previous] = await tx.select().from(hrRightEntries).where(eq(hrRightEntries.sourceKey, sourceKey)).limit(1);
    if (previous) { if ((previous.details as { reason: string }).reason !== input.reason) throw new Error("Provisão estornada com outro fundamento."); return previous; }
    const ledger = await tx.select().from(hrRightEntries).where(and(eq(hrRightEntries.contractId, original.contractId), eq(hrRightEntries.kind, original.kind), eq(hrRightEntries.periodStart, original.periodStart), eq(hrRightEntries.periodEnd, original.periodEnd), sql`${hrRightEntries.details}->>'scope' = ${memory.scope}`));
    const [linked] = await tx.select({ amount: sql<string | null>`sum(${hrRightEntries.amount})::text` }).from(hrRightEntries).where(sql`${hrRightEntries.details}->>'appropriationEntryId' = ${original.id}`);
    if (linked.amount && new Decimal(linked.amount).lt(0)) throw new Error("Apropriação possui baixa vinculada; estorne a baixa antes de devolver a provisão.");
    if (ledger.reduce((sum, row) => sum.add(row.amount), new Decimal(0)).sub(original.amount).lt(0) || ledger.reduce((sum, row) => sum.add(row.quantity), new Decimal(0)).sub(original.quantity).lt(0)) throw new Error("Provisão consumida exige conciliação antes do estorno.");
    if (posting) await reverseProvisionAccrualAccounting(tx, financeActor!, original.id, date, input.reason);
    const [entry] = await tx.insert(hrRightEntries).values({ contractId: original.contractId, sourceKey, kind: original.kind, periodStart: original.periodStart, periodEnd: original.periodEnd, quantity: original.quantity.negated(), amount: original.amount.negated(), actorId, details: { operation: "ESTORNO", scope: memory.scope, cancelsId: original.id, reason: input.reason } }).returning();
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: memory.scope, eventType: "PROVISAO_ESTORNADA", payload: { entryId: entry.id, originalEntryId: original.id, actorId, reason: input.reason } });
    return entry;
  }, { timeoutMs: 60000 });
}
