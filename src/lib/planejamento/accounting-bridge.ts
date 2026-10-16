import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { postAccountingEventInTransaction } from "@/lib/financeiro";
import { AccessError, canPerformModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertPlanningLegalAuthority, planningInstrumentWhere, type PlanningContext } from "./access";
import { contentHash } from "./operations-core";

type Tx = Prisma.TransactionClient;
const object = (value: Prisma.JsonValue | null): Prisma.JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};
export const planningAccountingEvents = ["PLANNING_BUDGET_OPENING_REVENUE", "PLANNING_BUDGET_OPENING_EXPENSE", "PLANNING_REVENUE_INCREASE", "PLANNING_REVENUE_DECREASE", "PLANNING_EXPENSE_INCREASE", "PLANNING_EXPENSE_DECREASE"] as const;
const openingLinesSchema = z.array(z.object({ id: z.string().min(1), kind: z.enum(["REVENUE", "EXPENSE"]), year: z.number().int(), budgetUnitId: z.string().min(1), appropriationId: z.string().nullable(), originalValue: z.string().regex(/^\d{1,15}(\.\d{1,2})?$/) })).min(1);

async function assertLegacyOpening(tx: Tx, year: { id: string; startDate: Date }, appropriationId: string, originalValue: string) {
  const originals = await tx.accountingTransaction.findMany({ where: { financialYearId: year.id, sourceId: appropriationId, sourceType: "BUDGET_APPROPRIATION_OPENING", status: "POSTADO" }, include: { entries: true }, take: 2 });
  const prior = originals.length === 1 ? originals[0] : undefined;
  const sum = (type: string) => prior?.entries.filter((entry) => entry.type === type).reduce((value, entry) => value.plus(entry.valueDecimal ?? 0), new Prisma.Decimal(0));
  if (!prior || prior.entries.length < 2 || prior.entries.some((entry) => !entry.valueDecimal?.greaterThan(0) || !["Débito", "Crédito"].includes(entry.type)) || !sum("Débito")?.equals(originalValue) || !sum("Crédito")?.equals(originalValue) || prior.date.getTime() !== year.startDate.getTime() || await tx.accountingTransaction.count({ where: { reversalOfId: prior.id } })) throw new Error(`Reconcilie a abertura contábil original da dotação ${appropriationId}; os valores não serão lançados novamente.`);
}

async function lockAuthorizedPiece(tx: Tx, context: PlanningContext, instrumentId: string, requireWholeScope = true) {
  await tx.planningInstrument.findFirstOrThrow({ where: { id: instrumentId, ...planningInstrumentWhere(context) }, select: { id: true } });
  await tx.$queryRaw`SELECT id FROM "PlanningInstrument" WHERE id = ${instrumentId} FOR UPDATE`;
  if (requireWholeScope && !isSystemAdministrator(context.user) && await tx.planningBudgetLine.count({ where: { instrumentId, budgetUnitId: { notIn: context.user.allowedBudgetUnitIds } } })) throw new AccessError("A conexão exige acesso a todas as unidades da peça.", 403);
}

