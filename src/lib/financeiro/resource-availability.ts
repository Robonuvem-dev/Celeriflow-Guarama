import { Prisma, type PrismaClient } from "@prisma/client";
import { resolveFinancialReportScope } from "./report-scope";
import { getBankResourceSourceBalance } from "./bank-resource-sources";

type Actor = { allowedBudgetUnitIds?: string[] };
type Row = { sourceId: string; sourceCode: string; sourceName: string; cash: Prisma.Decimal; commitments: Prisma.Decimal; carryForwards: Prisma.Decimal; extras: Prisma.Decimal };
const decimal = (value: Prisma.Decimal | null) => { if (!value?.isFinite()) throw new Error("Obrigação financeira sem valor Decimal conciliado."); return value; };
const jsonObject = (value: Prisma.JsonValue): Prisma.JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};

/** Current operational availability: gross unpaid obligations plus their separate extra-budget liabilities. */
export async function readResourceAvailability(db: PrismaClient, actor: Actor, input: { financialYearId: string; governmentEntityId: string; budgetUnitId?: string; resourceSourceIds?: string[] }) {
  return db.$transaction(async tx => {
    const scope = await resolveFinancialReportScope(tx, input.financialYearId, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.budgetUnitIds?.length || !scope.governmentEntityId) throw new Error("Disponibilidade exige ente e ao menos uma unidade autorizada.");
    const selected = input.resourceSourceIds?.length ? [...new Set(input.resourceSourceIds)] : undefined;
    const sources = await tx.resourceSource.findMany({ where: selected ? { id: { in: selected } } : {}, orderBy: { code: "asc" } });
    if (selected && sources.length !== selected.length) throw new Error("Uma das fontes selecionadas não foi encontrada.");
    const rows = new Map<string, Row>(sources.map(source => [source.id, { sourceId: source.id, sourceCode: source.code, sourceName: source.name, cash: new Prisma.Decimal(0), commitments: new Prisma.Decimal(0), carryForwards: new Prisma.Decimal(0), extras: new Prisma.Decimal(0) }]));
    const add = (sourceId: string | null, column: "cash" | "commitments" | "carryForwards" | "extras", value: Prisma.Decimal) => {
      if (!sourceId) throw new Error("Obrigação sem fonte documental conciliada.");
      const row = rows.get(sourceId);
      if (row) row[column] = row[column].plus(value);
    };
    const accounts = await tx.bankAccount.findMany({ where: { budgetUnitId: { in: scope.budgetUnitIds } }, select: { id: true } });
    const cashSources = await tx.treasuryMovement.findMany({ where: { bankAccountId: { in: accounts.map(account => account.id) }, status: "Confirmado" }, distinct: ["bankAccountId", "resourceSourceId"], select: { bankAccountId: true, resourceSourceId: true } });
    if (cashSources.some(movement => !movement.resourceSourceId)) throw new Error("Relatório exige conciliação dos movimentos bancários históricos sem fonte.");
    const redistributionSources = await tx.revenueResourceRedistribution.findMany({ where: { revenue: { bankAccountId: { in: accounts.map(account => account.id) } } }, select: { revenue: { select: { bankAccountId: true } }, destinationResourceSourceId: true } });
    const positions = new Map(cashSources.map(movement => [JSON.stringify([movement.bankAccountId, movement.resourceSourceId]), { bankAccountId: movement.bankAccountId, sourceId: movement.resourceSourceId! }]));
    for (const movement of redistributionSources) if (movement.revenue.bankAccountId) positions.set(JSON.stringify([movement.revenue.bankAccountId, movement.destinationResourceSourceId]), { bankAccountId: movement.revenue.bankAccountId, sourceId: movement.destinationResourceSourceId });
    for (const position of positions.values()) if (rows.has(position.sourceId)) add(position.sourceId, "cash", await getBankResourceSourceBalance(tx, position.bankAccountId, position.sourceId));
    const commitments = await tx.commitment.findMany({ where: { status: { in: ["Emitido", "Liquidado", "Pago"] }, appropriation: { financialYearId: input.financialYearId, budgetUnitId: { in: scope.budgetUnitIds } } }, include: { appropriation: { select: { resourceSourceId: true } }, movements: { select: { type: true, valueDecimal: true } }, payments: { where: { status: "Paga" }, select: { valueDecimal: true } } } });
    for (const commitment of commitments) {
      const effective = commitment.movements.reduce((total, movement) => movement.type === "Reforço" ? total.plus(decimal(movement.valueDecimal)) : total.minus(decimal(movement.valueDecimal)), decimal(commitment.valueDecimal));
      const paid = commitment.payments.reduce((total, payment) => total.plus(decimal(payment.valueDecimal)), new Prisma.Decimal(0));
      add(commitment.appropriation.resourceSourceId, "commitments", Prisma.Decimal.max(0, effective.minus(paid)));
    }
    const payables = await tx.payableCarryForward.findMany({ where: { status: { in: ["PENDENTE", "PAGAMENTO_PARCIAL_RASTREADO", "PAGO_RASTREADO"] }, OR: [{ successorPayableCarryForward: null }, { successorPayableCarryForward: { is: { status: "TRANSPORTE_DESMOVIMENTADO" } } }], originFinancialYear: { year: { lt: scope.year } }, financialYear: { year: { lte: scope.year } }, commitment: { appropriation: { budgetUnitId: { in: scope.budgetUnitIds } } } }, include: { commitment: { select: { appropriation: { select: { resourceSourceId: true } } } }, nativePayments: { where: { status: "Paga" }, select: { valueDecimal: true } }, events: { where: { action: "PAGAMENTO_RASTREADO", payment: { is: { status: "Paga", payableCarryForwardId: null } } }, select: { valueDecimal: true } } } });
    for (const payable of payables) {
      const paid = [...payable.nativePayments, ...payable.events].reduce((total, payment) => total.plus(decimal(payment.valueDecimal)), new Prisma.Decimal(0));
      add(payable.commitment.appropriation.resourceSourceId, "carryForwards", Prisma.Decimal.max(0, payable.valueDecimal.minus(paid)));
    }
    const extras = await tx.withholdingPayable.findMany({ where: { status: "Pendente", retention: { payment: { status: "Paga", commitment: { appropriation: { budgetUnitId: { in: scope.budgetUnitIds } } } } } }, include: { retention: { select: { payment: { select: { commitment: { select: { appropriation: { select: { resourceSourceId: true } } } } } } } } } });
    for (const extra of extras) add(extra.retention.payment.commitment.appropriation.resourceSourceId, "extras", decimal(extra.valueDecimal));
    const credits = await tx.taxRegistryEntry.findMany({ where: { category: "TAX_CREDIT", status: { not: "ESTORNADO" }, AND: [{ data: { path: ["governmentEntityId"], equals: scope.governmentEntityId } }, { OR: scope.budgetUnitIds.map(id => ({ data: { path: ["budgetUnitId"], equals: id } })) }] }, select: { id: true, data: true } });
    const creditSources = new Map<string, string>();
    for (const credit of credits) {
      const data = jsonObject(credit.data);
      if (typeof data.resourceSourceId !== "string" || typeof data.available !== "string") throw new Error("Crédito extraorçamentário sem fonte ou saldo conciliado.");
      creditSources.set(credit.id, data.resourceSourceId);
      const available = new Prisma.Decimal(data.available);
      if (!available.isFinite() || available.lt(0)) throw new Error("Saldo de crédito extraorçamentário inválido.");
      add(data.resourceSourceId, "extras", available);
    }
    const refunds = await tx.taxRegistryEntry.findMany({ where: { category: "REFUND_REQUEST", status: { in: ["PENDENTE_APROVACAO", "APROVADA_AGUARDANDO_TESOURARIA"] }, OR: [...creditSources.keys()].map(id => ({ data: { path: ["sourceCreditId"], equals: id } })) }, select: { data: true } });
    for (const refund of refunds) {
      const data = jsonObject(refund.data);
      if (typeof data.sourceCreditId !== "string" || typeof data.amount !== "string") throw new Error("Restituição pendente sem origem ou valor conciliado.");
      add(creditSources.get(data.sourceCreditId) ?? null, "extras", new Prisma.Decimal(data.amount));
    }
    return { ...scope, financialYearId: input.financialYearId, positionDate: new Date().toISOString(), rows: [...rows.values()].map(row => ({ sourceId: row.sourceId, sourceCode: row.sourceCode, sourceName: row.sourceName, availableBalance: row.cash.toFixed(2), commitmentsPayable: row.commitments.toFixed(2), carryForwardsPayable: row.carryForwards.toFixed(2), extraPayables: row.extras.toFixed(2), deficitSurplus: row.cash.minus(row.commitments).minus(row.carryForwards).minus(row.extras).toFixed(2) })) };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}
