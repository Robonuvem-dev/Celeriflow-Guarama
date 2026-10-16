import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertAccountingPeriodOpen, postAccountingTransactionInTransaction, type FinanceActor } from "@/lib/financeiro";
import { assertBudgetUnitAccess, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { payrollPeriod } from "./calculation-engine";
import { enqueueHrIntegration } from "./workforce-service";
import { assertPayrollBudgetScope } from "./payroll-access";

const optionalAccount = z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional());
const inputSchema = z.object({ entryId: z.string().min(1), budgetUnitId: z.string().min(1), expenseAccountId: z.string().min(1), liabilityAccountId: z.string().min(1), employerExpenseAccountId: optionalAccount, employerLiabilityAccountId: optionalAccount, date: z.iso.date(), reason: z.string().trim().min(10).max(2000) }).strict();
const actorFor = (context: AppContext): FinanceActor => ({ usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds });
const object = (value: Prisma.JsonValue) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const postingKey = (entryId: string) => `CONTABIL:PROVISAO:${entryId}`;

export async function reverseProvisionAccrualAccounting(tx: Prisma.TransactionClient, actor: FinanceActor, entryId: string, date: Date, reason: string) {
  const event = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: postingKey(entryId) } });
  if (!event || event.status === "ESTORNADA") return;
  const transactionId = z.string().parse(object(event.result ?? {}).transactionId);
  const original = await tx.accountingTransaction.findUniqueOrThrow({ where: { id: transactionId }, include: { entries: true } });
   await postAccountingTransactionInTransaction(tx, actor, { financialYearId: original.financialYearId, governmentEntityId: original.governmentEntityId ?? undefined, budgetUnitId: original.budgetUnitId ?? undefined, date, history: reason, lines: original.entries.map((entry) => ({ originalEntryId: entry.id, accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" : "Débito", value: entry.valueDecimal ?? entry.value })), sourceModule: "RH", sourceType: "HR_PROVISION_REVERSAL", sourceId: entryId, eventType: "PROVISAO_APROPRIACAO_ESTORNADA", idempotencyKey: `RH:PROVISION:${entryId}:ACCRUAL:REVERSAL`, reversalOfId: original.id });
  await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "ESTORNADA" } });
}

/** Appropriates the already calculated RH liability. The source ledger and its IDs remain intact. */
export async function accountPayrollProvision(context: AppContext, raw: unknown) {
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "FINANCEIRO", "create")) throw new Error("Apropriação exige alteração RH e criação no Financeiro.");
  const input = inputSchema.parse(raw);
  assertBudgetUnitAccess(context.user, input.budgetUnitId);
  const source = await context.prisma.hrRightEntry.findUniqueOrThrow({ where: { id: input.entryId } });
  const memory = z.object({ operation: z.literal("APROPRIACAO"), scope: z.literal("PRODUCAO"), runId: z.string(), competence: z.string() }).parse(source.details);
  if (!source.kind.startsWith("PROVISAO_") || source.amount.lte(0)) throw new Error("Selecione a apropriação positiva de uma provisão de produção.");
  const components = object(source.details).memory;
  const totals = components ? z.object({ remuneration: z.string(), employer: z.string(), total: z.string() }).parse(components) : { remuneration: source.amount.toFixed(2), employer: "0.00", total: source.amount.toFixed(2) };
  const remuneration = new Prisma.Decimal(totals.remuneration);
  const employer = new Prisma.Decimal(totals.employer);
  if (![remuneration, employer].every((value) => value.isFinite() && value.gte(0) && value.decimalPlaces() <= 2) || !remuneration.plus(employer).eq(source.amount) || !source.amount.eq(totals.total)) throw new Error("Memória de remuneração e encargos não reconcilia com a provisão.");
  if (employer.gt(0) && (!input.employerExpenseAccountId || !input.employerLiabilityAccountId)) throw new Error("Informe contas próprias de VPD e passivo para os encargos patronais.");
  if (!!input.employerExpenseAccountId !== !!input.employerLiabilityAccountId) throw new Error("Informe juntas as contas dos encargos patronais.");
  if (input.employerExpenseAccountId && (!input.employerLiabilityAccountId || input.employerExpenseAccountId === input.employerLiabilityAccountId || input.employerExpenseAccountId === input.expenseAccountId || input.employerLiabilityAccountId === input.liabilityAccountId)) throw new Error("Remuneração e encargos exigem classificação separada e contas D/C distintas.");
  const run = await context.prisma.hrPayrollRun.findUniqueOrThrow({ where: { id: memory.runId }, include: { payroll: true } });
  await assertPayrollBudgetScope(context, run.payrollId);
  if (run.scope !== "PRODUCAO" || run.mode !== "OFICIAL" || run.status !== "FECHADA") throw new Error("Provisão contábil exige cálculo oficial fechado de produção.");
  const period = payrollPeriod(memory.competence);
  const date = new Date(`${input.date}T12:00:00.000Z`);
  if (date < period.start || date > period.end || date.toISOString().slice(0, 10) !== input.date || input.date !== period.end.toISOString().slice(0, 10)) throw new Error("A apropriação mensal deve ser registrada no último dia da competência da provisão.");
  if (input.expenseAccountId === input.liabilityAccountId) throw new Error("VPD e passivo provisionado exigem contas distintas.");
  return context.prisma.$transaction(async (tx) => {
    const binding = await tx.planningEntityUnit.findUniqueOrThrow({ where: { budgetUnitId: input.budgetUnitId } });
    const year = await tx.financialYear.findFirstOrThrow({ where: { governmentEntityId: binding.governmentEntityId, year: date.getUTCFullYear() } });
    await assertAccountingPeriodOpen(tx, year.id, date);
    if (process.env.CELERIFLOW_ACCOUNTING_MODE !== "POC") {
      const accounts = await tx.accountingPlan.findMany({ where: { id: { in: [input.expenseAccountId, input.liabilityAccountId, ...(input.employerExpenseAccountId ? [input.employerExpenseAccountId, input.employerLiabilityAccountId!] : [])] } }, select: { id: true, code: true } });
      if (!accounts.find((account) => account.id === input.expenseAccountId)?.code.replace(/\D/g, "").startsWith("3") || !accounts.find((account) => account.id === input.liabilityAccountId)?.code.replace(/\D/g, "").startsWith("2")) throw new Error("Apropriação municipal exige VPD classe 3 e passivo classe 2, analíticos e vigentes.");
      if (employer.gt(0) && (!accounts.find((account) => account.id === input.employerExpenseAccountId)?.code.startsWith("3.") || !accounts.find((account) => account.id === input.employerLiabilityAccountId)?.code.startsWith("2."))) throw new Error("Encargos patronais exigem VPD classe 3 e passivo classe 2.");
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${source.contractId}`}))`;
    const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: postingKey(source.id) } });
    if (previous) {
      const stored = inputSchema.parse(object(previous.payload).input);
      if (Object.entries(input).some(([key, value]) => stored[key as keyof typeof input] !== value)) throw new Error("Provisão já contabilizada com outros dados.");
      if (previous.status !== "CONCLUIDA") throw new Error("A apropriação original foi estornada; preserve seu histórico.");
      return { eventId: previous.id, transactionId: String(object(previous.result ?? {}).transactionId), entryId: source.id };
    }
    if (await tx.hrRightEntry.count({ where: { details: { path: ["cancelsId"], equals: source.id } } })) throw new Error("Provisão já estornada no RH.");
    const contract = await tx.hrEmploymentContract.findUniqueOrThrow({ where: { id: source.contractId } });
    if (contract.costCenterId) {
      const center = await tx.costCenter.findUnique({ where: { id: contract.costCenterId } });
      if (center?.governmentEntityId && center.governmentEntityId !== binding.governmentEntityId) throw new Error("Centro de custo da provisão pertence a outra entidade.");
    }
    const lines: Array<{ accountId: string; type: "Débito" | "Crédito"; value: Prisma.Decimal }> = [];
    if (remuneration.gt(0)) lines.push({ accountId: input.expenseAccountId, type: "Débito", value: remuneration }, { accountId: input.liabilityAccountId, type: "Crédito", value: remuneration });
    if (employer.gt(0)) lines.push({ accountId: input.employerExpenseAccountId!, type: "Débito", value: employer }, { accountId: input.employerLiabilityAccountId!, type: "Crédito", value: employer });
    const transaction = await postAccountingTransactionInTransaction(tx, actorFor(context), { financialYearId: year.id, governmentEntityId: binding.governmentEntityId, budgetUnitId: input.budgetUnitId, date, history: input.reason, lines, sourceModule: "RH", sourceType: "HR_PROVISION", sourceId: source.id, eventType: `${source.kind}_APROPRIADA`, idempotencyKey: `RH:PROVISION:${source.id}:ACCRUAL` });
    const event = await enqueueHrIntegration(tx, { sourceKey: postingKey(source.id), domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "PROVISAO_CONTABIL_APROPRIADA", payload: { input, entryId: source.id, runId: run.id, amount: source.amount.toFixed(2), financialYearId: year.id, governmentEntityId: binding.governmentEntityId } });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "CONCLUIDA", result: { transactionId: transaction.id } } });
    return { eventId: event.id, transactionId: transaction.id, entryId: source.id };
  }, { timeout: 60000 });
}