export async function configurePlanningInternalAccounting(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  if (!isSystemAdministrator(context.user) && !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("A configuração contábil exige autorização financeira.", 403);
  const input = z.object({ instrumentId: z.string().min(1), enabled: z.enum(["true", "false"]), reason: z.string().trim().min(3) }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    await lockAuthorizedPiece(tx, context, input.instrumentId);
    const piece = await tx.planningInstrument.findFirstOrThrow({ where: { id: input.instrumentId, ...planningInstrumentWhere(context) }, include: { annualBudgetLaw: true } });
    if (!piece.annualBudgetLaw) throw new Error("A integração contábil exige LOA.");
    if (input.enabled === "false" && object(piece.annualBudgetLaw.metadata).planningInternalExecution === true) throw new Error("A execução conectada exige contabilização ativa.");
    if (input.enabled === "false" && await tx.planningIntegrationCommand.count({ where: { status: "DELIVERED", payload: { path: ["instrumentId"], equals: piece.id } } })) throw new Error("A LOA possui histórico contábil conectado; não é permitido desativar sua contabilização.");
    if (input.enabled === "true") {
      const events = await tx.accountingEventCatalog.findMany({ where: { code: { in: [...planningAccountingEvents] }, isActive: true }, include: { rules: { where: { isActive: true } } } });
      if (events.length !== planningAccountingEvents.length || events.some((event) => event.rules.length !== 1 || event.rules[0].isReference && process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC")) throw new Error("Configure uma regra contábil ativa e homologada para cada evento de Planejamento antes de conectar.");
      const accounts = [...new Set(events.flatMap((event) => [event.rules[0].debitAccountId, event.rules[0].creditAccountId]))];
      if (events.some((event) => event.rules[0].debitAccountId === event.rules[0].creditAccountId) || await tx.accountingPlan.count({ where: { id: { in: accounts } } }) !== accounts.length) throw new Error("As regras exigem contas existentes e distintas de débito e crédito.");
      if (!context.user.employeeId) throw new Error("Vincule o responsável contábil ao cadastro de servidor.");
    }
    await tx.annualBudgetLaw.update({ where: { id: piece.annualBudgetLaw.id }, data: { metadata: { ...object(piece.annualBudgetLaw.metadata), planningInternalAccounting: input.enabled === "true" } } });
    await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId, entityType: "PLANNING_INSTRUMENT", entityId: piece.id, action: "PLANNING_ACCOUNTING_CONFIGURATION", payload: input } });
    return piece.id;
  });
}

