import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { JsonObject, JsonValue } from "@/db/json";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { accountingEntries, accountingEvents, accountingPlans, accountingRules, accountingTransactions } from "@/db/schema/finance-accounting";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import { planningAppropriations, planningBudgetLaws, planningInstruments, planningLines, planningMovements, planningQuotaEvents, planningQuotas } from "@/db/schema/planning-budget";
import { planningIntegrationCommands, planningVersions } from "@/db/schema/planning-legal";
import { planningCommitments } from "@/db/schema/planning-financial-sources";
import { readPlanningInstrument } from "@/db/repositories/planning/instruments";
import { planningInstrumentScope } from "@/db/repositories/planning/scope";
import { planningConnection } from "./database";
import { z } from "zod";
import { postAccountingEventInTransaction } from "@/lib/financeiro";
import { AccessError, canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertPlanningLegalAuthority, type PlanningContext } from "./access";
import { contentHash } from "./operations-core";

type Tx = DatabaseTransaction;
const object = (value: JsonValue | null): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export const planningAccountingEvents = ["PLANNING_BUDGET_OPENING_REVENUE", "PLANNING_BUDGET_OPENING_EXPENSE", "PLANNING_REVENUE_INCREASE", "PLANNING_REVENUE_DECREASE", "PLANNING_EXPENSE_INCREASE", "PLANNING_EXPENSE_DECREASE"] as const;
const openingLinesSchema = z.array(z.object({ id: z.string().min(1), kind: z.enum(["REVENUE", "EXPENSE"]), year: z.number().int(), budgetUnitId: z.string().min(1), appropriationId: z.string().nullable(), originalValue: z.string().regex(/^\d{1,15}(\.\d{1,2})?$/) })).min(1);

async function assertLegacyOpening(tx: Tx, year: { id: string; startDate: Date }, appropriationId: string, originalValue: string) {
  const originals = await tx.select().from(accountingTransactions).where(and(eq(accountingTransactions.financialYearId, year.id), eq(accountingTransactions.sourceId, appropriationId), eq(accountingTransactions.sourceType, "BUDGET_APPROPRIATION_OPENING"), eq(accountingTransactions.status, "POSTADO"))).limit(2);
  const prior = originals.length === 1 ? originals[0] : undefined;
  const entries = prior ? await tx.select().from(accountingEntries).where(eq(accountingEntries.transactionId, prior.id)) : [];
  const sum = (type: string) => entries.filter(entry => entry.type === type).reduce((value, entry) => value.plus(entry.valueDecimal ?? 0), new Decimal(0));
  if (!prior || entries.length < 2 || entries.some(entry => !entry.valueDecimal?.greaterThan(0) || !["Débito", "Crédito"].includes(entry.type)) || !sum("Débito").equals(originalValue) || !sum("Crédito").equals(originalValue) || prior.date.getTime() !== year.startDate.getTime() || (await tx.select({ id: accountingTransactions.id }).from(accountingTransactions).where(eq(accountingTransactions.reversalOfId, prior.id)).limit(1)).length) throw new Error(`Reconcilie a abertura contábil original da dotação ${appropriationId}; os valores não serão lançados novamente.`);
}

async function lockAuthorizedPiece(tx: Tx, context: PlanningContext, instrumentId: string, requireWholeScope = true) {
  if (!(await tx.select({ id: planningInstruments.id }).from(planningInstruments).where(and(eq(planningInstruments.id, instrumentId), planningInstrumentScope(context))).for("update")).length) throw new AccessError("Peça não encontrada neste escopo.", 404);
  if (requireWholeScope && !isSystemAdministrator(context.user) && (await tx.select({ id: planningLines.id }).from(planningLines).where(and(eq(planningLines.instrumentId, instrumentId), sql`NOT (${planningLines.budgetUnitId} = ANY(${sql.param(context.user.allowedBudgetUnitIds)}::text[]))`)).limit(1)).length) throw new AccessError("A conexão exige acesso a todas as unidades da peça.", 403);
}

async function authorizedPiece(tx: Tx, context: PlanningContext, id: string) {
  const piece = await readPlanningInstrument(tx, id, context);
  if (!piece) throw new AccessError("Peça não encontrada neste escopo.", 404);
  return piece;
}
async function integrationCommand(tx: Tx, id: string) {
  const [command] = await tx.select().from(planningIntegrationCommands).where(eq(planningIntegrationCommands.id, id)).limit(1);
  if (!command) throw new Error("Comando de integração não encontrado.");
  return command;
}