type ReleaseRow = { consumptionEntryId: string; provisionEntryId: string; amount: string; transactionId: string };
const releaseRowsSchema = z.array(z.object({ consumptionEntryId: z.string(), provisionEntryId: z.string(), amount: z.string(), transactionId: z.string() }));

/** Neutralizes the VPD already appropriated; the native settlement still records its complete liability. */
export async function releasePayrollProvisionsAtSettlement(tx: Prisma.TransactionClient, actor: FinanceActor, settlementId: string) {
  const settlement = await tx.settlement.findUniqueOrThrow({ where: { id: settlementId }, include: { commitment: { include: { appropriation: true, reservation: { include: { expense: true } } } } } });
  if (settlement.commitment.reservation?.expense?.sourceModule !== "RH") return;
  const reservations = await tx.hrRightEntry.findMany({ where: { kind: { startsWith: "PROVISAO_" }, AND: [{ details: { path: ["commitmentId"], equals: settlement.commitmentId } }, { details: { path: ["operation"], equals: "BAIXA_EMPENHO" } }] }, orderBy: [{ contractId: "asc" }, { id: "asc" }] });
  if (!reservations.length) return;
  const sourceKey = `CONTABIL:PROVISAO:BAIXA:${settlement.id}`;
  const previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
  if (previous) return;
  for (const contractId of [...new Set(reservations.map((row) => row.contractId))].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:contract:${contractId}`}))`;
  const native = await tx.accountingTransaction.findUniqueOrThrow({ where: { idempotencyKey: `FINANCEIRO:SETTLEMENT:${settlement.id}:LIQUIDACAO_REGISTRADA` }, include: { entries: true } });
  const vpd = native.entries.filter((entry) => entry.type === "Débito");
  if (vpd.length !== 1 || !vpd[0].valueDecimal?.eq(settlement.valueDecimal ?? 0)) throw new Error("Liquidação sem VPD canônica conciliada para baixar a provisão.");
  const priorEvents = await tx.hrIntegrationEvent.findMany({ where: { eventType: "PROVISOES_BAIXADAS_LIQUIDACAO", status: "CONCLUIDA", payload: { path: ["commitmentId"], equals: settlement.commitmentId } } });
  const used = new Map<string, Prisma.Decimal>();
  for (const event of priorEvents) for (const row of releaseRowsSchema.parse(object(event.payload).rows)) used.set(row.consumptionEntryId, (used.get(row.consumptionEntryId) ?? new Prisma.Decimal(0)).plus(row.amount));
  let remaining = settlement.valueDecimal;
  if (!remaining) throw new Error("Liquidação sem valor decimal.");
  const rows: ReleaseRow[] = [];
  const originIds = [...new Set(reservations.map((row) => z.object({ appropriationEntryId: z.string() }).parse(row.details).appropriationEntryId))];
  const allReleases = await tx.hrIntegrationEvent.findMany({ where: { eventType: "PROVISOES_BAIXADAS_LIQUIDACAO", status: "CONCLUIDA", OR: originIds.map((id) => ({ payload: { path: ["rows"], array_contains: [{ provisionEntryId: id }] } })) } });
  const usedOrigins = new Map<string, Prisma.Decimal>();
  const salaryUsed = new Map<string, Prisma.Decimal>();
  const employerUsed = new Map<string, Prisma.Decimal>();
  for (const event of allReleases) for (const row of releaseRowsSchema.parse(object(event.payload).rows)) usedOrigins.set(row.provisionEntryId, (usedOrigins.get(row.provisionEntryId) ?? new Prisma.Decimal(0)).plus(row.amount));
  for (const reservation of reservations) {
    if (!remaining.gt(0)) break;
    if (reservation.amount.gte(0)) throw new Error("Reserva de provisão sem valor de baixa conciliado.");
    const details = z.object({ scope: z.literal("PRODUCAO"), appropriationEntryId: z.string(), component: z.enum(["GROSS", "EMPLOYER"]).optional() }).parse(reservation.details);
    const origin = await tx.hrRightEntry.findUniqueOrThrow({ where: { id: details.appropriationEntryId } });
    const reserved = await tx.hrRightEntry.aggregate({ where: { details: { path: ["originalEntryId"], equals: reservation.id } }, _sum: { amount: true } });
    const available = reservation.amount.negated().minus(reserved._sum.amount ?? 0).minus(used.get(reservation.id) ?? 0);
    if (available.lte(0)) continue;
    const posting = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: postingKey(origin.id) } });
    if (!posting || posting.status !== "CONCLUIDA") throw new Error("Contabilize a apropriação da provisão antes de liquidar sua baixa.");
    const policy = inputSchema.parse(object(posting.payload).input);
    if (policy.budgetUnitId !== settlement.commitment.appropriation.budgetUnitId) throw new Error("Provisão e liquidação pertencem a UGs diferentes.");
    const value = Prisma.Decimal.min(remaining, available);
    const totalUsed = usedOrigins.get(origin.id) ?? new Prisma.Decimal(0);
    if (totalUsed.plus(value).gt(origin.amount)) throw new Error("Baixas patrimoniais excedem a apropriação original.");
    const componentMemory = object(origin.details).memory;
    const remuneration = componentMemory ? new Prisma.Decimal(z.object({ remuneration: z.string() }).parse(componentMemory).remuneration) : origin.amount;
    if (!salaryUsed.has(origin.id)) {
      const ids = allReleases.flatMap((event) => releaseRowsSchema.parse(object(event.payload).rows).filter((row) => row.provisionEntryId === origin.id).map((row) => row.transactionId));
      const entries = ids.length ? await tx.accountingEntry.findMany({ where: { transactionId: { in: ids }, type: "Débito" }, select: { accountId: true, valueDecimal: true } }) : [];
      salaryUsed.set(origin.id, entries.filter((entry) => entry.accountId === policy.liabilityAccountId).reduce((sum, entry) => sum.plus(entry.valueDecimal ?? 0), new Prisma.Decimal(0)));
      employerUsed.set(origin.id, entries.filter((entry) => entry.accountId === policy.employerLiabilityAccountId).reduce((sum, entry) => sum.plus(entry.valueDecimal ?? 0), new Prisma.Decimal(0)));
    }
    const salaryAvailable = remuneration.minus(salaryUsed.get(origin.id)!);
    const salaryValue = details.component === "EMPLOYER" ? new Prisma.Decimal(0) : details.component === "GROSS" ? value : Prisma.Decimal.min(value, Prisma.Decimal.max(0, salaryAvailable));
    if (salaryValue.gt(salaryAvailable)) throw new Error("Baixa excede a remuneração provisionada do componente do empenho.");
    const employerValue = value.minus(salaryValue);
    if (employerValue.gt(0) && !policy.employerLiabilityAccountId) throw new Error("Encargos sem passivo próprio conciliado.");
    if (employerValue.plus(employerUsed.get(origin.id)!).gt(origin.amount.minus(remuneration))) throw new Error("Baixa excede a parcela de encargos efetivamente provisionada.");
    const lines: Array<{ accountId: string; type: "Débito" | "Crédito"; value: Prisma.Decimal }> = [{ accountId: vpd[0].accountId, type: "Crédito", value }];
    if (salaryValue.gt(0)) lines.push({ accountId: policy.liabilityAccountId, type: "Débito", value: salaryValue });
    if (employerValue.gt(0)) lines.push({ accountId: policy.employerLiabilityAccountId!, type: "Débito", value: employerValue });
    const transaction = await postAccountingTransactionInTransaction(tx, actor, { financialYearId: native.financialYearId, governmentEntityId: native.governmentEntityId ?? undefined, budgetUnitId: policy.budgetUnitId, date: settlement.date, history: `Baixa de ${origin.kind} na liquidação ${settlement.id}`, lines, sourceModule: "RH", sourceType: "HR_PROVISION_SETTLEMENT", sourceId: reservation.id, eventType: "PROVISAO_BAIXADA_LIQUIDACAO", idempotencyKey: `RH:PROVISION:${reservation.id}:SETTLEMENT:${settlement.id}` });
    usedOrigins.set(origin.id, totalUsed.plus(value));
    salaryUsed.set(origin.id, salaryUsed.get(origin.id)!.plus(salaryValue));
    employerUsed.set(origin.id, employerUsed.get(origin.id)!.plus(employerValue));
    rows.push({ consumptionEntryId: reservation.id, provisionEntryId: origin.id, amount: value.toFixed(2), transactionId: transaction.id });
    remaining = remaining.minus(value);
  }
  if (!rows.length) return;
  const event = await enqueueHrIntegration(tx, { sourceKey, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "PROVISOES_BAIXADAS_LIQUIDACAO", payload: { settlementId: settlement.id, commitmentId: settlement.commitmentId, rows } });
  await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "CONCLUIDA" } });
}

