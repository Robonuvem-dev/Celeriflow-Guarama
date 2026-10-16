import { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canViewModule } from "@/lib/platform/tenant-context";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { requireValidCnpj } from "@/lib/identifiers/brazilian-identifiers";
import type { FleetScope } from "./service";
import { controlSchemas, newFleetCapability, validFleetCapability } from "./control-policy";
import { eligibleFleetDriver, FleetControlError, fleetControlReading, lockFleetResources, nextFleetCode, scopedFleetEvidence, scopedFleetUnit, type FleetControlTx } from "./control-access";
import { dateOnly, todayInBrazil } from "./contract";

export async function fleetProvider(tx: FleetControlTx, id: string, kind: string) {
  const provider = await tx.fleetProvider.findFirst({ where: { id, kind, active: true } });
  if (!provider) throw new FleetControlError("Prestador não está credenciado para esta operação.");
  const supplier = await tx.supplier.findFirst({ where: { id: provider.supplierId, status: "Ativo", company: { status: "Ativo" } }, select: { id: true, company: { select: { corporateName: true, cnpj: true } } } });
  if (!supplier?.company) throw new FleetControlError("Prestador precisa de empresa/CNPJ ativo no cadastro canônico.");
  return { ...provider, supplier, cnpj: requireValidCnpj(supplier.company.cnpj), name: supplier.company.corporateName };
}
export async function saveFleetProvider(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.provider.parse(raw);
  const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, status: "Ativo", company: { status: "Ativo" } }, select: { company: { select: { cnpj: true } } } });
  if (!supplier?.company) throw new FleetControlError("Fornecedor/empresa não disponível.");
  requireValidCnpj(supplier.company.cnpj);
  if (!scope.administrator) throw new FleetControlError("Credenciamento/revogação de prestador exige administração da Frota.");
  const result = await tx.fleetProvider.upsert({ where: { supplierId_kind: { supplierId: input.supplierId, kind: input.kind } }, create: input, update: { active: input.active } });
  return { id: result.id, type: "PROVIDER" };
}
export async function saveFleetFuelAgreement(tx: FleetControlTx, scope: FleetScope, context: AppContext, raw: unknown) {
  const input = controlSchemas.fuelAgreement.parse(raw);
  if (!canViewModule(context.user, "COMPRAS")) throw new FleetControlError("Consulte a origem contratual com permissão de Compras.");
  const provider = await fleetProvider(tx, input.providerId, "POSTO");
  const contract = await tx.contract.findFirst({ where: { id: input.contractId, status: "Vigente", supplierId: provider.supplierId }, include: { process: { select: { id: true, number: true, modality: true } } } });
  if (!contract || contract.startDate > new Date() || contract.endDate < new Date() || (!scope.administrator && contract.secretariatId !== context.user.secretariatId)) throw new FleetControlError("Contrato não vigente ou fora da secretaria autorizada.");
  const item = await tx.purchaseProcessItem.findFirst({ where: { id: input.purchaseItemId, purchaseProcessId: contract.processId }, include: { material: { select: { name: true, unitOfMeasure: true } }, catalogItem: { select: { name: true, unit: true } } } });
  if (!item || (item.material?.unitOfMeasure || item.catalogItem?.unit || "").toUpperCase() !== "L") throw new FleetControlError("Item contratual deve ser combustível cadastrado em litros.");
  const quantity = new Prisma.Decimal(input.contracted);
  if (quantity.lte(0) || quantity.gt(String(item.quantity))) throw new FleetControlError("Quantidade contratada inválida ou superior ao item de origem.");
  const evidence = await scopedFleetEvidence(tx, scope, input.evidenceVersionId);
  await lockFleetResources(tx, [`PURCHASE_ITEM:${item.id}`]);
  const existing = await tx.fleetFuelAgreement.findUnique({ where: { contractId_purchaseItemId_fuelType: { contractId: contract.id, purchaseItemId: item.id, fuelType: input.fuelType } } });
  if (existing) throw new FleetControlError("Saldo contratual já registrado. Preserve o histórico e configure nova origem/termo de alteração.");
  const used = await tx.fleetFuelAgreement.aggregate({ where: { purchaseItemId: item.id }, _sum: { contracted: true } });
  if (quantity.add(used._sum.contracted || 0).gt(String(item.quantity))) throw new FleetControlError("As alocações de contratos superam o quantitativo do item da compra.");
  const result = await tx.fleetFuelAgreement.create({ data: { ...input, contracted: quantity, unitPrice: input.unitPrice ? new Prisma.Decimal(input.unitPrice) : null, snapshot: { contractNumber: contract.number, processNumber: contract.process.number, modality: contract.process.modality, itemName: item.material?.name || item.catalogItem?.name || item.customName, quantity: String(item.quantity), evidenceHash: evidence.hashSha256, supplierId: provider.supplierId } } });
  return { id: result.id, type: "FUEL_AGREEMENT" };
}
function quotaPeriod(date: Date) { return date.toISOString().slice(0, 7); }
async function quotaCommitted(tx: FleetControlTx, unitId: string, period: string) {
  const from = new Date(`${period}-01T00:00:00Z`), through = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const rows = await tx.fleetAuthorization.findMany({ where: { unitId, kind: "ABASTECIMENTO", issuedAt: { gte: from, lt: through }, OR: [{ status: "EXECUTADA" }, { status: "EMITIDA", validUntil: { gt: new Date() } }] }, select: { status: true, authorizedQuantity: true, actualQuantity: true } });
  return rows.reduce((sum, row) => sum.add(row.status === "EXECUTADA" ? row.actualQuantity || 0 : row.authorizedQuantity || 0), new Prisma.Decimal(0));
}
export async function saveFleetQuota(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.quota.parse(raw);
  await lockFleetResources(tx, [`UNIT:${input.unitId}`]); await scopedFleetUnit(tx, scope, input.unitId, false);
  const limit = new Prisma.Decimal(input.limit);
  if (limit.lte(0) || limit.lt(await quotaCommitted(tx, input.unitId, input.period))) throw new FleetControlError("Cota não pode ser inferior ao volume reservado/consumido.");
  const result = await tx.fleetFuelQuota.upsert({ where: { unitId_period: { unitId: input.unitId, period: input.period } }, create: { ...input, limit }, update: { limit } });
  return { id: result.id, type: "QUOTA", unitId: input.unitId };
}
async function expireAgreementReservations(tx: FleetControlTx, agreementId: string) {
  const expired = await tx.fleetAuthorization.findMany({ where: { agreementId, status: "EMITIDA", validUntil: { lte: new Date() } }, select: { id: true, authorizedQuantity: true } });
  if (!expired.length) return;
  const quantity = expired.reduce((sum, row) => sum.add(row.authorizedQuantity || 0), new Prisma.Decimal(0));
  await tx.fleetAuthorization.updateMany({ where: { id: { in: expired.map((row) => row.id) }, status: "EMITIDA" }, data: { status: "EXPIRADA", tokenHash: null } });
  await tx.fleetFuelAgreement.update({ where: { id: agreementId }, data: { reserved: { decrement: quantity } } });
}
export async function issueFleetFuel(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.fuelAuthorization.parse(raw), quantity = new Prisma.Decimal(input.quantity);
  if (quantity.lte(0) || new Date(input.validUntil) <= new Date()) throw new FleetControlError("Volume e validade devem ser positivos/futuros.");
  const keys = [`UNIT:${input.unitId}`, ...(input.driverId ? [`DRIVER:${input.driverId}`] : []), ...(input.agreementId ? [`AGREEMENT:${input.agreementId}`] : []), ...(input.stockId ? [`STOCK:${input.stockId}`] : [])];
  await lockFleetResources(tx, keys);
  const unit = await scopedFleetUnit(tx, scope, input.unitId);
  if (input.driverId) await eligibleFleetDriver(tx, scope, input.driverId, unit);
  const quota = await tx.fleetFuelQuota.findUnique({ where: { unitId_period: { unitId: unit.id, period: quotaPeriod(new Date()) } } });
  if (quota && (await quotaCommitted(tx, unit.id, quota.period)).add(quantity).gt(quota.limit)) throw new FleetControlError("Cota mensal excedida pelo volume autorizado.");
  let providerId: string | null = null, agreementId: string | null = null, contractId: string | null = null, materialName: string;
  if (input.origin === "TERCEIRO") {
    if (!input.agreementId || !input.providerId || input.stockId) throw new FleetControlError("Abastecimento externo exige posto e contrato, sem estoque próprio.");
    const provider = await fleetProvider(tx, input.providerId, "POSTO");
    await expireAgreementReservations(tx, input.agreementId);
    const agreement = await tx.fleetFuelAgreement.findFirst({ where: { id: input.agreementId, providerId: provider.id, active: true } });
    const department = await tx.department.findUniqueOrThrow({ where: { id: unit.departmentId! }, select: { secretariatId: true } });
    const contract = agreement ? await tx.contract.findFirst({ where: { id: agreement.contractId, status: "Vigente", startDate: { lte: new Date() }, endDate: { gte: new Date() }, ...(scope.administrator ? {} : { secretariatId: department.secretariatId }) }, select: { id: true, endDate: true } }) : null;
    if (!agreement || !contract || new Date(input.validUntil) > contract.endDate || agreement.consumed.add(agreement.reserved).add(quantity).gt(agreement.contracted)) throw new FleetControlError("Saldo/validade de contrato insuficiente para a autorização.");
    if (unit.control?.fuelType && unit.control.fuelType !== agreement.fuelType) throw new FleetControlError("Combustível do contrato difere da unidade.");
    await tx.fleetFuelAgreement.update({ where: { id: agreement.id }, data: { reserved: { increment: quantity } } });
    providerId = provider.id; agreementId = agreement.id; contractId = contract.id; materialName = agreement.fuelType;
  } else {
    if (!scope.canReadAssets || !scope.canIssueStock || !input.stockId || input.agreementId || input.providerId) throw new FleetControlError("Estoque próprio exige autorização de Almoxarifado e lote real.");
    const stock = await tx.materialStock.findFirst({ where: { id: input.stockId, warehouse: { isActive: true }, material: { isActive: true, unitOfMeasure: "L" }, OR: [{ expirationDate: null }, { expirationDate: { gte: new Date() } }] }, include: { material: { select: { name: true } } } });
    const orders = await tx.fleetAuthorization.findMany({ where: { stockId: input.stockId, status: "EMITIDA", validUntil: { gt: new Date() } }, select: { authorizedQuantity: true } });
    const reserved = orders.reduce((sum, row) => sum.add(row.authorizedQuantity || 0), new Prisma.Decimal(0));
    if (!stock || reserved.add(quantity).gt(String(stock.quantity))) throw new FleetControlError("Estoque disponível insuficiente após as reservas da Frota.");
    materialName = stock.material.name;
  }
  const capability = input.origin === "TERCEIRO" ? newFleetCapability() : null;
  const authorization = await tx.fleetAuthorization.create({ data: { code: await nextFleetCode(tx, "AA"), kind: "ABASTECIMENTO", unitId: unit.id, driverId: input.driverId || null, providerId, agreementId, contractId, stockId: input.stockId || null, materialName, origin: input.origin, authorizedQuantity: quantity, description: input.description, validUntil: new Date(input.validUntil), tokenHash: capability?.hash, capabilityRevision: capability ? 1 : 0, createdById: scope.actorId } });
  return { id: authorization.id, type: "AUTHORIZATION", unitId: unit.id, ...(capability ? { token: capability.token } : {}) };
}
export async function cancelFleetAuthorization(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.cancelAuthorization.parse(raw), prior = await tx.fleetAuthorization.findUnique({ where: { id: input.authorizationId } });
  if (!prior) throw new FleetControlError("Autorização não encontrada.");
  await lockFleetResources(tx, [`UNIT:${prior.unitId}`, ...(prior.agreementId ? [`AGREEMENT:${prior.agreementId}`] : []), ...(prior.stockId ? [`STOCK:${prior.stockId}`] : [])]);
  await scopedFleetUnit(tx, scope, prior.unitId, false);
  const authorization = await tx.fleetAuthorization.findUniqueOrThrow({ where: { id: prior.id } });
  if (authorization.status !== "EMITIDA") throw new FleetControlError("Autorização utilizada, cancelada ou expirada.");
  if (authorization.workOrderId && !await tx.fleetWorkOrder.findFirst({ where: { id: authorization.workOrderId, status: "EMITIDA" }, select: { id: true } })) throw new FleetControlError("Serviço já iniciado. Conclua o tratamento formal da manutenção antes de cancelar.");
  if (authorization.agreementId) await tx.fleetFuelAgreement.update({ where: { id: authorization.agreementId }, data: { reserved: { decrement: authorization.authorizedQuantity! } } });
  await tx.fleetAuthorization.update({ where: { id: authorization.id }, data: { status: "CANCELADA", tokenHash: null } });
  if (authorization.workOrderId) await tx.fleetWorkOrder.updateMany({ where: { id: authorization.workOrderId, status: "EMITIDA" }, data: { status: "CANCELADA" } });
  return { id: authorization.id, type: "AUTHORIZATION", unitId: authorization.unitId };
}
export async function renewFleetCredential(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.renewCredential.parse(raw), authorization = await tx.fleetAuthorization.findUniqueOrThrow({ where: { id: input.authorizationId } });
  await lockFleetResources(tx, [`AUTH:${authorization.id}`, `UNIT:${authorization.unitId}`]); await scopedFleetUnit(tx, scope, authorization.unitId, false);
  const current = await tx.fleetAuthorization.findUniqueOrThrow({ where: { id: authorization.id }, select: { status: true, validUntil: true, providerId: true } });
  if (current.status !== "EMITIDA" || current.validUntil <= new Date() || !current.providerId) throw new FleetControlError("Autorização não aceita novo código externo.");
  const capability = newFleetCapability();
  await tx.fleetAuthorization.update({ where: { id: authorization.id }, data: { tokenHash: capability.hash, capabilityRevision: { increment: 1 } } });
  return { id: authorization.id, type: "AUTHORIZATION", unitId: authorization.unitId, token: capability.token };
}
export async function confirmFleetFuel(tx: FleetControlTx, scope: FleetScope, raw: unknown, externalActor?: { providerId: string; token: string }) {
  const input = controlSchemas.confirmFuel.parse(raw), prior = await tx.fleetAuthorization.findUnique({ where: { id: input.authorizationId } });
  if (!prior) throw new FleetControlError("Autorização não encontrada.");
  await lockFleetResources(tx, [`UNIT:${prior.unitId}`, ...(prior.agreementId ? [`AGREEMENT:${prior.agreementId}`] : []), ...(prior.stockId ? [`STOCK:${prior.stockId}`] : [])]);
  const unit = await scopedFleetUnit(tx, scope, prior.unitId), authorization = await tx.fleetAuthorization.findUniqueOrThrow({ where: { id: prior.id } });
  if (externalActor && (externalActor.providerId !== authorization.providerId || !validFleetCapability(authorization.tokenHash, externalActor.token))) throw new FleetControlError("Credencial revogada ou não autorizada.");
  if (authorization.kind !== "ABASTECIMENTO" || authorization.status !== "EMITIDA" || authorization.validUntil <= new Date()) throw new FleetControlError("Autorização inválida, utilizada ou expirada.");
  const quantity = new Prisma.Decimal(input.quantity);
  if (quantity.lte(0) || quantity.gt(authorization.authorizedQuantity!)) throw new FleetControlError("Volume excede a autorização.");
  const reading = fleetControlReading(unit, input.reading), creator = externalActor ? `FORNECEDOR:${externalActor.providerId}` : scope.actorId;
  let cost: Prisma.Decimal | null = null, movementId: string | null = null, supplierId: string | null = null, supplierName: string | null = null;
  if (authorization.origin === "PROPRIO") {
    if (externalActor || !scope.canIssueStock || !scope.canReadAssets || !authorization.stockId) throw new FleetControlError("Baixa própria exige permissão de Almoxarifado.");
    const stock = await tx.materialStock.findFirst({ where: { id: authorization.stockId, warehouse: { isActive: true }, OR: [{ expirationDate: null }, { expirationDate: { gte: new Date() } }] } });
    if (!stock) throw new FleetControlError("Lote indisponível ou vencido.");
    const result = await applyStockMovement(tx, { kind: "EXIT", warehouseId: stock.warehouseId, materialId: stock.materialId, batchNumber: stock.batchNumber, quantity: quantity.toNumber(), departmentId: unit.departmentId, reason: `Autorização Frota ${authorization.code}`, idempotencyKey: `FLEET_AUTH:${authorization.id}`, actor: { usuarioId: scope.actorId, employeeId: scope.employeeId } });
    movementId = result.movement.id; cost = result.movement.totalValueDecimal || (result.movement.unitValue === null ? null : new Prisma.Decimal(String(result.movement.unitValue)).mul(quantity).toDecimalPlaces(2));
  } else {
    const provider = await fleetProvider(tx, authorization.providerId!, "POSTO"), agreement = await tx.fleetFuelAgreement.findUniqueOrThrow({ where: { id: authorization.agreementId! } });
    if (!await tx.contract.findFirst({ where: { id: agreement.contractId, status: "Vigente", startDate: { lte: new Date() }, endDate: { gte: new Date() } }, select: { id: true } }) || !agreement.active) throw new FleetControlError("Contrato encerrado ou saldo desativado.");
    const price = input.unitPrice ? new Prisma.Decimal(input.unitPrice) : agreement.unitPrice;
    if (price && agreement.unitPrice && price.gt(agreement.unitPrice)) throw new FleetControlError("Preço informado excede o contrato de origem.");
    cost = price ? price.mul(quantity).toDecimalPlaces(2) : null; supplierId = provider.supplierId; supplierName = provider.name;
    await tx.fleetFuelAgreement.update({ where: { id: agreement.id }, data: { reserved: { decrement: authorization.authorizedQuantity! }, consumed: { increment: quantity } } });
  }
  if (input.evidenceVersionId && !externalActor) await scopedFleetEvidence(tx, scope, input.evidenceVersionId, unit.id);
  const consumption = await tx.fleetConsumption.create({ data: { unitId: unit.id, type: "COMBUSTIVEL", origin: authorization.origin, occurredAt: dateOnly(todayInBrazil()), material: authorization.materialName!, quantity, measurementUnit: "L", cost, stockMovementId: movementId, supplierId, supplierName, reference: authorization.code, createdById: creator } });
  const expense = await tx.fleetExpense.create({ data: { unitId: unit.id, nature: "COMBUSTIVEL", occurredAt: consumption.occurredAt, amount: cost, description: authorization.materialName!, sourceType: "CONSUMO", sourceId: consumption.id, sourceKey: `consumption:${consumption.id}`, reference: authorization.code, supplierId, supplierName, contractId: authorization.contractId, createdById: creator } });
  await tx.fleetAuthorization.update({ where: { id: authorization.id }, data: { status: "EXECUTADA", actualQuantity: quantity, actualAmount: cost, consumptionId: consumption.id, expenseId: expense.id, reading, executedAt: new Date(), tokenHash: null, evidenceVersionId: input.evidenceVersionId || null } });
  if (reading) await tx.fleetUnitControl.update({ where: { unitId: unit.id }, data: { currentReading: reading } });
  return { id: authorization.id, type: "AUTHORIZATION", unitId: unit.id };
}
