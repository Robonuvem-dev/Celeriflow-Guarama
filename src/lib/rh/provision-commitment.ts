import { and, asc, inArray, like, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { JsonObject } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrRightEntries } from "@/db/schema/personnel-workforce";
import { findHrIntegrationEvent, requireHrIntegrationEvent, lockPersonnel } from "@/db/repositories/personnel/integration";
import { requirePayrollRunWithStatements } from "@/db/repositories/personnel/workforce";
import { requirePersonnelCommitment } from "@/db/repositories/personnel/finance";
import { z } from "zod";
import { assertBudgetUnitAccess, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { enqueueHrIntegration } from "./workforce-service";

const amount = z.string().regex(/^\d{1,16}(?:\.\d{1,2})?$/).refine(value => new Decimal(value).gt(0));
const inputSchema = z.object({ sourceKey: z.string().trim().min(1).max(120), commitmentId: z.string().min(1), allocations: z.array(z.object({ entryId: z.string().min(1), amount }).strict()).min(1).max(1000), reason: z.string().trim().min(10).max(2000) }).strict();

/** Links a signed RH liability reduction to an existing native commitment.
 * No commitment, settlement or payment is fabricated by this operation. */
export async function consumeProvisionsAtCommitment(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new Error("Baixa exige alteração RH e Financeiro.");
  const input = inputSchema.parse(raw);
  for (const row of input.allocations) row.amount = new Decimal(row.amount).toFixed(2);
  input.allocations.sort((a, b) => a.entryId.localeCompare(b.entryId));
  if (new Set(input.allocations.map(row => row.entryId)).size !== input.allocations.length) throw new Error("Apropriação duplicada na baixa.");
  return withDatabaseTransaction(connection, async tx => {
    await lockPersonnel(tx, `commitment:${input.commitmentId}`);
    await tx.execute(sql`SELECT id FROM "Commitment" WHERE id=${input.commitmentId} FOR UPDATE`);
    const commitment = await requirePersonnelCommitment(tx, input.commitmentId);
    assertBudgetUnitAccess(context.user, commitment.appropriation.budgetUnitId);
    const expense = commitment.reservation?.expense;
    if (!expense || expense.sourceModule !== "RH" || expense.sourceType !== "PAYROLL_RUN" || !expense.sourceId || expense.status !== "Empenhada" || commitment.status === "Anulado" || !commitment.valueDecimal) throw new Error("Baixa exige empenho vigente originado da despesa nativa RH já empenhada.");
    const run = await requirePayrollRunWithStatements(tx, expense.sourceId);
    if (run.mode !== "OFICIAL" || run.status !== "FECHADA" || run.scope !== "PRODUCAO") throw new Error("Empenho deve estar ligado a cálculo oficial fechado de produção.");
    const sourceKey = `PROVISAO:BAIXA:${input.sourceKey}`;
    await lockPersonnel(tx, sourceKey);
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      const stored = z.object({ input: inputSchema, entryIds: z.array(z.string()) }).parse(previous.payload);
      if (JSON.stringify(stored.input) !== JSON.stringify(input)) throw new Error("Origem de baixa reutilizada com outros dados.");
      return { entryIds: stored.entryIds };
    }
    if ((await tx.execute<{ id: string }>(sql`SELECT id FROM "Settlement" WHERE "commitmentId"=${commitment.id} AND status='Liquidado' LIMIT 1`)).rows.length) throw new Error("Vincule a provisão antes da liquidação; cancele as liquidações ativas para recompor a cadeia.");
    let effective = commitment.valueDecimal;
    for (const movement of commitment.movements) {
      if (movement.type === "Reforço") effective = effective.add(movement.valueDecimal);
      else if (movement.type === "Anulação") effective = effective.sub(movement.valueDecimal);
      else throw new Error("Movimento de empenho não reconhecido; concilie antes da baixa.");
    }
    const [used] = await tx.select({ amount: sql<string | null>`sum(${hrRightEntries.amount})::text` }).from(hrRightEntries).where(and(like(hrRightEntries.kind, "PROVISAO\\_%"), sql`${hrRightEntries.details}->>'commitmentId' = ${commitment.id}`));
    const requested = input.allocations.reduce((sum, row) => sum.add(row.amount), new Decimal(0));
    if (requested.add(new Decimal(used.amount ?? 0).negated()).gt(effective)) throw new Error("Baixas acumuladas excedem o valor vigente do empenho.");
    const originals = await tx.select().from(hrRightEntries).where(inArray(hrRightEntries.id, input.allocations.map(row => row.entryId))).orderBy(asc(hrRightEntries.contractId));
    if (originals.length !== input.allocations.length) throw new Error("Apropriação não encontrada.");
    for (const contractId of [...new Set(originals.map(row => row.contractId))].sort()) await lockPersonnel(tx, `contract:${contractId}`);
    const entryIds = [];
    const planEvent = await findHrIntegrationEvent(tx, `FINANCEIRO:DESPESAS:${run.id}`);
    let component: "GROSS" | "EMPLOYER" | undefined;
    let costCenterId: string | null | undefined;
    if (planEvent) {
      if (planEvent.status !== "CONCLUIDA" || planEvent.eventType !== "SOLICITACOES_DESPESA_FOLHA") throw new Error("Plano financeiro da folha ainda não está concluído.");
      const plan = z.object({ runId: z.string(), lines: z.array(z.object({ component: z.enum(["GROSS", "EMPLOYER"]), costCenterId: z.string().nullable(), appropriationId: z.string(), supplierId: z.string(), value: z.string() })) }).parse(planEvent.payload);
      const result = z.object({ expenseIds: z.array(z.string()) }).parse(planEvent.result);
      const index = result.expenseIds.indexOf(expense.id);
      const line = plan.lines[index];
      if (plan.runId !== run.id || result.expenseIds.length !== plan.lines.length || new Set(result.expenseIds).size !== result.expenseIds.length || !line || line.appropriationId !== expense.appropriationId || line.supplierId !== expense.supplierId || !expense.valueDecimal?.eq(line.value)) throw new Error("Origem do empenho diverge do plano imutável da folha.");
      component = line.component;
      costCenterId = line.costCenterId;
    }
    for (const allocation of input.allocations) {
      const original = originals.find(row => row.id === allocation.entryId)!;
      const memory = z.object({ operation: z.literal("APROPRIACAO"), scope: z.literal("PRODUCAO") }).parse(original.details);
      if (!original.kind.startsWith("PROVISAO_") || !run.statements.some(statement => statement.contractId === original.contractId) || original.amount.lte(0)) throw new Error("Apropriação deve pertencer ao titular da folha empenhada em produção.");
      if ((await tx.select({ id: hrRightEntries.id }).from(hrRightEntries).where(sql`${hrRightEntries.details}->>'cancelsId' = ${original.id}`).limit(1)).length) throw new Error("Apropriação estornada não pode ser baixada.");
      const [prior] = await tx.select({ amount: sql<string | null>`sum(${hrRightEntries.amount})::text` }).from(hrRightEntries).where(sql`${hrRightEntries.details}->>'appropriationEntryId' = ${original.id}`);
      if (original.amount.add(prior.amount ?? 0).lt(allocation.amount)) throw new Error("Baixa excede saldo da apropriação selecionada.");
      const details = original.details as JsonObject;
      const breakdown = details.memory ? z.object({ remuneration: z.string(), employer: z.string(), total: z.string(), costCenterId: z.string().nullable().optional() }).parse(details.memory) : { remuneration: original.amount.toFixed(2), employer: "0.00", total: original.amount.toFixed(2), costCenterId: undefined };
      if (!new Decimal(breakdown.remuneration).plus(breakdown.employer).eq(original.amount) || !original.amount.eq(breakdown.total)) throw new Error("Memória dos componentes diverge do total provisionado.");
      if (!component && new Decimal(breakdown.employer).gt(0)) throw new Error("Provisão com encargos exige plano financeiro com componente explícito do empenho.");
      if (costCenterId !== undefined && breakdown.costCenterId !== undefined && costCenterId !== breakdown.costCenterId) throw new Error("Centro de custo da provisão diverge da despesa da folha.");
      const selected = component ?? "GROSS";
      const linked = await tx.select().from(hrRightEntries).where(sql`${hrRightEntries.details}->>'appropriationEntryId' = ${original.id}`).orderBy(asc(hrRightEntries.createdAt), asc(hrRightEntries.id));
      let grossUsed = new Decimal(0), employerUsed = new Decimal(0);
      for (const row of linked.filter((row) => row.amount.lt(0))) {
        const restored = linked.filter((item) => (item.details as JsonObject).originalEntryId === row.id).reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
        const remaining = row.amount.negated().minus(restored);
        if (remaining.lt(0)) throw new Error("Devoluções excedem a reserva de provisão original.");
        const previousComponent = (row.details as JsonObject).component;
        if (previousComponent === "EMPLOYER") employerUsed = employerUsed.plus(remaining);
        else if (previousComponent === "GROSS") grossUsed = grossUsed.plus(remaining);
        else {
          const gross = Decimal.min(remaining, Decimal.max(0, new Decimal(breakdown.remuneration).minus(grossUsed)));
          grossUsed = grossUsed.plus(gross); employerUsed = employerUsed.plus(remaining.minus(gross));
        }
      }
      const capacity = new Decimal(selected === "GROSS" ? breakdown.remuneration : breakdown.employer).minus(selected === "GROSS" ? grossUsed : employerUsed);
      if (capacity.lt(allocation.amount)) throw new Error("Baixa excede saldo do componente de remuneração ou encargos do empenho.");
      const [entry] = await tx.insert(hrRightEntries).values({ contractId: original.contractId, sourceKey: `${sourceKey}:${original.id}`, kind: original.kind, periodStart: original.periodStart, periodEnd: original.periodEnd, quantity: new Decimal(0), amount: new Decimal(allocation.amount).negated(), actorId: context.user.id, details: { operation: "BAIXA_EMPENHO", scope: memory.scope, component: selected, planEventId: planEvent?.id ?? null, appropriationEntryId: original.id, commitmentId: commitment.id, commitmentNumber: commitment.number, expenseId: expense.id, runId: run.id, reason: input.reason } }).returning();
      entryIds.push(entry.id);
    }
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "PRODUCAO", eventType: "PROVISOES_BAIXADAS_EMPENHO", payload: { input, entryIds, actorId: context.user.id, commitmentNumber: commitment.number, amount: requested.toFixed(2) } });
    return { entryIds };
  }, { timeoutMs: 60000 });
}