export async function reversePayrollProvisionSettlement(tx: Prisma.TransactionClient, actor: FinanceActor, settlementId: string, date: Date) {
  const settlement = await tx.settlement.findUniqueOrThrow({ where: { id: settlementId }, include: { commitment: { include: { reservation: { include: { expense: true } } } } } });
  if (settlement.commitment.reservation?.expense?.sourceModule !== "RH") return;
  const event = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: `CONTABIL:PROVISAO:BAIXA:${settlementId}` } });
  if (!event || event.status === "ESTORNADA") return;
  for (const row of releaseRowsSchema.parse(object(event.payload).rows)) {
    const original = await tx.accountingTransaction.findUniqueOrThrow({ where: { id: row.transactionId }, include: { entries: true } });
    await postAccountingTransactionInTransaction(tx, actor, { financialYearId: original.financialYearId, governmentEntityId: original.governmentEntityId ?? undefined, budgetUnitId: original.budgetUnitId ?? undefined, date, history: `Estorno de baixa de provisão da liquidação ${settlementId}`, lines: original.entries.map((entry) => ({ originalEntryId: entry.id, accountId: entry.accountId, type: entry.type === "Débito" ? "Crédito" : "Débito", value: entry.valueDecimal ?? entry.value })), sourceModule: "RH", sourceType: "HR_PROVISION_SETTLEMENT_REVERSAL", sourceId: row.consumptionEntryId, eventType: "PROVISAO_BAIXA_LIQUIDACAO_ESTORNADA", idempotencyKey: `RH:PROVISION:SETTLEMENT:${settlementId}:REVERSE:${row.transactionId}`, reversalOfId: original.id });
  }
  await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "ESTORNADA" } });
  const reversal = await enqueueHrIntegration(tx, { sourceKey: `ESTORNO:${event.sourceKey}`, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "PROVISOES_BAIXA_LIQUIDACAO_ESTORNADA", payload: { originalEventId: event.id, settlementId, date: date.toISOString(), actorId: actor.usuarioId } });
  await tx.hrIntegrationEvent.update({ where: { id: reversal.id }, data: { status: "CONCLUIDA" } });
}

