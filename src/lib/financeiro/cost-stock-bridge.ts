import { Prisma, type MaterialMovement } from "@prisma/client";
import { assertCostScope, MunicipalCostError, recordMunicipalCostSource, reduceMunicipalCostSource, municipalCostSourceCeiling, resolveCostRecognitionYear } from "./cost-ledger";
import type { CostActor } from "./cost-types";

function consumptionType(movement: Pick<MaterialMovement, "type" | "operation" | "reason" | "settlementId">) {
  if (movement.type !== "Saída" || movement.operation !== "REGULAR" || !movement.settlementId) return null;
  const reason = movement.reason?.split(":")[0];
  return reason === "CONSUMO_ORCAMENTARIO" ? "STOCK_CONSUMPTION" as const : reason === "CONSUMO_ORCAMENTARIO_DIRETO" ? "IMMEDIATE_MATERIAL" as const : null;
}

/** Consumption requires an explicit active financial origin; warehouse names do not infer an UG. */
export async function recordStockMunicipalCosts(tx: Prisma.TransactionClient, actor: CostActor, movement: MaterialMovement) {
  const sourceType = consumptionType(movement);
  if (!sourceType) return;
  await tx.$queryRaw`SELECT id FROM "Settlement" WHERE id=${movement.settlementId!} FOR UPDATE`;
  const settlement = await tx.settlement.findUniqueOrThrow({ where: { id: movement.settlementId! }, include: { commitment: { include: { appropriation: { include: { financialYear: true, expenseNature: true } }, reservation: { include: { expense: true } } } } } });
  const appropriation = settlement.commitment.appropriation;
  if (!appropriation.financialYear.governmentEntityId) return;
  const policy = await tx.municipalCostPolicy.findFirst({ where: { governmentEntityId: appropriation.financialYear.governmentEntityId, effectiveFrom: { lte: movement.date } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }, { id: "desc" }] });
  if (!policy?.enabled || !Array.isArray(policy.sourceTypes) || !policy.sourceTypes.includes(sourceType)) return;
  await assertCostScope(tx, actor, appropriation.financialYearId, appropriation.budgetUnitId);
  if (!await tx.usuario.count({ where: { id: actor.usuarioId, ativo: true, unidadesGestoras: { some: { budgetUnitId: appropriation.budgetUnitId } } } })) throw new MunicipalCostError("Responsável pelo consumo deve possuir vínculo ativo com a UG financeira.");
  if (settlement.status !== "Liquidado" || !settlement.valueDecimal || !movement.quantityDecimal || !movement.unitValueDecimal || !movement.totalValueDecimal) throw new MunicipalCostError("Consumo exige liquidação ativa e quantidade/valor Decimal registrados na saída.");
  if (movement.totalValueDecimal.isZero()) return;
  const recognitionYear = await resolveCostRecognitionYear(tx, actor, appropriation.financialYearId, appropriation.budgetUnitId, movement.date);
  const nature = appropriation.expenseNature.code.replace(/\D/g, "");
  const expense = settlement.commitment.reservation?.expense;
  if (nature.startsWith("4") || (expense?.sourceModule === "RH" && expense.sourceType === "ADVANCE_ALLOWANCE")) throw new MunicipalCostError("Investimento ou adiantamento não é origem de consumo de material.");
  if (!settlement.commitment.purchaseReceiptId && !nature.startsWith("339030")) throw new MunicipalCostError("A liquidação deve identificar aquisição de material ou recebimento estocável, sem custo antecipado.");
   const material = await tx.material.findUniqueOrThrow({ where: { id: movement.materialId }, select: { type: true, categoryId: true, category: { select: { code: true, name: true } }, subcategoryId: true, subcategory: { select: { code: true, name: true } } } });
  if (material.type === "PATRIMONIO") throw new MunicipalCostError("Tombamento patrimonial não é consumo de serviço; aproprie pela depreciação aplicável.");
  if (settlement.commitment.purchaseReceiptId && (!movement.stockId || !await tx.purchaseReceiptItem.count({ where: { purchaseReceiptId: settlement.commitment.purchaseReceiptId, materialId: movement.materialId, warehouseId: movement.warehouseId, stockMovement: { stockId: movement.stockId } } }))) throw new MunicipalCostError("Material/almoxarifado/lote da saída não pertence ao recebimento da liquidação.");
  if (movement.date < settlement.date) throw new MunicipalCostError("Consumo financeiro não pode anteceder a liquidação vinculada.");
  const [warehouse, department, unit] = await Promise.all([
    tx.warehouse.findUniqueOrThrow({ where: { id: movement.warehouseId }, include: { costCenter: true } }),
    movement.departmentId ? tx.department.findUniqueOrThrow({ where: { id: movement.departmentId }, select: { secretariatId: true } }) : null,
    tx.budgetUnit.findUniqueOrThrow({ where: { id: appropriation.budgetUnitId }, select: { secretariatId: true } }),
  ]);
  if (!warehouse.costCenter || warehouse.costCenter.governmentEntityId !== appropriation.financialYear.governmentEntityId || warehouse.costCenter.secretariatId !== unit.secretariatId || (department && department.secretariatId !== unit.secretariatId)) throw new MunicipalCostError("Almoxarifado/centro e destino do consumo devem estar conciliados à entidade e secretaria da UG financeira.");
  const duplicate = await tx.municipalCostSource.findFirst({ where: { sourceId: settlement.id, sourceType: { in: ["SETTLEMENT", "PAYROLL"] }, status: "ACTIVE" } });
  if (duplicate) throw new MunicipalCostError("A liquidação já possui origem de custo antecipado; reconcilie e cancele essa origem antes de registrar consumo, evitando duplicidade.");
  // Lock the shared financial origin so concurrent consumptions cannot exceed delivery proof.
  const origins = await tx.municipalCostSource.findMany({ where: { sourceType: { in: ["STOCK_CONSUMPTION", "IMMEDIATE_MATERIAL"] }, status: "ACTIVE", snapshot: { path: ["evidence", "settlementId"], equals: settlement.id } } });
  let consumed = new Prisma.Decimal(0);
  for (const origin of origins) if (origin.sourceId !== movement.id) consumed = consumed.plus(await municipalCostSourceCeiling(tx, origin));
  if (consumed.plus(movement.totalValueDecimal).gt(settlement.valueDecimal)) throw new MunicipalCostError("Consumo valorizado excede o valor da liquidação vinculada, líquido das devoluções registradas.");
  const stock = movement.stockId ? await tx.materialStock.findUnique({ where: { id: movement.stockId } }) : null;
  const valuation = stock?.valuationEnabled ? await tx.materialStockValuationEvent.findUnique({ where: { movementId: movement.id }, include: { valuation: true } }) : null;
  if (stock?.valuationEnabled && (!valuation || valuation.valuation.budgetUnitId !== appropriation.budgetUnitId || !valuation.amountDelta.abs().eq(movement.totalValueDecimal))) throw new MunicipalCostError("Valorização e origem financeira devem conciliar valor, ente e UG.");
   return recordMunicipalCostSource(tx, actor, { financialYearId: recognitionYear.id, budgetUnitId: appropriation.budgetUnitId, sourceType, sourceId: movement.id, expenseDate: movement.date, amount: movement.totalValueDecimal, dimensions: { materialId: movement.materialId, categoryId: material.categoryId, ...(material.subcategoryId ? { subcategoryId: material.subcategoryId } : {}), warehouseId: movement.warehouseId, costCenterId: warehouse.costCenter.id, appropriationId: appropriation.id, ...(movement.departmentId ? { departmentId: movement.departmentId } : {}) }, evidence: { movementId: movement.id, settlementId: settlement.id, commitmentId: settlement.commitmentId, acquisitionFinancialYearId: appropriation.financialYearId, recognitionFinancialYearId: recognitionYear.id, quantity: movement.quantityDecimal.toFixed(6), unitValue: movement.unitValueDecimal.toFixed(6), amount: movement.totalValueDecimal.toFixed(2), materialCategory: { id: material.categoryId, code: material.category.code, name: material.category.name }, materialSubcategory: material.subcategory ? { id: material.subcategoryId, code: material.subcategory.code, name: material.subcategory.name } : null, valuationMethod: valuation?.valuation.method ?? "RECORDED_MOVEMENT_VALUE", valuationEventId: valuation?.id ?? null, valuationHash: valuation?.hash ?? null, receiptId: settlement.commitment.purchaseReceiptId, stockId: movement.stockId } });
}

