import { and, eq, gt, gte, inArray, isNull, lt, lte, or, sql, sum } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseTransaction } from "@/db/transaction";
import * as f from "@/db/schema/fleet";
import { departments } from "@/db/schema/administration";
import { procurementContracts } from "@/db/schema/procurement-core";
import { materials, materialStocks } from "@/db/schema/assets-stock";
import { fleetJson, requiredFleetRecord } from "@/db/repositories/fleet/records";
import { readFleetContract, readFleetPurchaseItem, readFleetStock, readFleetSupplier } from "@/db/repositories/fleet/sources";
import type { FleetContext as AppContext } from "@/lib/contracts/fleet";
import { canViewModule } from "@/lib/platform/tenant-context";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { requireValidCnpj } from "@/lib/identifiers/brazilian-identifiers";
import type { FleetScope } from "./service";
import { controlSchemas, newFleetCapability, validFleetCapability } from "./control-policy";
import { eligibleFleetDriver, FleetControlError, fleetControlReading, lockFleetResources, nextFleetCode, scopedFleetEvidence, scopedFleetUnit, type FleetControlTx } from "./control-access";
import { dateOnly, todayInBrazil } from "./contract";

export async function fleetProvider(tx: FleetControlTx, id: string, kind: string) {
  const [provider] = await tx.select().from(f.fleetProviders).where(and(eq(f.fleetProviders.id, id), eq(f.fleetProviders.kind, kind), eq(f.fleetProviders.active, true))).limit(1);
  if (!provider) throw new FleetControlError("Prestador não está credenciado para esta operação.");
  const supplier = await readFleetSupplier(tx, provider.supplierId);
  if (!supplier?.company || supplier.company.status !== "Ativo") throw new FleetControlError("Prestador precisa de empresa/CNPJ ativo no cadastro canônico.");
  return { ...provider, supplier, cnpj: requireValidCnpj(supplier.company.cnpj), name: supplier.company.corporateName };
}
export async function saveFleetProvider(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.provider.parse(raw);
  const supplier = await readFleetSupplier(tx, input.supplierId);
  if (!supplier?.company || supplier.company.status !== "Ativo") throw new FleetControlError("Fornecedor/empresa não disponível.");
  requireValidCnpj(supplier.company.cnpj);
  if (!scope.administrator) throw new FleetControlError("Credenciamento/revogação de prestador exige administração da Frota.");
  const result = requiredFleetRecord(await tx.insert(f.fleetProviders).values(input).onConflictDoUpdate({ target: [f.fleetProviders.supplierId, f.fleetProviders.kind], set: { active: input.active } }).returning());
  return { id: result.id, type: "PROVIDER" };
}
export async function saveFleetFuelAgreement(tx: FleetControlTx, scope: FleetScope, context: AppContext, raw: unknown) {
  const input = controlSchemas.fuelAgreement.parse(raw);
  if (!canViewModule(context.user, "COMPRAS")) throw new FleetControlError("Consulte a origem contratual com permissão de Compras.");
  const provider = await fleetProvider(tx, input.providerId, "POSTO");
  const contract = await readFleetContract(tx, input.contractId, and(eq(procurementContracts.status, "Vigente"), eq(procurementContracts.supplierId, provider.supplierId)));
  if (!contract || contract.startDate > new Date() || contract.endDate < new Date() || (!scope.administrator && contract.secretariatId !== context.user.secretariatId)) throw new FleetControlError("Contrato não vigente ou fora da secretaria autorizada.");
  const item = await readFleetPurchaseItem(tx, input.purchaseItemId, contract.processId);
  if (!item || (item.material?.unitOfMeasure || item.catalogItem?.unit || "").toUpperCase() !== "L") throw new FleetControlError("Item contratual deve ser combustível cadastrado em litros.");
  const quantity = new Decimal(input.contracted);
  if (quantity.lte(0) || quantity.gt(String(item.quantity))) throw new FleetControlError("Quantidade contratada inválida ou superior ao item de origem.");
  const evidence = await scopedFleetEvidence(tx, scope, input.evidenceVersionId);
  await lockFleetResources(tx, [`PURCHASE_ITEM:${item.id}`]);
  const [existing] = await tx.select().from(f.fleetFuelAgreements).where(and(eq(f.fleetFuelAgreements.contractId, contract.id), eq(f.fleetFuelAgreements.purchaseItemId, item.id), eq(f.fleetFuelAgreements.fuelType, input.fuelType))).limit(1);
  if (existing) throw new FleetControlError("Saldo contratual já registrado. Preserve o histórico e configure nova origem/termo de alteração.");
  const [used] = await tx.select({ contracted: sum(f.fleetFuelAgreements.contracted) }).from(f.fleetFuelAgreements).where(eq(f.fleetFuelAgreements.purchaseItemId, item.id));
  if (quantity.add(used.contracted || 0).gt(String(item.quantity))) throw new FleetControlError("As alocações de contratos superam o quantitativo do item da compra.");
  const result = requiredFleetRecord(await tx.insert(f.fleetFuelAgreements).values({ ...input, contracted: quantity, unitPrice: input.unitPrice ? new Decimal(input.unitPrice) : null, snapshot: fleetJson({ contractNumber: contract.number, processNumber: contract.process.number, modality: contract.process.modality, itemName: item.material?.name || item.catalogItem?.name || item.customName, quantity: String(item.quantity), evidenceHash: evidence.hashSha256, supplierId: provider.supplierId }) }).returning());
  return { id: result.id, type: "FUEL_AGREEMENT" };
}
function quotaPeriod(date: Date) { return date.toISOString().slice(0, 7); }
async function quotaCommitted(tx: FleetControlTx, unitId: string, period: string) {
  const from = new Date(`${period}-01T00:00:00Z`), through = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const rows = await tx.select({ status: f.fleetAuthorizations.status, authorizedQuantity: f.fleetAuthorizations.authorizedQuantity, actualQuantity: f.fleetAuthorizations.actualQuantity }).from(f.fleetAuthorizations).where(and(eq(f.fleetAuthorizations.unitId, unitId), eq(f.fleetAuthorizations.kind, "ABASTECIMENTO"), gte(f.fleetAuthorizations.issuedAt, from), lt(f.fleetAuthorizations.issuedAt, through), or(eq(f.fleetAuthorizations.status, "EXECUTADA"), and(eq(f.fleetAuthorizations.status, "EMITIDA"), gt(f.fleetAuthorizations.validUntil, new Date())))));
  return rows.reduce((sum, row) => sum.add(row.status === "EXECUTADA" ? row.actualQuantity || 0 : row.authorizedQuantity || 0), new Decimal(0));
}
export async function saveFleetQuota(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.quota.parse(raw);
  await lockFleetResources(tx, [`UNIT:${input.unitId}`]); await scopedFleetUnit(tx, scope, input.unitId, false);
  const limit = new Decimal(input.limit);
  if (limit.lte(0) || limit.lt(await quotaCommitted(tx, input.unitId, input.period))) throw new FleetControlError("Cota não pode ser inferior ao volume reservado/consumido.");
  const result = requiredFleetRecord(await tx.insert(f.fleetFuelQuotas).values({ ...input, limit }).onConflictDoUpdate({ target: [f.fleetFuelQuotas.unitId, f.fleetFuelQuotas.period], set: { limit } }).returning());
  return { id: result.id, type: "QUOTA", unitId: input.unitId };
}
async function expireAgreementReservations(tx: FleetControlTx, agreementId: string) {
  const expired = await tx.select({ id: f.fleetAuthorizations.id, authorizedQuantity: f.fleetAuthorizations.authorizedQuantity }).from(f.fleetAuthorizations).where(and(eq(f.fleetAuthorizations.agreementId, agreementId), eq(f.fleetAuthorizations.status, "EMITIDA"), lte(f.fleetAuthorizations.validUntil, new Date())));
  if (!expired.length) return;
  const quantity = expired.reduce((sum, row) => sum.add(row.authorizedQuantity || 0), new Decimal(0));
  await tx.update(f.fleetAuthorizations).set({ status: "EXPIRADA", tokenHash: null }).where(and(inArray(f.fleetAuthorizations.id, expired.map(row => row.id)), eq(f.fleetAuthorizations.status, "EMITIDA")));
  requiredFleetRecord(await tx.update(f.fleetFuelAgreements).set({ reserved: sql`${f.fleetFuelAgreements.reserved} - ${quantity.toString()}` }).where(eq(f.fleetFuelAgreements.id, agreementId)).returning());
}
export async function issueFleetFuel(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.fuelAuthorization.parse(raw), quantity = new Decimal(input.quantity);
  if (quantity.lte(0) || new Date(input.validUntil) <= new Date()) throw new FleetControlError("Volume e validade devem ser positivos/futuros.");
  const keys = [`UNIT:${input.unitId}`, ...(input.driverId ? [`DRIVER:${input.driverId}`] : []), ...(input.agreementId ? [`AGREEMENT:${input.agreementId}`] : []), ...(input.stockId ? [`STOCK:${input.stockId}`] : [])];
  await lockFleetResources(tx, keys);
  const unit = await scopedFleetUnit(tx, scope, input.unitId);
  if (input.driverId) await eligibleFleetDriver(tx, scope, input.driverId, unit);
  const [quota] = await tx.select().from(f.fleetFuelQuotas).where(and(eq(f.fleetFuelQuotas.unitId, unit.id), eq(f.fleetFuelQuotas.period, quotaPeriod(new Date())))).limit(1);
  if (quota && (await quotaCommitted(tx, unit.id, quota.period)).add(quantity).gt(quota.limit)) throw new FleetControlError("Cota mensal excedida pelo volume autorizado.");
  let providerId: string | null = null, agreementId: string | null = null, contractId: string | null = null, materialName: string;
  if (input.origin === "TERCEIRO") {
    if (!input.agreementId || !input.providerId || input.stockId) throw new FleetControlError("Abastecimento externo exige posto e contrato, sem estoque próprio.");
    const provider = await fleetProvider(tx, input.providerId, "POSTO");
    await expireAgreementReservations(tx, input.agreementId);
    const [agreement] = await tx.select().from(f.fleetFuelAgreements).where(and(eq(f.fleetFuelAgreements.id, input.agreementId), eq(f.fleetFuelAgreements.providerId, provider.id), eq(f.fleetFuelAgreements.active, true))).limit(1);
    const department = requiredFleetRecord(await tx.select({ secretariatId: departments.secretariatId }).from(departments).where(eq(departments.id, unit.departmentId!)).limit(1));
    const contract = agreement ? await readFleetContract(tx, agreement.contractId, and(eq(procurementContracts.status, "Vigente"), lte(procurementContracts.startDate, new Date()), gte(procurementContracts.endDate, new Date()), scope.administrator ? undefined : eq(procurementContracts.secretariatId, department.secretariatId))) : null;
    if (!agreement || !contract || new Date(input.validUntil) > contract.endDate || agreement.consumed.add(agreement.reserved).add(quantity).gt(agreement.contracted)) throw new FleetControlError("Saldo/validade de contrato insuficiente para a autorização.");
    if (unit.control?.fuelType && unit.control.fuelType !== agreement.fuelType) throw new FleetControlError("Combustível do contrato difere da unidade.");
    await tx.update(f.fleetFuelAgreements).set({ reserved: sql`${f.fleetFuelAgreements.reserved} + ${quantity.toString()}` }).where(eq(f.fleetFuelAgreements.id, agreement.id));
    providerId = provider.id; agreementId = agreement.id; contractId = contract.id; materialName = agreement.fuelType;
  } else {
    if (!scope.canReadAssets || !scope.canIssueStock || !input.stockId || input.agreementId || input.providerId) throw new FleetControlError("Estoque próprio exige autorização de Almoxarifado e lote real.");
    const stock = await readFleetStock(tx, input.stockId, and(eq(materials.isActive, true), eq(materials.unitOfMeasure, "L"), or(isNull(materialStocks.expirationDate), gte(materialStocks.expirationDate, new Date()))));
    const orders = await tx.select({ authorizedQuantity: f.fleetAuthorizations.authorizedQuantity }).from(f.fleetAuthorizations).where(and(eq(f.fleetAuthorizations.stockId, input.stockId), eq(f.fleetAuthorizations.status, "EMITIDA"), gt(f.fleetAuthorizations.validUntil, new Date())));
    const reserved = orders.reduce((sum, row) => sum.add(row.authorizedQuantity || 0), new Decimal(0));
    if (!stock || reserved.add(quantity).gt(String(stock.quantity))) throw new FleetControlError("Estoque disponível insuficiente após as reservas da Frota.");
    materialName = stock.material.name;
  }
  const capability = input.origin === "TERCEIRO" ? newFleetCapability() : null;
  const authorization = requiredFleetRecord(await tx.insert(f.fleetAuthorizations).values({ code: await nextFleetCode(tx, "AA"), kind: "ABASTECIMENTO", unitId: unit.id, driverId: input.driverId || null, providerId, agreementId, contractId, stockId: input.stockId || null, materialName, origin: input.origin, authorizedQuantity: quantity, description: input.description, validUntil: new Date(input.validUntil), tokenHash: capability?.hash, capabilityRevision: capability ? 1 : 0, createdById: scope.actorId }).returning());
  return { id: authorization.id, type: "AUTHORIZATION", unitId: unit.id, ...(capability ? { token: capability.token } : {}) };
}
export async function cancelFleetAuthorization(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.cancelAuthorization.parse(raw), [prior] = await tx.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, input.authorizationId)).limit(1);
  if (!prior) throw new FleetControlError("Autorização não encontrada.");
  await lockFleetResources(tx, [`UNIT:${prior.unitId}`, ...(prior.agreementId ? [`AGREEMENT:${prior.agreementId}`] : []), ...(prior.stockId ? [`STOCK:${prior.stockId}`] : [])]);
  await scopedFleetUnit(tx, scope, prior.unitId, false);
  const authorization = requiredFleetRecord(await tx.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, prior.id)).limit(1));
  if (authorization.status !== "EMITIDA") throw new FleetControlError("Autorização utilizada, cancelada ou expirada.");
  if (authorization.workOrderId && !(await tx.select({ id: f.fleetWorkOrders.id }).from(f.fleetWorkOrders).where(and(eq(f.fleetWorkOrders.id, authorization.workOrderId), eq(f.fleetWorkOrders.status, "EMITIDA"))).limit(1)).length) throw new FleetControlError("Serviço já iniciado. Conclua o tratamento formal da manutenção antes de cancelar.");
  if (authorization.agreementId) requiredFleetRecord(await tx.update(f.fleetFuelAgreements).set({ reserved: sql`${f.fleetFuelAgreements.reserved} - ${authorization.authorizedQuantity!.toString()}` }).where(eq(f.fleetFuelAgreements.id, authorization.agreementId)).returning());
  await tx.update(f.fleetAuthorizations).set({ status: "CANCELADA", tokenHash: null }).where(eq(f.fleetAuthorizations.id, authorization.id));
  if (authorization.workOrderId) await tx.update(f.fleetWorkOrders).set({ status: "CANCELADA" }).where(and(eq(f.fleetWorkOrders.id, authorization.workOrderId), eq(f.fleetWorkOrders.status, "EMITIDA")));
  return { id: authorization.id, type: "AUTHORIZATION", unitId: authorization.unitId };
}
export async function renewFleetCredential(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.renewCredential.parse(raw), authorization = requiredFleetRecord(await tx.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, input.authorizationId)).limit(1));
  await lockFleetResources(tx, [`AUTH:${authorization.id}`, `UNIT:${authorization.unitId}`]); await scopedFleetUnit(tx, scope, authorization.unitId, false);
  const current = requiredFleetRecord(await tx.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, authorization.id)).limit(1));
  if (current.status !== "EMITIDA" || current.validUntil <= new Date() || !current.providerId) throw new FleetControlError("Autorização não aceita novo código externo.");
  const capability = newFleetCapability();
  await tx.update(f.fleetAuthorizations).set({ tokenHash: capability.hash, capabilityRevision: sql`${f.fleetAuthorizations.capabilityRevision} + 1` }).where(eq(f.fleetAuthorizations.id, authorization.id));
  return { id: authorization.id, type: "AUTHORIZATION", unitId: authorization.unitId, token: capability.token };
}
export async function confirmFleetFuel(tx: DatabaseTransaction, scope: FleetScope, raw: unknown, externalActor?: { providerId: string; token: string }) {
  const input = controlSchemas.confirmFuel.parse(raw), [prior] = await tx.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, input.authorizationId)).limit(1);
  if (!prior) throw new FleetControlError("Autorização não encontrada.");
  await lockFleetResources(tx, [`UNIT:${prior.unitId}`, ...(prior.agreementId ? [`AGREEMENT:${prior.agreementId}`] : []), ...(prior.stockId ? [`STOCK:${prior.stockId}`] : [])]);
  const unit = await scopedFleetUnit(tx, scope, prior.unitId), authorization = requiredFleetRecord(await tx.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, prior.id)).limit(1));
  if (externalActor && (externalActor.providerId !== authorization.providerId || !validFleetCapability(authorization.tokenHash, externalActor.token))) throw new FleetControlError("Credencial revogada ou não autorizada.");
  if (authorization.kind !== "ABASTECIMENTO" || authorization.status !== "EMITIDA" || authorization.validUntil <= new Date()) throw new FleetControlError("Autorização inválida, utilizada ou expirada.");
  const quantity = new Decimal(input.quantity);
  if (quantity.lte(0) || quantity.gt(authorization.authorizedQuantity!)) throw new FleetControlError("Volume excede a autorização.");
  const reading = fleetControlReading(unit, input.reading), creator = externalActor ? `FORNECEDOR:${externalActor.providerId}` : scope.actorId;
  let cost: Decimal | null = null, movementId: string | null = null, supplierId: string | null = null, supplierName: string | null = null;
  if (authorization.origin === "PROPRIO") {
    if (externalActor || !scope.canIssueStock || !scope.canReadAssets || !authorization.stockId) throw new FleetControlError("Baixa própria exige permissão de Almoxarifado.");
    const stock = await readFleetStock(tx, authorization.stockId, or(isNull(materialStocks.expirationDate), gte(materialStocks.expirationDate, new Date())));
    if (!stock) throw new FleetControlError("Lote indisponível ou vencido.");
    const result = await applyStockMovement(tx, { kind: "EXIT", warehouseId: stock.warehouseId, materialId: stock.materialId, batchNumber: stock.batchNumber, quantity: quantity.toNumber(), departmentId: unit.departmentId, reason: `Autorização Frota ${authorization.code}`, idempotencyKey: `FLEET_AUTH:${authorization.id}`, actor: { usuarioId: scope.actorId, employeeId: scope.employeeId } });
    movementId = result.movement.id; cost = result.movement.totalValueDecimal || (result.movement.unitValue === null ? null : new Decimal(String(result.movement.unitValue)).mul(quantity).toDecimalPlaces(2));
  } else {
    const provider = await fleetProvider(tx, authorization.providerId!, "POSTO"), agreement = requiredFleetRecord(await tx.select().from(f.fleetFuelAgreements).where(eq(f.fleetFuelAgreements.id, authorization.agreementId!)).limit(1));
    if (!await readFleetContract(tx, agreement.contractId, and(eq(procurementContracts.status, "Vigente"), lte(procurementContracts.startDate, new Date()), gte(procurementContracts.endDate, new Date()))) || !agreement.active) throw new FleetControlError("Contrato encerrado ou saldo desativado.");
    const price = input.unitPrice ? new Decimal(input.unitPrice) : agreement.unitPrice;
    if (price && agreement.unitPrice && price.gt(agreement.unitPrice)) throw new FleetControlError("Preço informado excede o contrato de origem.");
    cost = price ? price.mul(quantity).toDecimalPlaces(2) : null; supplierId = provider.supplierId; supplierName = provider.name;
    await tx.update(f.fleetFuelAgreements).set({ reserved: sql`${f.fleetFuelAgreements.reserved} - ${authorization.authorizedQuantity!.toString()}`, consumed: sql`${f.fleetFuelAgreements.consumed} + ${quantity.toString()}` }).where(eq(f.fleetFuelAgreements.id, agreement.id));
  }
  if (input.evidenceVersionId && !externalActor) await scopedFleetEvidence(tx, scope, input.evidenceVersionId, unit.id);
  const consumption = requiredFleetRecord(await tx.insert(f.fleetConsumptions).values({ unitId: unit.id, type: "COMBUSTIVEL", origin: authorization.origin, occurredAt: dateOnly(todayInBrazil()), material: authorization.materialName!, quantity, measurementUnit: "L", cost, stockMovementId: movementId, supplierId, supplierName, reference: authorization.code, createdById: creator }).returning());
  const expense = requiredFleetRecord(await tx.insert(f.fleetExpenses).values({ unitId: unit.id, nature: "COMBUSTIVEL", occurredAt: consumption.occurredAt, amount: cost, description: authorization.materialName!, sourceType: "CONSUMO", sourceId: consumption.id, sourceKey: `consumption:${consumption.id}`, reference: authorization.code, supplierId, supplierName, contractId: authorization.contractId, createdById: creator }).returning());
  await tx.update(f.fleetAuthorizations).set({ status: "EXECUTADA", actualQuantity: quantity, actualAmount: cost, consumptionId: consumption.id, expenseId: expense.id, reading, executedAt: new Date(), tokenHash: null, evidenceVersionId: input.evidenceVersionId || null }).where(eq(f.fleetAuthorizations.id, authorization.id));
  if (reading) requiredFleetRecord(await tx.update(f.fleetUnitControls).set({ currentReading: reading }).where(eq(f.fleetUnitControls.unitId, unit.id)).returning());
  return { id: authorization.id, type: "AUTHORIZATION", unitId: unit.id };
}