/** Records the paid stage of the provision using the existing canonical payment/treasury posting. */
export async function recordPayrollProvisionPayment(tx: Prisma.TransactionClient, actor: FinanceActor, paymentId: string) {
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { commitment: { include: { reservation: { include: { expense: true } } } } } });
  if (!payment.settlementId || payment.commitment.reservation?.expense?.sourceModule !== "RH") return;
  const release = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: `CONTABIL:PROVISAO:BAIXA:${payment.settlementId}` } });
  if (!release) return;
  if (release.status !== "CONCLUIDA" || payment.status !== "Paga" || !payment.valueDecimal) throw new Error("Pagamento de provisão exige liquidação conciliada e pagamento efetivado.");
  const sourceKey = `CONTABIL:PROVISAO:PAGAMENTO:${payment.id}`;
  if (await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } })) return;
  const originals = releaseRowsSchema.parse(object(release.payload).rows);
  const prior = await tx.hrIntegrationEvent.findMany({ where: { eventType: "PROVISOES_PAGAS", status: "CONCLUIDA", payload: { path: ["settlementId"], equals: payment.settlementId } } });
  const used = new Map<string, Prisma.Decimal>();
  for (const event of prior) for (const row of releaseRowsSchema.parse(object(event.payload).rows)) used.set(row.consumptionEntryId, (used.get(row.consumptionEntryId) ?? new Prisma.Decimal(0)).plus(row.amount));
  let remaining = payment.valueDecimal;
  const rows: ReleaseRow[] = [];
  for (const row of originals) {
    const available = new Prisma.Decimal(row.amount).minus(used.get(row.consumptionEntryId) ?? 0);
    if (available.lt(0)) throw new Error("Pagamentos de provisão excedem a baixa na liquidação; concilie o histórico.");
    const value = Prisma.Decimal.min(available, remaining);
    if (value.gt(0)) rows.push({ ...row, amount: value.toFixed(2) });
    remaining = remaining.minus(value);
  }
  if (!rows.length) return;
  const [posting, movement] = await Promise.all([
    tx.accountingTransaction.findUniqueOrThrow({ where: { idempotencyKey: `FINANCEIRO:PAYMENT:${payment.id}:PAGAMENTO_EFETIVADO` } }),
    tx.treasuryMovement.findUniqueOrThrow({ where: { idempotencyKey: `FINANCEIRO:PAYMENT:${payment.id}:TREASURY` } }),
  ]);
  if (actor.allowedBudgetUnitIds && (!posting.budgetUnitId || !actor.allowedBudgetUnitIds.includes(posting.budgetUnitId))) throw new Error("Pagamento de provisão fora das UGs autorizadas.");
  const event = await enqueueHrIntegration(tx, { sourceKey, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "PROVISOES_PAGAS", payload: { paymentId: payment.id, settlementId: payment.settlementId, commitmentId: payment.commitmentId, allocationMethod: "ORDEM_DAS_BAIXAS", rows, grossAmount: payment.valueDecimal.toFixed(2), netAmount: movement.valueDecimal.toFixed(2), retainedAmount: payment.valueDecimal.minus(movement.valueDecimal).toFixed(2), accountingTransactionId: posting.id, treasuryMovementId: movement.id, actorId: actor.usuarioId } });
  await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "CONCLUIDA" } });
}

