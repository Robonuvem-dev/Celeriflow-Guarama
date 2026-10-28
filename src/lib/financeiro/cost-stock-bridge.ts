import { Decimal } from "@/db/decimal";
import { sql } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import type { MaterialMovementRecord } from "@/lib/contracts/assets-stock";
import { findCostPolicy, findCostSourceByOrigin } from "@/db/repositories/finance/cost-ledger";
import { hasActiveCostUserBinding, hasActiveSettlementCost, hasCostReceiptStock, listCostMaterialReturns, listCostSourcesByEvidence, readCostDepartment, readCostMaterial, readCostSettlement, readCostStockValuation, readCostUnitSecretariat, readCostWarehouse } from "@/db/repositories/finance/cost-origins";
import { assertCostScope, MunicipalCostError, recordMunicipalCostSource, reduceMunicipalCostSource, municipalCostSourceCeiling, resolveCostRecognitionYear } from "./cost-ledger";
import type { CostActor } from "./cost-types";

function consumptionType(movement: Pick<MaterialMovementRecord, "type" | "operation" | "reason" | "settlementId">) {
  if (movement.type !== "Saída" || movement.operation !== "REGULAR" || !movement.settlementId) return null;
  const reason = movement.reason?.split(":")[0];
  return reason === "CONSUMO_ORCAMENTARIO" ? "STOCK_CONSUMPTION" as const : reason === "CONSUMO_ORCAMENTARIO_DIRETO" ? "IMMEDIATE_MATERIAL" as const : null;
}

/** Consumption requires an explicit active financial origin; warehouse names do not infer an UG. */
export async function recordStockMunicipalCosts(tx: DatabaseTransaction, actor: CostActor, movement: MaterialMovementRecord) {
  const sourceType = consumptionType(movement);
  if (!sourceType) return;
  await tx.execute(sql`SELECT id FROM "Settlement" WHERE id=${movement.settlementId!} FOR UPDATE`);
  const settlement = await readCostSettlement(tx, movement.settlementId!);
  const appropriation = settlement.commitment.appropriation;
  if (!appropriation.financialYear.governmentEntityId) return;
  const policy = await findCostPolicy(tx, appropriation.financialYear.governmentEntityId, movement.date);
  if (!policy?.enabled || !Array.isArray(policy.sourceTypes) || !policy.sourceTypes.includes(sourceType)) return;
  await assertCostScope(tx, actor, appropriation.financialYearId, appropriation.budgetUnitId);
  if (!await hasActiveCostUserBinding(tx, actor.usuarioId, appropriation.budgetUnitId)) throw new MunicipalCostError("Responsável pelo consumo deve possuir vínculo ativo com a UG financeira.");
  if (settlement.status !== "Liquidado" || !settlement.valueDecimal || !movement.quantityDecimal || !movement.unitValueDecimal || !movement.totalValueDecimal) throw new MunicipalCostError("Consumo exige liquidação ativa e quantidade/valor Decimal registrados na saída.");
  if (movement.totalValueDecimal.isZero()) return;
  const recognitionYear = await resolveCostRecognitionYear(tx, actor, appropriation.financialYearId, appropriation.budgetUnitId, movement.date);
  const nature = appropriation.expenseNature.code.replace(/\D/g, "");
  const expense = settlement.commitment.reservation?.expense;
  if (nature.startsWith("4") || (expense?.sourceModule === "RH" && expense.sourceType === "ADVANCE_ALLOWANCE")) throw new MunicipalCostError("Investimento ou adiantamento não é origem de consumo de material.");
  if (!settlement.commitment.purchaseReceiptId && !nature.startsWith("339030")) throw new MunicipalCostError("A liquidação deve identificar aquisição de material ou recebimento estocável, sem custo antecipado.");
  const material = await readCostMaterial(tx, movement.materialId);
  if (material.type === "PATRIMONIO") throw new MunicipalCostError("Tombamento patrimonial não é consumo de serviço; aproprie pela depreciação aplicável.");
  if (settlement.commitment.purchaseReceiptId && (!movement.stockId || !await hasCostReceiptStock(tx, settlement.commitment.purchaseReceiptId, movement.materialId, movement.warehouseId, movement.stockId))) throw new MunicipalCostError("Material/almoxarifado/lote da saída não pertence ao recebimento da liquidação.");
  if (movement.date < settlement.date) throw new MunicipalCostError("Consumo financeiro não pode anteceder a liquidação vinculada.");
  const [warehouse, department, unit] = await Promise.all([
    readCostWarehouse(tx, movement.warehouseId),
    movement.departmentId ? readCostDepartment(tx, movement.departmentId) : null,
    readCostUnitSecretariat(tx, appropriation.budgetUnitId),
  ]);
  if (!warehouse.costCenter || warehouse.costCenter.governmentEntityId !== appropriation.financialYear.governmentEntityId || warehouse.costCenter.secretariatId !== unit || (department && department.secretariatId !== unit)) throw new MunicipalCostError("Almoxarifado/centro e destino do consumo devem estar conciliados à entidade e secretaria da UG financeira.");
  const duplicate = await hasActiveSettlementCost(tx, settlement.id);
  if (duplicate) throw new MunicipalCostError("A liquidação já possui origem de custo antecipado; reconcilie e cancele essa origem antes de registrar consumo, evitando duplicidade.");
  // Lock the shared financial origin so concurrent consumptions cannot exceed delivery proof.
  const origins = await listCostSourcesByEvidence(tx, ["STOCK_CONSUMPTION", "IMMEDIATE_MATERIAL"], "settlementId", settlement.id, true);
  let consumed = new Decimal(0);
  for (const origin of origins) if (origin.sourceId !== movement.id) consumed = consumed.plus(await municipalCostSourceCeiling(tx, origin));
  if (consumed.plus(movement.totalValueDecimal).gt(settlement.valueDecimal)) throw new MunicipalCostError("Consumo valorizado excede o valor da liquidação vinculada, líquido das devoluções registradas.");
  const stock = movement.stockId ? await readCostStockValuation(tx, movement.stockId, movement.id) : null;
  const valuation = stock?.event;
  if (stock?.valuationEnabled && (!valuation || valuation.valuation.budgetUnitId !== appropriation.budgetUnitId || !valuation.amountDelta.abs().eq(movement.totalValueDecimal))) throw new MunicipalCostError("Valorização e origem financeira devem conciliar valor, ente e UG.");
   return recordMunicipalCostSource(tx, actor, { financialYearId: recognitionYear.id, budgetUnitId: appropriation.budgetUnitId, sourceType, sourceId: movement.id, expenseDate: movement.date, amount: movement.totalValueDecimal, dimensions: { materialId: movement.materialId, categoryId: material.categoryId, ...(material.subcategoryId ? { subcategoryId: material.subcategoryId } : {}), warehouseId: movement.warehouseId, costCenterId: warehouse.costCenter.id, appropriationId: appropriation.id, ...(movement.departmentId ? { departmentId: movement.departmentId } : {}) }, evidence: { movementId: movement.id, settlementId: settlement.id, commitmentId: settlement.commitmentId, acquisitionFinancialYearId: appropriation.financialYearId, recognitionFinancialYearId: recognitionYear.id, quantity: movement.quantityDecimal.toFixed(6), unitValue: movement.unitValueDecimal.toFixed(6), amount: movement.totalValueDecimal.toFixed(2), materialCategory: { id: material.categoryId, code: material.category.code, name: material.category.name }, materialSubcategory: material.subcategory ? { id: material.subcategoryId, code: material.subcategory.code, name: material.subcategory.name } : null, valuationMethod: valuation?.valuation.method ?? "RECORDED_MOVEMENT_VALUE", valuationEventId: valuation?.id ?? null, valuationHash: valuation?.hash ?? null, receiptId: settlement.commitment.purchaseReceiptId, stockId: movement.stockId } });
}