export async function reduceStockMunicipalCosts(tx: Prisma.TransactionClient, actor: CostActor, original: MaterialMovement, correction: MaterialMovement) {
  const sourceType = consumptionType(original);
  if (!sourceType) return;
  const source = await tx.municipalCostSource.findUnique({ where: { sourceType_sourceId: { sourceType, sourceId: original.id } } });
  if (!source) return;
  if (!await tx.usuario.count({ where: { id: actor.usuarioId, ativo: true, unidadesGestoras: { some: { budgetUnitId: source.budgetUnitId } } } })) throw new MunicipalCostError("Responsável pela devolução deve possuir vínculo ativo com a UG da origem.");
  if (!original.quantityDecimal || !correction.quantityDecimal) throw new MunicipalCostError("Devolução de consumo apropriado exige quantidades Decimal da origem e da correção.");
  const previous = await tx.materialMovement.findMany({ where: { returnedMovementId: original.id, operation: "RETURN" }, select: { id: true, quantityDecimal: true } });
  if (previous.some(row => !row.quantityDecimal)) throw new MunicipalCostError("Devoluções anteriores sem quantidade Decimal exigem conciliação.");
  const returnedBefore = previous.filter(row => row.id !== correction.id).reduce((sum, row) => sum.plus(row.quantityDecimal!), new Prisma.Decimal(0));
  const returnedAfter = correction.operation === "REVERSAL" ? original.quantityDecimal : returnedBefore.plus(correction.quantityDecimal);
  if (returnedAfter.gt(original.quantityDecimal) || original.quantityDecimal.lte(0)) throw new MunicipalCostError("Devolução supera a quantidade original conciliada.");
  // Cumulative rounding conserves all cents, including successive partial returns.
  const target = source.amount.mul(returnedAfter).div(original.quantityDecimal).toDecimalPlaces(2);
  const reduced = source.amount.minus(await municipalCostSourceCeiling(tx, source));
  const amount = target.minus(reduced);
  if (amount.isZero()) return;
  return reduceMunicipalCostSource(tx, actor, { sourceId: source.id, date: correction.date, amount, reason: correction.reason ?? "Devolução/estorno de consumo", idempotencyKey: `MATERIAL_COST_RETURN:${correction.id}`, evidence: { originalMovementId: original.id, correctionMovementId: correction.id, operation: correction.operation, returnedBefore: returnedBefore.toFixed(6), returnedAfter: returnedAfter.toFixed(6), originalQuantity: original.quantityDecimal.toFixed(6) } });
}