export async function reversePayrollProvisionPayment(tx: Prisma.TransactionClient, actor: FinanceActor, paymentId: string, reason: string) {
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { commitment: { include: { reservation: { include: { expense: true } } } } } });
  if (payment.commitment.reservation?.expense?.sourceModule !== "RH") return;
  const original = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey: `CONTABIL:PROVISAO:PAGAMENTO:${paymentId}` } });
  if (!original || original.status === "ESTORNADA") return;
  const movement = await tx.treasuryMovement.findUniqueOrThrow({ where: { idempotencyKey: `FINANCEIRO:PAYMENT:${paymentId}:REVERSAL` } });
  const posting = await tx.accountingTransaction.findUniqueOrThrow({ where: { idempotencyKey: `FINANCEIRO:PAYMENT:${paymentId}:PAGAMENTO_ESTORNADO` } });
  const event = await enqueueHrIntegration(tx, { sourceKey: `ESTORNO:${original.sourceKey}`, domain: "FINANCEIRO", environment: "PRODUCAO", eventType: "PROVISOES_PAGAMENTO_ESTORNADO", payload: { originalEventId: original.id, paymentId, reason, actorId: actor.usuarioId, rows: releaseRowsSchema.parse(object(original.payload).rows), accountingTransactionId: posting.id, treasuryMovementId: movement.id } });
  await tx.hrIntegrationEvent.update({ where: { id: original.id }, data: { status: "ESTORNADA" } });
  await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "CONCLUIDA" } });
}
