import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import type { JsonObject, JsonValue } from "@/db/json";
import { withDatabaseTransaction } from "@/db/transaction";
import { resolveFinancialReportScope } from "./report-scope";
import { getBankResourceSourceBalance } from "./bank-resource-sources";
import { listAvailabilityCashPositions, listAvailabilityCommitments, listAvailabilityPayables, listAvailabilitySources } from "@/db/repositories/finance/resource-availability";
import { listExtraNoteWithholdings, listFinancialTaxCredits, listReservedFinancialTaxRefunds } from "@/db/repositories/finance/extra-note-origins";

type Actor = { allowedBudgetUnitIds?: string[] };
type Row = { sourceId: string; sourceCode: string; sourceName: string; cash: Decimal; commitments: Decimal; carryForwards: Decimal; extras: Decimal };
const decimal = (value: Decimal | null) => { if (!value?.isFinite()) throw new Error("Obrigação financeira sem valor Decimal conciliado."); return value; };
const jsonObject = (value: JsonValue): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value : {};

/** Current operational availability: gross unpaid obligations plus their separate extra-budget liabilities. */
export async function readResourceAvailability(db: DatabaseConnection, actor: Actor, input: { financialYearId: string; governmentEntityId: string; budgetUnitId?: string; resourceSourceIds?: string[] }) {
  return withDatabaseTransaction(db, async tx => {
    const scope = await resolveFinancialReportScope(tx, input.financialYearId, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, budgetUnitIds: actor.allowedBudgetUnitIds });
    if (!scope.budgetUnitIds?.length || !scope.governmentEntityId) throw new Error("Disponibilidade exige ente e ao menos uma unidade autorizada.");
    const selected = input.resourceSourceIds?.length ? [...new Set(input.resourceSourceIds)] : undefined;
    const sources = await listAvailabilitySources(tx, selected);
    if (selected && sources.length !== selected.length) throw new Error("Uma das fontes selecionadas não foi encontrada.");
    const rows = new Map<string, Row>(sources.map(source => [source.id, { sourceId: source.id, sourceCode: source.code, sourceName: source.name, cash: new Decimal(0), commitments: new Decimal(0), carryForwards: new Decimal(0), extras: new Decimal(0) }]));
    const add = (sourceId: string | null, column: "cash" | "commitments" | "carryForwards" | "extras", value: Decimal) => {
      if (!sourceId) throw new Error("Obrigação sem fonte documental conciliada.");
      const row = rows.get(sourceId);
      if (row) row[column] = row[column].plus(value);
    };
    const { cashSources, redistributionSources } = await listAvailabilityCashPositions(tx, scope.budgetUnitIds);
    if (cashSources.some(movement => !movement.resourceSourceId)) throw new Error("Relatório exige conciliação dos movimentos bancários históricos sem fonte.");
    const positions = new Map(cashSources.map(movement => [JSON.stringify([movement.bankAccountId, movement.resourceSourceId]), { bankAccountId: movement.bankAccountId, sourceId: movement.resourceSourceId! }]));
    for (const movement of redistributionSources) positions.set(JSON.stringify([movement.bankAccountId, movement.destinationResourceSourceId]), { bankAccountId: movement.bankAccountId, sourceId: movement.destinationResourceSourceId });
    for (const position of positions.values()) if (rows.has(position.sourceId)) add(position.sourceId, "cash", await getBankResourceSourceBalance(tx, position.bankAccountId, position.sourceId));
    const commitments = await listAvailabilityCommitments(tx, input.financialYearId, scope.budgetUnitIds);
    for (const commitment of commitments) {
      const effective = commitment.movements.reduce((total, movement) => movement.type === "Reforço" ? total.plus(decimal(movement.valueDecimal)) : total.minus(decimal(movement.valueDecimal)), decimal(commitment.valueDecimal));
      const paid = commitment.payments.reduce((total, payment) => total.plus(decimal(payment.valueDecimal)), new Decimal(0));
      add(commitment.appropriation.resourceSourceId, "commitments", Decimal.max(0, effective.minus(paid)));
    }
    const payables = await listAvailabilityPayables(tx, scope.year, scope.budgetUnitIds);
    for (const payable of payables) {
      const paid = [...payable.nativePayments, ...payable.events].reduce((total, payment) => total.plus(decimal(payment.valueDecimal)), new Decimal(0));
      add(payable.commitment.appropriation.resourceSourceId, "carryForwards", Decimal.max(0, payable.valueDecimal.minus(paid)));
    }
    const extras = await listExtraNoteWithholdings(tx, scope.budgetUnitIds);
    for (const extra of extras) add(extra.retention.payment.commitment.appropriation.resourceSourceId, "extras", decimal(extra.valueDecimal));
    const credits = await listFinancialTaxCredits(tx, scope.governmentEntityId, scope.budgetUnitIds);
    const creditSources = new Map<string, string>();
    for (const credit of credits) {
      const data = jsonObject(credit.data);
      if (typeof data.resourceSourceId !== "string" || typeof data.available !== "string") throw new Error("Crédito extraorçamentário sem fonte ou saldo conciliado.");
      creditSources.set(credit.id, data.resourceSourceId);
      const available = new Decimal(data.available);
      if (!available.isFinite() || available.lt(0)) throw new Error("Saldo de crédito extraorçamentário inválido.");
      add(data.resourceSourceId, "extras", available);
    }
    const refunds = await listReservedFinancialTaxRefunds(tx, [...creditSources.keys()]);
    for (const refund of refunds) {
      const data = jsonObject(refund.data);
      if (typeof data.sourceCreditId !== "string" || typeof data.amount !== "string") throw new Error("Restituição pendente sem origem ou valor conciliado.");
      add(creditSources.get(data.sourceCreditId) ?? null, "extras", new Decimal(data.amount));
    }
    return { ...scope, financialYearId: input.financialYearId, positionDate: new Date().toISOString(), rows: [...rows.values()].map(row => ({ sourceId: row.sourceId, sourceCode: row.sourceCode, sourceName: row.sourceName, availableBalance: row.cash.toFixed(2), commitmentsPayable: row.commitments.toFixed(2), carryForwardsPayable: row.carryForwards.toFixed(2), extraPayables: row.extras.toFixed(2), deficitSurplus: row.cash.minus(row.commitments).minus(row.carryForwards).minus(row.extras).toFixed(2) })) };
  }, { isolationLevel: "repeatable read", timeoutMs: 60000 });
}