/** Runs in the legal-effect transaction; missing posting rules roll back all budget effects. */
export async function deliverPlanningAccountingCommand(tx: Tx, context: PlanningContext, commandId: string) {
  const candidate = await tx.planningIntegrationCommand.findUniqueOrThrow({ where: { id: commandId } });
  const payload = z.object({ instrumentId: z.string(), governmentEntityId: z.string().optional() }).passthrough().parse(candidate.payload);
  if (!payload.governmentEntityId && candidate.type !== "LEGACY_BUDGET_BINDING_VERIFICATION") throw new Error("Comando contábil sem entidade de origem.");
  await lockAuthorizedPiece(tx, context, payload.instrumentId, false);
  await tx.$queryRaw`SELECT id FROM "PlanningIntegrationCommand" WHERE id = ${commandId} FOR UPDATE`;
  const command = await tx.planningIntegrationCommand.findUniqueOrThrow({ where: { id: commandId } });
  const piece = await tx.planningInstrument.findFirstOrThrow({ where: { id: payload.instrumentId, ...(payload.governmentEntityId ? { governmentEntityId: payload.governmentEntityId } : {}), ...planningInstrumentWhere(context) }, include: { annualBudgetLaw: { include: { financialYear: true } } } });
  if (!piece.annualBudgetLaw) return command.id;
  if (object(piece.annualBudgetLaw.metadata).planningInternalAccounting !== true) return command.id;
  if (!isSystemAdministrator(context.user) && !canPerformModuleOperation(context.user, "FINANCEIRO", "create")) throw new AccessError("A efetivação integrada exige autorização de postagem financeira.", 403);
  if (!context.user.employeeId) throw new Error("A contabilização exige servidor responsável.");
  if (command.status === "DELIVERED") return command.id;
  const year = piece.annualBudgetLaw.financialYear;
  const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId };
  const post = async (eventCode: string, value: Prisma.Decimal, sourceId: string, date: Date, key: string) => {
    if (value.isZero()) return;
    if (date < year.startDate) date = year.startDate;
    const prior = await tx.accountingTransaction.findUnique({ where: { idempotencyKey: key }, include: { entries: true } });
    if (prior) {
      const sum = (type: string) => prior.entries.filter((entry) => entry.type === type).reduce((total, entry) => total.plus(entry.valueDecimal ?? 0), new Prisma.Decimal(0));
      if (prior.financialYearId !== year.id || prior.date.getTime() !== date.getTime() || prior.status !== "POSTADO" || prior.sourceModule !== "PLANEJAMENTO" || prior.sourceType !== "PLANNING_BUDGET" || prior.sourceId !== sourceId || prior.eventType !== eventCode || prior.entries.length < 2 || prior.entries.some((entry) => !entry.valueDecimal?.greaterThan(0) || !["Débito", "Crédito"].includes(entry.type)) || !sum("Débito").equals(value.abs()) || !sum("Crédito").equals(value.abs()) || await tx.accountingTransaction.count({ where: { reversalOfId: prior.id } })) throw new Error("Chave contábil já utilizada com outra origem ou valor.");
      return;
    }
    await postAccountingEventInTransaction(tx, actor, { financialYearId: year.id, date, eventCode, value: value.abs(), history: `${piece.title} · ${eventCode} · ${sourceId}`, sourceModule: "PLANEJAMENTO", sourceType: "PLANNING_BUDGET", sourceId, idempotencyKey: key });
  };
  if (command.type === "ACCOUNTING_BUDGET_CHANGE") {
    const movement = await tx.planningLineMovement.findUniqueOrThrow({ where: { id: command.sourceId }, include: { line: true } });
    if (movement.line.instrumentId !== piece.id) throw new Error("Origem contábil fora da peça.");
    if (!isSystemAdministrator(context.user) && !context.user.allowedBudgetUnitIds.includes(movement.line.budgetUnitId)) throw new AccessError("Origem contábil fora das unidades autorizadas.", 403);
    if (movement.line.kind !== "TRANSFER") await post(`PLANNING_${movement.line.kind}_${movement.value.greaterThan(0) ? "INCREASE" : "DECREASE"}`, movement.value, movement.id, movement.effectiveAt, command.idempotencyKey);
  } else if (command.type === "BUDGET_OPENING") {
    if (command.sourceId !== piece.id || payload.year !== year.year) throw new Error("Origem/exercício da abertura fora da peça.");
    let baseline = payload.openingLines;
    if (baseline === undefined) {
      const revision = z.number().int().positive().parse(payload.revision);
      const preserved = await tx.planningVersion.findUnique({ where: { instrumentId_number: { instrumentId: piece.id, number: revision } } });
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
      } else await post(`PLANNING_BUDGET_OPENING_${line.kind}`, new Prisma.Decimal(line.originalValue), line.id, year.startDate, key);
    }
  } else if (command.type === "LEGACY_BUDGET_BINDING_VERIFICATION") {
    const binding = z.object({ lineId: z.string(), appropriationId: z.string(), original: z.string() }).parse(payload);
    const line = await tx.planningBudgetLine.findUniqueOrThrow({ where: { id: binding.lineId } });
    if (command.sourceId !== line.id || line.instrumentId !== piece.id || line.appropriationId !== binding.appropriationId || !line.originalValue.equals(binding.original)) throw new Error("Vínculo legado não corresponde à origem preservada.");
    if (!isSystemAdministrator(context.user) && !context.user.allowedBudgetUnitIds.includes(line.budgetUnitId)) throw new AccessError("Vínculo legado fora das unidades autorizadas.", 403);
    if (!piece.implantedAt || !await tx.planningIntegrationCommand.count({ where: { idempotencyKey: `implant:${piece.id}`, status: "DELIVERED" } })) throw new Error("Conclua a abertura da LOA antes de verificar o vínculo legado.");
    await assertLegacyOpening(tx, year, binding.appropriationId, binding.original);
  } else throw new Error("Comando contábil não reconhecido.");
  await tx.planningIntegrationCommand.update({ where: { id: command.id }, data: { status: "DELIVERED" } });
  await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, authorEmployeeId: context.user.employeeId, financialYearId: year.id, entityType: "PLANNING_INTEGRATION", entityId: command.id, action: "PLANNING_ACCOUNTING_DELIVERED", payload: { instrumentId: piece.id, commandType: command.type } } });
  return command.id;
}

