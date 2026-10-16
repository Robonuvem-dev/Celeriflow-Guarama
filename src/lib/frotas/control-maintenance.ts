import { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canViewModule } from "@/lib/platform/tenant-context";
import type { FleetScope } from "./service";
import { controlSchemas, newFleetCapability } from "./control-policy";
import { eligibleFleetDriver, FleetControlError, lockFleetResources, nextFleetCode, scopedFleetEvidence, scopedFleetUnit, type FleetControlTx } from "./control-access";
import { fleetProvider } from "./control-fuel";
import { dateOnly, todayInBrazil } from "./contract";

export async function issueFleetService(tx: FleetControlTx, scope: FleetScope, context: AppContext, raw: unknown) {
  const input = controlSchemas.serviceAuthorization.parse(raw);
  await lockFleetResources(tx, [`UNIT:${input.unitId}`, ...(input.driverId ? [`DRIVER:${input.driverId}`] : [])]);
  const unit = await scopedFleetUnit(tx, scope, input.unitId);
  if (input.driverId) await eligibleFleetDriver(tx, scope, input.driverId, unit);
  if (new Date(input.validUntil) <= new Date() || new Prisma.Decimal(input.amountLimit).lte(0)) throw new FleetControlError("Informe validade futura e valor limite positivo.");
  const provider = input.origin === "TERCEIRO" ? await fleetProvider(tx, input.providerId, "OFICINA") : null;
  if (input.origin === "PROPRIO" && input.providerId) throw new FleetControlError("Execução própria não credencia oficina externa.");
  if (input.contractId || input.purchaseProcessId) {
    if (!canViewModule(context.user, "COMPRAS")) throw new FleetControlError("Vínculo de compra/contrato exige leitura de Compras.");
    const department = await tx.department.findUniqueOrThrow({ where: { id: unit.departmentId! }, select: { secretariatId: true } });
    const contract = input.contractId ? await tx.contract.findFirst({ where: { id: input.contractId, status: "Vigente", ...(provider ? { supplierId: provider.supplierId } : {}), ...(scope.administrator ? {} : { secretariatId: department.secretariatId }) }, select: { id: true, processId: true } }) : null;
    if (input.contractId && !contract) throw new FleetControlError("Contrato não autorizado/vigente para o fornecedor.");
    const processId = input.purchaseProcessId || contract?.processId;
    if (processId && !await tx.purchaseProcess.findFirst({ where: { id: processId, ...(scope.administrator ? {} : { secretariatId: department.secretariatId }), ...(input.purchaseProcessId && contract ? { id: contract.processId } : {}) }, select: { id: true } })) throw new FleetControlError("Processo de contratação inexistente, incompatível ou fora da secretaria.");
  }
  const order = await tx.fleetWorkOrder.create({ data: { unitId: unit.id, planId: null, title: input.description.slice(0, 200), type: "AVULSA", services: input.description, intervalDays: 1, scheduledAt: dateOnly(input.scheduledAt), estimatedCost: new Prisma.Decimal(input.amountLimit), createdById: scope.actorId } });
  const capability = provider ? newFleetCapability() : null;
  const result = await tx.fleetAuthorization.create({ data: { code: await nextFleetCode(tx, "AS"), kind: "SERVICO", unitId: unit.id, driverId: input.driverId || null, providerId: provider?.id, contractId: input.contractId || null, purchaseProcessId: input.purchaseProcessId || null, workOrderId: order.id, origin: input.origin, authorizedAmount: input.amountLimit, description: input.description, validUntil: new Date(input.validUntil), tokenHash: capability?.hash, capabilityRevision: capability ? 1 : 0, createdById: scope.actorId } });
  return { id: result.id, type: "AUTHORIZATION", unitId: unit.id, ...(capability ? { token: capability.token } : {}) };
}
export async function reviewFleetWorkshop(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.reviewWorkshop.parse(raw), report = await tx.fleetWorkshopReport.findUnique({ where: { id: input.reportId } });
  if (!report) throw new FleetControlError("Relatório de oficina não encontrado.");
  await lockFleetResources(tx, [`AUTH:${report.authorizationId}`]);
  const authorization = await tx.fleetAuthorization.findUniqueOrThrow({ where: { id: report.authorizationId } });
  await scopedFleetUnit(tx, scope, authorization.unitId, false);
  if (authorization.status !== "EMITIDA" || report.providerId !== authorization.providerId) throw new FleetControlError("Autorização encerrada ou oficina divergente.");
  const result = await tx.fleetWorkshopReport.updateMany({ where: { id: report.id, status: "RECEBIDO" }, data: { status: input.approved ? "CONFERIDO" : "RECUSADO" } });
  if (!result.count) throw new FleetControlError("Relatório já analisado.");
  return { id: report.id, type: "WORKSHOP_REPORT", unitId: authorization.unitId };
}
export async function executeFleetService(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.executeService.parse(raw), prior = await tx.fleetAuthorization.findUnique({ where: { id: input.authorizationId } });
  if (!prior) throw new FleetControlError("Autorização não encontrada.");
  await lockFleetResources(tx, [`AUTH:${prior.id}`, `UNIT:${prior.unitId}`]);
  const authorization = await tx.fleetAuthorization.findUniqueOrThrow({ where: { id: prior.id } }), unit = await scopedFleetUnit(tx, scope, prior.unitId, false);
  if (authorization.kind !== "SERVICO" || authorization.status !== "EMITIDA" || authorization.validUntil <= new Date() || !authorization.workOrderId) throw new FleetControlError("Autorização de serviço inválida ou encerrada.");
  const cost = input.actualCost ? new Prisma.Decimal(input.actualCost) : null;
  if (cost && cost.gt(authorization.authorizedAmount!)) throw new FleetControlError("Custo realizado excede o limite autorizado.");
  const order = await tx.fleetWorkOrder.findUniqueOrThrow({ where: { id: authorization.workOrderId } });
  if (order.status !== "EM_EXECUCAO") throw new FleetControlError("Inicie a execução da OS na rotina de Ordens antes de concluir.");
  if (unit.asset?.status === "Baixado" || unit.asset?.status === "Inativo") throw new FleetControlError("Bem de origem indisponível para conclusão de manutenção.");
  if (authorization.origin === "TERCEIRO") {
    const reports = await tx.fleetWorkshopReport.findMany({ where: { authorizationId: authorization.id, status: "CONFERIDO" } });
    if (reports.length !== 1 || reports[0].providerId !== authorization.providerId || (reports[0].amount?.toString() || null) !== (cost?.toString() || null)) throw new FleetControlError("Conferência única da oficina e valor correspondente são obrigatórios.");
  }
  const completedAt = dateOnly(input.completedAt);
  if (completedAt > dateOnly(todayInBrazil())) throw new FleetControlError("Execução não pode ter data futura.");
  if (input.evidenceVersionId) await scopedFleetEvidence(tx, scope, input.evidenceVersionId, unit.id);
  await tx.fleetWorkOrder.update({ where: { id: order.id }, data: { status: "CONCLUIDA", completedAt, performed: input.performed, result: input.result, actualCost: cost } });
  if (order.assetMaintenanceId) await tx.assetMaintenance.update({ where: { id: order.assetMaintenanceId }, data: { status: "Concluída", endDate: completedAt, cost: cost === null ? null : cost.toNumber(), description: `${input.performed}\nResultado: ${input.result}` } });
  const provider = authorization.providerId ? await fleetProvider(tx, authorization.providerId, "OFICINA") : null;
  const sourceKey = order.assetMaintenanceId ? `asset-maintenance:${order.assetMaintenanceId}` : `order:${order.id}`;
  const expense = await tx.fleetExpense.upsert({ where: { sourceKey }, create: { unitId: unit.id, nature: "MANUTENCAO", occurredAt: completedAt, amount: cost, description: input.performed, sourceType: "OS", sourceId: order.id, sourceKey, supplierId: provider?.supplierId, supplierName: provider?.name, contractId: authorization.contractId, purchaseProcessId: authorization.purchaseProcessId, reference: authorization.code, createdById: scope.actorId }, update: { supplierId: provider?.supplierId, supplierName: provider?.name, contractId: authorization.contractId, purchaseProcessId: authorization.purchaseProcessId, reference: authorization.code } });
  await tx.fleetAuthorization.update({ where: { id: authorization.id }, data: { status: "EXECUTADA", actualAmount: cost, expenseId: expense.id, executedAt: new Date(), tokenHash: null, evidenceVersionId: input.evidenceVersionId || null } });
  return { id: authorization.id, type: "AUTHORIZATION", unitId: unit.id };
}
export async function saveFleetComponent(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.component.parse(raw);
  const result = await tx.fleetComponent.create({ data: { ...input, expectedLife: input.expectedLife ? new Prisma.Decimal(input.expectedLife) : null, createdById: scope.actorId } });
  return { id: result.id, type: "COMPONENT" };
}
export async function installFleetComponent(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.installComponent.parse(raw);
  await lockFleetResources(tx, [`COMPONENT:${input.componentId}`, `UNIT:${input.unitId}`]);
  const unit = await scopedFleetUnit(tx, scope, input.unitId, false), component = await tx.fleetComponent.findUniqueOrThrow({ where: { id: input.componentId } });
  if (component.status !== "ESTOQUE" || await tx.fleetComponentInstallation.count({ where: { componentId: component.id, removedAt: null } })) throw new FleetControlError("Componente já instalado ou indisponível.");
  const installedAt = new Date(input.installedAt);
  if (installedAt > new Date()) throw new FleetControlError("Instalação realizada não pode ter data futura.");
  const reading = input.reading ? new Prisma.Decimal(input.reading) : null;
  if (unit.control?.meterType === "SEM_MARCADOR" && reading) throw new FleetControlError("Unidade sem marcador não recebe leitura.");
  if (input.workOrderId && !await tx.fleetWorkOrder.findFirst({ where: { id: input.workOrderId, unitId: unit.id }, select: { id: true } })) throw new FleetControlError("OS deve pertencer à unidade da instalação.");
  let cost = input.cost ? new Prisma.Decimal(input.cost) : null;
  if (input.stockMovementId) {
    if (!scope.canReadAssets) throw new FleetControlError("Origem de material exige consulta de Patrimônio/Estoque.");
    const movement = await tx.materialMovement.findFirst({ where: { id: input.stockMovementId, type: "Saída", departmentId: unit.departmentId, assetAcquisition: null, obrasServicoId: null, fleetConsumption: null }, select: { id: true, quantityDecimal: true, quantity: true, totalValueDecimal: true, unitValue: true } });
    if (!movement || !new Prisma.Decimal(movement.quantityDecimal || String(movement.quantity)).eq(1)) throw new FleetControlError("Vincule uma saída real de um componente, sem destinação anterior.");
    const sourceCost = movement.totalValueDecimal || (movement.unitValue !== null ? new Prisma.Decimal(String(movement.unitValue)) : null);
    if (cost && sourceCost && !cost.eq(sourceCost)) throw new FleetControlError("Custo difere da origem de estoque.");
    cost = sourceCost;
  }
  const current = await tx.fleetComponentInstallation.findFirst({ where: { unitId: unit.id, position: input.position, removedAt: null }, include: { component: true } });
  if (current) {
    if (current.installedAt > installedAt || current.component.kind !== component.kind) throw new FleetControlError("Posição/tipo ou data da troca divergente.");
    await tx.fleetComponentInstallation.update({ where: { id: current.id }, data: { removedAt: installedAt, removeReading: reading } });
    await tx.fleetComponent.update({ where: { id: current.componentId }, data: { status: "RETIRADO" } });
  }
  const installation = await tx.fleetComponentInstallation.create({ data: { componentId: component.id, unitId: unit.id, position: input.position, installedAt, installReading: reading, reason: input.reason, cost, stockMovementId: input.stockMovementId || null, workOrderId: input.workOrderId || null, createdById: scope.actorId } });
  const expense = await tx.fleetExpense.create({ data: { unitId: unit.id, nature: "MANUTENCAO", occurredAt: installedAt, amount: cost, description: `${component.kind} ${component.identifier}: ${input.reason}`, sourceType: "COMPONENTE", sourceId: installation.id, sourceKey: `component:${installation.id}`, createdById: scope.actorId } });
  await tx.fleetComponentInstallation.update({ where: { id: installation.id }, data: { expenseId: expense.id } });
  await tx.fleetComponent.update({ where: { id: component.id }, data: { status: "EM_USO" } });
  return { id: installation.id, type: "INSTALLATION", unitId: unit.id };
}
export async function removeFleetComponent(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.removeComponent.parse(raw), record = await tx.fleetComponentInstallation.findUniqueOrThrow({ where: { id: input.installationId } });
  await lockFleetResources(tx, [`UNIT:${record.unitId}`, `COMPONENT:${record.componentId}`]); await scopedFleetUnit(tx, scope, record.unitId, false);
  const removedAt = new Date(input.removedAt), reading = input.reading ? new Prisma.Decimal(input.reading) : null;
  if (record.removedAt || removedAt < record.installedAt || removedAt > new Date() || reading && record.installReading && reading.lt(record.installReading)) throw new FleetControlError("Retirada já registrada ou data/leitura incoerente.");
  await tx.fleetComponentInstallation.update({ where: { id: record.id }, data: { removedAt, removeReading: reading } });
  await tx.fleetComponent.update({ where: { id: record.componentId }, data: { status: "RETIRADO" } });
  return { id: record.id, type: "INSTALLATION", unitId: record.unitId };
}