export async function configurePlanningInternalAccounting(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  if (!isSystemAdministrator(context.user) && !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("A configuração contábil exige autorização financeira.", 403);
  const input = z.object({ instrumentId: z.string().min(1), enabled: z.enum(["true", "false"]), reason: z.string().trim().min(3) }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async tx => {
    await lockAuthorizedPiece(tx, context, input.instrumentId);
    const piece = await authorizedPiece(tx, context, input.instrumentId);
    if (!piece.annualBudgetLaw) throw new Error("A integração contábil exige LOA.");
    if (input.enabled === "false" && object(piece.annualBudgetLaw.metadata).planningInternalExecution === true) throw new Error("A execução conectada exige contabilização ativa.");
    if (input.enabled === "false" && (await tx.select({ id: planningIntegrationCommands.id }).from(planningIntegrationCommands).where(and(eq(planningIntegrationCommands.status, "DELIVERED"), sql`${planningIntegrationCommands.payload}->>'instrumentId' = ${piece.id}`)).limit(1)).length) throw new Error("A LOA possui histórico contábil conectado; não é permitido desativar sua contabilização.");
    if (input.enabled === "true") {
      const selected = await tx.select().from(accountingEvents).where(and(inArray(accountingEvents.code, [...planningAccountingEvents]), eq(accountingEvents.isActive, true)));
      const events = await Promise.all(selected.map(async event => ({ ...event, rules: await tx.select().from(accountingRules).where(and(eq(accountingRules.eventId, event.id), eq(accountingRules.isActive, true))) })));
      if (events.length !== planningAccountingEvents.length || events.some((event) => event.rules.length !== 1 || event.rules[0].isReference && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC")) throw new Error("Configure uma regra contábil ativa e homologada para cada evento de Planejamento antes de conectar.");
      const accounts = [...new Set(events.flatMap((event) => [event.rules[0].debitAccountId, event.rules[0].creditAccountId]))];
      if (events.some(event => event.rules[0].debitAccountId === event.rules[0].creditAccountId) || (await tx.select({ id: accountingPlans.id }).from(accountingPlans).where(inArray(accountingPlans.id, accounts))).length !== accounts.length) throw new Error("As regras exigem contas existentes e distintas de débito e crédito.");
      if (!context.user.employeeId) throw new Error("Vincule o responsável contábil ao cadastro de servidor.");
    }
    await tx.update(planningBudgetLaws).set({ metadata: { ...object(piece.annualBudgetLaw.metadata), planningInternalAccounting: input.enabled === "true" } }).where(eq(planningBudgetLaws.id, piece.annualBudgetLaw.id));
    await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId, entityType: "PLANNING_INSTRUMENT", entityId: piece.id, action: "PLANNING_ACCOUNTING_CONFIGURATION", payload: input });
    return piece.id;
  });
}

/** Runs in the legal-effect transaction; missing posting rules roll back all budget effects. */
export async function deliverPlanningAccountingCommand(tx: Tx, context: PlanningContext, commandId: string) {
  const candidate = await integrationCommand(tx, commandId);
  const payload = z.object({ instrumentId: z.string(), governmentEntityId: z.string().optional() }).passthrough().parse(candidate.payload);
  if (!payload.governmentEntityId && candidate.type !== "LEGACY_BUDGET_BINDING_VERIFICATION") throw new Error("Comando contábil sem entidade de origem.");
  await lockAuthorizedPiece(tx, context, payload.instrumentId, false);
  await tx.select({ id: planningIntegrationCommands.id }).from(planningIntegrationCommands).where(eq(planningIntegrationCommands.id, commandId)).for("update");
  const command = await integrationCommand(tx, commandId);
  const piece = await authorizedPiece(tx, context, payload.instrumentId);
  if (payload.governmentEntityId && piece.governmentEntityId !== payload.governmentEntityId) throw new AccessError("Peça não encontrada neste escopo.", 404);
  if (!piece.annualBudgetLaw) return command.id;
  if (object(piece.annualBudgetLaw.metadata).planningInternalAccounting !== true) return command.id;
  if (!isSystemAdministrator(context.user) && !canPerformModuleOperation(context.user, "FINANCEIRO", "create")) throw new AccessError("A efetivação integrada exige autorização de postagem financeira.", 403);
  if (!context.user.employeeId) throw new Error("A contabilização exige servidor responsável.");
  if (command.status === "DELIVERED") return command.id;
  const year = piece.annualBudgetLaw.financialYear;
  const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId };
  const post = async (eventCode: string, value: Decimal, sourceId: string, date: Date, key: string) => {
    if (value.isZero()) return;
    if (date < year.startDate) date = year.startDate;
    const [priorRow] = await tx.select().from(accountingTransactions).where(eq(accountingTransactions.idempotencyKey, key)).limit(1);
    const prior = priorRow ? { ...priorRow, entries: await tx.select().from(accountingEntries).where(eq(accountingEntries.transactionId, priorRow.id)) } : null;
    if (prior) {
      const sum = (type: string) => prior.entries.filter(entry => entry.type === type).reduce((total, entry) => total.plus(entry.valueDecimal ?? 0), new Decimal(0));
      if (prior.financialYearId !== year.id || prior.date.getTime() !== date.getTime() || prior.status !== "POSTADO" || prior.sourceModule !== "PLANEJAMENTO" || prior.sourceType !== "PLANNING_BUDGET" || prior.sourceId !== sourceId || prior.eventType !== eventCode || prior.entries.length < 2 || prior.entries.some(entry => !entry.valueDecimal?.greaterThan(0) || !["Débito", "Crédito"].includes(entry.type)) || !sum("Débito").equals(value.abs()) || !sum("Crédito").equals(value.abs()) || (await tx.select({ id: accountingTransactions.id }).from(accountingTransactions).where(eq(accountingTransactions.reversalOfId, prior.id)).limit(1)).length) throw new Error("Chave contábil já utilizada com outra origem ou valor.");
      return;
    }
    await postAccountingEventInTransaction(tx, actor, { financialYearId: year.id, date, eventCode, value: value.abs(), history: `${piece.title} · ${eventCode} · ${sourceId}`, sourceModule: "PLANEJAMENTO", sourceType: "PLANNING_BUDGET", sourceId, idempotencyKey: key });
  };
  if (command.type === "ACCOUNTING_BUDGET_CHANGE") {
    const [movementRow] = await tx.select({ movement: planningMovements, line: planningLines }).from(planningMovements).innerJoin(planningLines, eq(planningLines.id, planningMovements.lineId)).where(eq(planningMovements.id, command.sourceId)).limit(1);
    if (!movementRow) throw new Error("Origem contábil não encontrada.");
    const movement = { ...movementRow.movement, line: movementRow.line };
    if (movement.line.instrumentId !== piece.id) throw new Error("Origem contábil fora da peça.");
    if (!isSystemAdministrator(context.user) && !context.user.allowedBudgetUnitIds.includes(movement.line.budgetUnitId)) throw new AccessError("Origem contábil fora das unidades autorizadas.", 403);
    if (movement.line.kind !== "TRANSFER") await post(`PLANNING_${movement.line.kind}_${movement.value.greaterThan(0) ? "INCREASE" : "DECREASE"}`, movement.value, movement.id, movement.effectiveAt, command.idempotencyKey);
  } else if (command.type === "BUDGET_OPENING") {
    if (command.sourceId !== piece.id || payload.year !== year.year) throw new Error("Origem/exercício da abertura fora da peça.");
    let baseline = payload.openingLines;
    if (baseline === undefined) {
      const revision = z.number().int().positive().parse(payload.revision);
      const [preserved] = await tx.select().from(planningVersions).where(and(eq(planningVersions.instrumentId, piece.id), eq(planningVersions.number, revision))).limit(1);
      if (!preserved || contentHash(preserved.snapshot) !== preserved.hash) throw new Error("Reconcilie o comando antigo: versão preservada da implantação ausente ou inconsistente.");
      const snapshot = z.object({ piece: z.object({ id: z.string(), implantedAt: z.string() }), lines: z.array(z.object({ kind: z.string() }).passthrough()) }).parse(preserved.snapshot);
      if (snapshot.piece.id !== piece.id) throw new Error("Versão de abertura fora da peça.");
      baseline = snapshot.lines.filter((line) => ["REVENUE", "EXPENSE"].includes(line.kind));
    }
    const lines = openingLinesSchema.parse(baseline);
    if (new Set(lines.map((line) => line.id)).size !== lines.length || lines.some((line) => line.year !== year.year)) throw new Error("Base de abertura duplicada ou fora do exercício.");
    const reconciled = z.array(z.string()).parse(payload.reconciledAppropriationIds ?? []);
    for (const line of lines) {
      if (!isSystemAdministrator(context.user) && !context.user.allowedBudgetUnitIds.includes(line.budgetUnitId)) throw new AccessError("A abertura exige acesso a todas as unidades da peça.", 403);
      const key = `${command.idempotencyKey}:${line.id}`;
      if (line.appropriationId && reconciled.includes(line.appropriationId)) {
        await assertLegacyOpening(tx, year, line.appropriationId, line.originalValue);
      } else await post(`PLANNING_BUDGET_OPENING_${line.kind}`, new Decimal(line.originalValue), line.id, year.startDate, key);
    }
  } else if (command.type === "LEGACY_BUDGET_BINDING_VERIFICATION") {
    const binding = z.object({ lineId: z.string(), appropriationId: z.string(), original: z.string() }).parse(payload);
    const [line] = await tx.select().from(planningLines).where(eq(planningLines.id, binding.lineId)).limit(1);
    if (!line) throw new Error("Vínculo legado não encontrado.");
    if (command.sourceId !== line.id || line.instrumentId !== piece.id || line.appropriationId !== binding.appropriationId || !line.originalValue.equals(binding.original)) throw new Error("Vínculo legado não corresponde à origem preservada.");
    if (!isSystemAdministrator(context.user) && !context.user.allowedBudgetUnitIds.includes(line.budgetUnitId)) throw new AccessError("Vínculo legado fora das unidades autorizadas.", 403);
    if (!piece.implantedAt || !(await tx.select({ id: planningIntegrationCommands.id }).from(planningIntegrationCommands).where(and(eq(planningIntegrationCommands.idempotencyKey, `implant:${piece.id}`), eq(planningIntegrationCommands.status, "DELIVERED"))).limit(1)).length) throw new Error("Conclua a abertura da LOA antes de verificar o vínculo legado.");
    await assertLegacyOpening(tx, year, binding.appropriationId, binding.original);
  } else throw new Error("Comando contábil não reconhecido.");
  await tx.update(planningIntegrationCommands).set({ status: "DELIVERED" }).where(eq(planningIntegrationCommands.id, command.id));
  await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId, financialYearId: year.id, entityType: "PLANNING_INTEGRATION", entityId: command.id, action: "PLANNING_ACCOUNTING_DELIVERED", payload: { instrumentId: piece.id, commandType: command.type } });
  return command.id;
}