export async function synchronizePlanningAccounting(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  const input = z.object({ instrumentId: z.string().min(1) }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    await lockAuthorizedPiece(tx, context, input.instrumentId);
    const piece = await tx.planningInstrument.findFirstOrThrow({ where: { id: input.instrumentId, ...planningInstrumentWhere(context) }, include: { annualBudgetLaw: true } });
    if (!piece.annualBudgetLaw || object(piece.annualBudgetLaw.metadata).planningInternalAccounting !== true) throw new Error("Conecte e configure a contabilização desta LOA antes de sincronizar.");
    const commands = await tx.planningIntegrationCommand.findMany({ where: { status: "PENDING", payload: { path: ["instrumentId"], equals: piece.id } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    for (const command of [...commands].sort((a, b) => Number(b.type === "BUDGET_OPENING") - Number(a.type === "BUDGET_OPENING"))) await deliverPlanningAccountingCommand(tx, context, command.id);
    return piece.id;
  }, { timeout: 60000 });
}

export async function configurePlanningInternalExecution(context: PlanningContext, raw: unknown) {
  assertPlanningLegalAuthority(context);
  if (!isSystemAdministrator(context.user) && !canPerformModuleOperation(context.user, "FINANCEIRO", "update")) throw new AccessError("A conexão de execução exige autorização financeira.", 403);
  const input = z.object({ instrumentId: z.string().min(1), enabled: z.enum(["true", "false"]), reason: z.string().trim().min(3) }).parse(raw);
  return context.prisma.$transaction(async (tx) => {
    await lockAuthorizedPiece(tx, context, input.instrumentId);
    const piece = await tx.planningInstrument.findFirstOrThrow({ where: { id: input.instrumentId, ...planningInstrumentWhere(context) }, include: { annualBudgetLaw: true, lines: { where: { kind: { in: ["REVENUE", "EXPENSE"] } }, include: { quotas: true, appropriation: true } } } });
    if (!piece.annualBudgetLaw || !piece.implantedAt) throw new Error("A conexão de execução exige LOA implantada.");
    if (input.enabled === "true") {
      if (object(piece.annualBudgetLaw.metadata).planningInternalAccounting !== true || await tx.planningIntegrationCommand.count({ where: { status: "PENDING", payload: { path: ["instrumentId"], equals: piece.id } } })) throw new Error("Conclua a contabilização da implantação e alterações antes de conectar a execução.");
      if (piece.lines.some((line) => line.quotas.length !== 12 || line.kind === "EXPENSE" && !line.appropriationId)) throw new Error("Todas as receitas/despesas devem possuir doze meses de programação e despesas com vínculo implantado.");
      if (object(piece.annualBudgetLaw.metadata).planningInternalExecution !== true && piece.lines.some((line) => (line.appropriation?.committedValueDecimal ?? new Prisma.Decimal(0)).greaterThan(0) || line.quotas.some((quota) => quota.consumed.greaterThan(0) || quota.disbursementPaid.greaterThan(0)))) throw new Error("Reconcilie a execução anterior antes de conectar; realizados manuais não serão somados novamente.");
      if (object(piece.annualBudgetLaw.metadata).planningInternalExecution !== true) {
        const [runtime] = await tx.$queryRaw<{ ready: boolean }[]>`SELECT (to_regclass('"Commitment"') IS NOT NULL AND to_regclass('"Revenue"') IS NOT NULL) AS ready`;
        if (!runtime?.ready) throw new Error("Implante a estrutura financeira antes de conectar a execução.");
        const appropriationIds = piece.lines.flatMap((line) => line.appropriationId ? [line.appropriationId] : []);
        const unitIds = [...new Set(piece.lines.map((line) => line.budgetUnitId))];
        if (await tx.commitment.count({ where: { appropriationId: { in: appropriationIds } } }) || await tx.revenue.count({ where: { financialYearId: piece.annualBudgetLaw.financialYearId, bankAccount: { is: { budgetUnitId: { in: unitIds } } } } })) throw new Error("Reconcilie os fatos financeiros anteriores antes de conectar, mesmo quando o saldo atual seja zero.");
      }
    } else if (object(piece.annualBudgetLaw.metadata).planningInternalExecution === true && await tx.planningQuotaEvent.count({ where: { quota: { line: { instrumentId: piece.id } }, submissionKey: { startsWith: "finance:" } } })) throw new Error("A execução conectada possui histórico financeiro; não é permitido desativar seu controle.");
    await tx.annualBudgetLaw.update({ where: { id: piece.annualBudgetLaw.id }, data: { metadata: { ...object(piece.annualBudgetLaw.metadata), planningInternalExecution: input.enabled === "true" } } });
    await tx.financialAuditLog.create({ data: { authorUsuarioId: context.user.id, entityType: "PLANNING_INSTRUMENT", entityId: piece.id, action: "PLANNING_EXECUTION_CONFIGURATION", payload: input } });
    return piece.id;
  });
}