export async function reduceStockMunicipalCosts(tx: DatabaseTransaction, actor: CostActor, original: MaterialMovementRecord, correction: MaterialMovementRecord) {
  const sourceType = consumptionType(original);
  if (!sourceType) return;
  const source = await findCostSourceByOrigin(tx, sourceType, original.id);
  if (!source) return;
  if (!await hasActiveCostUserBinding(tx, actor.usuarioId, source.budgetUnitId)) throw new MunicipalCostError("Responsável pela devolução deve possuir vínculo ativo com a UG da origem.");
  if (!original.quantityDecimal || !correction.quantityDecimal) throw new MunicipalCostError("Devolução de consumo apropriado exige quantidades Decimal da origem e da correção.");
  const previous = await listCostMaterialReturns(tx, original.id);
  if (previous.some(row => !row.quantityDecimal)) throw new MunicipalCostError("Devoluções anteriores sem quantidade Decimal exigem conciliação.");
  const returnedBefore = previous.filter(row => row.id !== correction.id).reduce((sum, row) => sum.plus(row.quantityDecimal!), new Decimal(0));
  const returnedAfter = correction.operation === "REVERSAL" ? original.quantityDecimal : returnedBefore.plus(correction.quantityDecimal);
  if (returnedAfter.gt(original.quantityDecimal) || original.quantityDecimal.lte(0)) throw new MunicipalCostError("Devolução supera a quantidade original conciliada.");
  // Cumulative rounding conserves all cents, including successive partial returns.
  const target = source.amount.mul(returnedAfter).div(original.quantityDecimal).toDecimalPlaces(2);
  const reduced = source.amount.minus(await municipalCostSourceCeiling(tx, source));
  const amount = target.minus(reduced);
  if (amount.isZero()) return;
  return reduceMunicipalCostSource(tx, actor, { sourceId: source.id, date: correction.date, amount, reason: correction.reason ?? "Devolução/estorno de consumo", idempotencyKey: `MATERIAL_COST_RETURN:${correction.id}`, evidence: { originalMovementId: original.id, correctionMovementId: correction.id, operation: correction.operation, returnedBefore: returnedBefore.toFixed(6), returnedAfter: returnedAfter.toFixed(6), originalQuantity: original.quantityDecimal.toFixed(6) } });
}