export async function synchronizePlanningAccounting(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ instrumentId: z.string().min(1) }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async tx => {
    await lockAuthorizedPiece(tx, context, input.instrumentId);
    const piece = await authorizedPiece(tx, context, input.instrumentId);
    if (!piece.annualBudgetLaw || object(piece.annualBudgetLaw.metadata).planningInternalAccounting !== true) throw new Error("Conecte e configure a contabilização desta LOA antes de sincronizar.");
    const commands = await tx.select().from(planningIntegrationCommands).where(and(eq(planningIntegrationCommands.status, "PENDING"), sql`${planningIntegrationCommands.payload}->>'instrumentId' = ${piece.id}`)).orderBy(asc(planningIntegrationCommands.createdAt), asc(planningIntegrationCommands.id));
    for (const command of [...commands].sort((a, b) => Number(b.type === "BUDGET_OPENING") - Number(a.type === "BUDGET_OPENING"))) await deliverPlanningAccountingCommand(tx, context, command.id);
    return piece.id;
  }, { timeoutMs: 60000 });
}

export async function configurePlanningInternalExecution(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  if (!isSystemAdministrator(context.user) && !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("A conexão de execução exige autorização financeira.", 403);
  const input = z.object({ instrumentId: z.string().min(1), enabled: z.enum(["true", "false"]), reason: z.string().trim().min(3) }).parse(raw);
  return withDatabaseTransaction(planningConnection(context), async tx => {
    await lockAuthorizedPiece(tx, context, input.instrumentId);
    const instrument = await authorizedPiece(tx, context, input.instrumentId);
    const lineRows = await tx.select({ line: planningLines, appropriation: planningAppropriations }).from(planningLines).leftJoin(planningAppropriations, eq(planningAppropriations.id, planningLines.appropriationId)).where(and(eq(planningLines.instrumentId, instrument.id), inArray(planningLines.kind, ["REVENUE", "EXPENSE"])));
    const piece = { ...instrument, lines: await Promise.all(lineRows.map(async row => ({ ...row.line, appropriation: row.appropriation, quotas: await tx.select().from(planningQuotas).where(eq(planningQuotas.lineId, row.line.id)) }))) };
    if (!piece.annualBudgetLaw || !piece.implantedAt) throw new Error("A conexão de execução exige LOA implantada.");
    if (input.enabled === "true") {
      if (object(piece.annualBudgetLaw.metadata).planningInternalAccounting !== true || (await tx.select({ id: planningIntegrationCommands.id }).from(planningIntegrationCommands).where(and(eq(planningIntegrationCommands.status, "PENDING"), sql`${planningIntegrationCommands.payload}->>'instrumentId' = ${piece.id}`)).limit(1)).length) throw new Error("Conclua a contabilização da implantação e alterações antes de conectar a execução.");
      if (piece.lines.some((line) => line.quotas.length !== 12 || line.kind === "EXPENSE" && !line.appropriationId)) throw new Error("Todas as receitas/despesas devem possuir doze meses de programação e despesas com vínculo implantado.");
      if (object(piece.annualBudgetLaw.metadata).planningInternalExecution !== true && piece.lines.some(line => (line.appropriation?.committedValueDecimal ?? new Decimal(0)).greaterThan(0) || line.quotas.some(quota => quota.consumed.greaterThan(0) || quota.disbursementPaid.greaterThan(0)))) throw new Error("Reconcilie a execução anterior antes de conectar; realizados manuais não serão somados novamente.");
      if (object(piece.annualBudgetLaw.metadata).planningInternalExecution !== true) {
        const runtime = await tx.execute<{ ready: boolean }>(sql`SELECT (to_regclass('"Commitment"') IS NOT NULL AND to_regclass('"Revenue"') IS NOT NULL) AS ready`);
        if (!runtime.rows[0]?.ready) throw new Error("Implante a estrutura financeira antes de conectar a execução.");
        const appropriationIds = piece.lines.flatMap((line) => line.appropriationId ? [line.appropriationId] : []);
        const unitIds = [...new Set(piece.lines.map((line) => line.budgetUnitId))];
        const commitments = await tx.select({ id: planningCommitments.id }).from(planningCommitments).where(inArray(planningCommitments.appropriationId, appropriationIds)).limit(1);
        const revenues = await tx.execute<{ total: string }>(sql`SELECT count(*)::text AS total FROM "Revenue" r JOIN "BankAccount" b ON b.id = r."bankAccountId" WHERE r."financialYearId" = ${piece.annualBudgetLaw.financialYearId} AND b."budgetUnitId" = ANY(${sql.param(unitIds)}::text[])`);
        if (commitments.length || Number(revenues.rows[0]?.total ?? 0)) throw new Error("Reconcilie os fatos financeiros anteriores antes de conectar, mesmo quando o saldo atual seja zero.");
      }
    } else if (object(piece.annualBudgetLaw.metadata).planningInternalExecution === true && (await tx.select({ id: planningQuotaEvents.id }).from(planningQuotaEvents).innerJoin(planningQuotas, eq(planningQuotas.id, planningQuotaEvents.quotaId)).innerJoin(planningLines, eq(planningLines.id, planningQuotas.lineId)).where(and(eq(planningLines.instrumentId, piece.id), sql`starts_with(${planningQuotaEvents.submissionKey}, 'finance:')`)).limit(1)).length) throw new Error("A execução conectada possui histórico financeiro; não é permitido desativar seu controle.");
    await tx.update(planningBudgetLaws).set({ metadata: { ...object(piece.annualBudgetLaw.metadata), planningInternalExecution: input.enabled === "true" } }).where(eq(planningBudgetLaws.id, piece.annualBudgetLaw.id));
    await tx.insert(financialAuditLogs).values({ authorUsuarioId: context.user.id, entityType: "PLANNING_INSTRUMENT", entityId: piece.id, action: "PLANNING_EXECUTION_CONFIGURATION", payload: input });
    return piece.id;
  });
}