export async function reverseProvisionCommitmentConsumption(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new Error("Estorno exige alteração RH e Financeiro.");
  const input = z.object({ originalSourceKey: z.string().min(1), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const original = await requireHrIntegrationEvent(tx, input.originalSourceKey);
    if (original.eventType !== "PROVISOES_BAIXADAS_EMPENHO") throw new Error("Selecione uma baixa original de provisão por empenho.");
    const memory = z.object({ input: inputSchema, entryIds: z.array(z.string()) }).parse(original.payload);
    await lockPersonnel(tx, `commitment:${memory.input.commitmentId}`);
    await tx.execute(sql`SELECT id FROM "Commitment" WHERE id=${memory.input.commitmentId} FOR UPDATE`);
    const commitment = await requirePersonnelCommitment(tx, memory.input.commitmentId);
    assertBudgetUnitAccess(context.user, commitment.appropriation.budgetUnitId);
    const sourceKey = `ESTORNO:${original.sourceKey}`;
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) { const result = previous.payload as { reason: string; entryIds: string[] }; if (result.reason !== input.reason) throw new Error("Baixa estornada com outro fundamento."); return { entryIds: result.entryIds }; }
    if (commitment.status !== "Anulado") throw new Error("Devolução automática exige empenho integralmente anulado no Financeiro.");
    const entries = await tx.select().from(hrRightEntries).where(inArray(hrRightEntries.id, memory.entryIds)).orderBy(asc(hrRightEntries.contractId));
    if (entries.length !== memory.entryIds.length) throw new Error("Baixa incompleta; concilie o histórico.");
    for (const contractId of [...new Set(entries.map(row => row.contractId))].sort()) await lockPersonnel(tx, `contract:${contractId}`);
    const entryIds = [];
    for (const entry of entries) {
      const details = z.object({ appropriationEntryId: z.string(), commitmentId: z.literal(commitment.id), scope: z.literal("PRODUCAO"), operation: z.literal("BAIXA_EMPENHO"), component: z.enum(["GROSS", "EMPLOYER"]).optional(), planEventId: z.string().nullable().optional() }).parse(entry.details);
      const [restored] = await tx.insert(hrRightEntries).values({ contractId: entry.contractId, sourceKey: `${sourceKey}:${entry.id}`, kind: entry.kind, periodStart: entry.periodStart, periodEnd: entry.periodEnd, quantity: new Decimal(0), amount: entry.amount.negated(), actorId: context.user.id, details: { ...details, operation: "ESTORNO_BAIXA", originalEntryId: entry.id, reason: input.reason } }).returning();
      entryIds.push(restored.id);
    }
    await enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "PRODUCAO", eventType: "BAIXA_PROVISOES_ESTORNADA", payload: { entryIds, originalSourceKey: original.sourceKey, reason: input.reason, actorId: context.user.id } });
    return { entryIds };
  }, { timeoutMs: 60000 });
}
