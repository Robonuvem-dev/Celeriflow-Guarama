import { and, eq, isNull } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import * as f from "@/db/schema/fleet";
import { departments } from "@/db/schema/administration";
import { assetMaintenances } from "@/db/schema/assets";
import { procurementContracts, purchaseProcesses } from "@/db/schema/procurement-core";
import { requiredFleetRecord } from "@/db/repositories/fleet/records";
import { readFleetContract, readFleetStockMovement } from "@/db/repositories/fleet/sources";
import type { FleetContext as AppContext } from "@/lib/contracts/fleet";
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
  if (new Date(input.validUntil) <= new Date() || new Decimal(input.amountLimit).lte(0)) throw new FleetControlError("Informe validade futura e valor limite positivo.");
  const provider = input.origin === "TERCEIRO" ? await fleetProvider(tx, input.providerId, "OFICINA") : null;
  if (input.origin === "PROPRIO" && input.providerId) throw new FleetControlError("Execução própria não credencia oficina externa.");
  if (input.contractId || input.purchaseProcessId) {
    if (!canViewModule(context.user, "COMPRAS")) throw new FleetControlError("Vínculo de compra/contrato exige leitura de Compras.");
    const department = requiredFleetRecord(await tx.select({ secretariatId: departments.secretariatId }).from(departments).where(eq(departments.id, unit.departmentId!)).limit(1));
    const contract = input.contractId ? await readFleetContract(tx, input.contractId, and(eq(procurementContracts.status, "Vigente"), provider ? eq(procurementContracts.supplierId, provider.supplierId) : undefined, scope.administrator ? undefined : eq(procurementContracts.secretariatId, department.secretariatId))) : null;
    if (input.contractId && !contract) throw new FleetControlError("Contrato não autorizado/vigente para o fornecedor.");
    const processId = input.purchaseProcessId || contract?.processId;
    if (processId && !(await tx.select({ id: purchaseProcesses.id }).from(purchaseProcesses).where(and(eq(purchaseProcesses.id, input.purchaseProcessId && contract ? contract.processId : processId), scope.administrator ? undefined : eq(purchaseProcesses.secretariatId, department.secretariatId))).limit(1)).length) throw new FleetControlError("Processo de contratação inexistente, incompatível ou fora da secretaria.");
  }
  const order = requiredFleetRecord(await tx.insert(f.fleetWorkOrders).values({ unitId: unit.id, planId: null, title: input.description.slice(0, 200), type: "AVULSA", services: input.description, intervalDays: 1, scheduledAt: dateOnly(input.scheduledAt), estimatedCost: new Decimal(input.amountLimit), createdById: scope.actorId }).returning());
  const capability = provider ? newFleetCapability() : null;
  const result = requiredFleetRecord(await tx.insert(f.fleetAuthorizations).values({ code: await nextFleetCode(tx, "AS"), kind: "SERVICO", unitId: unit.id, driverId: input.driverId || null, providerId: provider?.id, contractId: input.contractId || null, purchaseProcessId: input.purchaseProcessId || null, workOrderId: order.id, origin: input.origin, authorizedAmount: new Decimal(input.amountLimit), description: input.description, validUntil: new Date(input.validUntil), tokenHash: capability?.hash, capabilityRevision: capability ? 1 : 0, createdById: scope.actorId }).returning());
  return { id: result.id, type: "AUTHORIZATION", unitId: unit.id, ...(capability ? { token: capability.token } : {}) };
}
export async function reviewFleetWorkshop(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.reviewWorkshop.parse(raw), [report] = await tx.select().from(f.fleetWorkshopReports).where(eq(f.fleetWorkshopReports.id, input.reportId)).limit(1);
  if (!report) throw new FleetControlError("Relatório de oficina não encontrado.");
  await lockFleetResources(tx, [`AUTH:${report.authorizationId}`]);
  const authorization = requiredFleetRecord(await tx.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, report.authorizationId)).limit(1));
  await scopedFleetUnit(tx, scope, authorization.unitId, false);
  if (authorization.status !== "EMITIDA" || report.providerId !== authorization.providerId) throw new FleetControlError("Autorização encerrada ou oficina divergente.");
  const result = await tx.update(f.fleetWorkshopReports).set({ status: input.approved ? "CONFERIDO" : "RECUSADO" }).where(and(eq(f.fleetWorkshopReports.id, report.id), eq(f.fleetWorkshopReports.status, "RECEBIDO"))).returning({ id: f.fleetWorkshopReports.id });
  if (!result.length) throw new FleetControlError("Relatório já analisado.");
  return { id: report.id, type: "WORKSHOP_REPORT", unitId: authorization.unitId };
}
export async function executeFleetService(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.executeService.parse(raw), [prior] = await tx.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, input.authorizationId)).limit(1);
  if (!prior) throw new FleetControlError("Autorização não encontrada.");
  await lockFleetResources(tx, [`AUTH:${prior.id}`, `UNIT:${prior.unitId}`]);
  const authorization = requiredFleetRecord(await tx.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, prior.id)).limit(1)), unit = await scopedFleetUnit(tx, scope, prior.unitId, false);
  if (authorization.kind !== "SERVICO" || authorization.status !== "EMITIDA" || authorization.validUntil <= new Date() || !authorization.workOrderId) throw new FleetControlError("Autorização de serviço inválida ou encerrada.");
  const cost = input.actualCost ? new Decimal(input.actualCost) : null;
  if (cost && cost.gt(authorization.authorizedAmount!)) throw new FleetControlError("Custo realizado excede o limite autorizado.");
  const order = requiredFleetRecord(await tx.select().from(f.fleetWorkOrders).where(eq(f.fleetWorkOrders.id, authorization.workOrderId)).limit(1));
  if (order.status !== "EM_EXECUCAO") throw new FleetControlError("Inicie a execução da OS na rotina de Ordens antes de concluir.");
  if (unit.asset?.status === "Baixado" || unit.asset?.status === "Inativo") throw new FleetControlError("Bem de origem indisponível para conclusão de manutenção.");
  if (authorization.origin === "TERCEIRO") {
    const reports = await tx.select().from(f.fleetWorkshopReports).where(and(eq(f.fleetWorkshopReports.authorizationId, authorization.id), eq(f.fleetWorkshopReports.status, "CONFERIDO")));
    if (reports.length !== 1 || reports[0].providerId !== authorization.providerId || (reports[0].amount?.toString() || null) !== (cost?.toString() || null)) throw new FleetControlError("Conferência única da oficina e valor correspondente são obrigatórios.");
  }
  const completedAt = dateOnly(input.completedAt);
  if (completedAt > dateOnly(todayInBrazil())) throw new FleetControlError("Execução não pode ter data futura.");
  if (input.evidenceVersionId) await scopedFleetEvidence(tx, scope, input.evidenceVersionId, unit.id);
  await tx.update(f.fleetWorkOrders).set({ status: "CONCLUIDA", completedAt, performed: input.performed, result: input.result, actualCost: cost }).where(eq(f.fleetWorkOrders.id, order.id));
  if (order.assetMaintenanceId) requiredFleetRecord(await tx.update(assetMaintenances).set({ status: "Concluída", endDate: completedAt, cost: cost === null ? null : cost.toNumber(), description: `${input.performed}\nResultado: ${input.result}` }).where(eq(assetMaintenances.id, order.assetMaintenanceId)).returning());
  const provider = authorization.providerId ? await fleetProvider(tx, authorization.providerId, "OFICINA") : null;
  const sourceKey = order.assetMaintenanceId ? `asset-maintenance:${order.assetMaintenanceId}` : `order:${order.id}`;
  const expense = requiredFleetRecord(await tx.insert(f.fleetExpenses).values({ unitId: unit.id, nature: "MANUTENCAO", occurredAt: completedAt, amount: cost, description: input.performed, sourceType: "OS", sourceId: order.id, sourceKey, supplierId: provider?.supplierId, supplierName: provider?.name, contractId: authorization.contractId, purchaseProcessId: authorization.purchaseProcessId, reference: authorization.code, createdById: scope.actorId }).onConflictDoUpdate({ target: f.fleetExpenses.sourceKey, set: { supplierId: provider?.supplierId, supplierName: provider?.name, contractId: authorization.contractId, purchaseProcessId: authorization.purchaseProcessId, reference: authorization.code } }).returning());
  await tx.update(f.fleetAuthorizations).set({ status: "EXECUTADA", actualAmount: cost, expenseId: expense.id, executedAt: new Date(), tokenHash: null, evidenceVersionId: input.evidenceVersionId || null }).where(eq(f.fleetAuthorizations.id, authorization.id));
  return { id: authorization.id, type: "AUTHORIZATION", unitId: unit.id };
}
export async function saveFleetComponent(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.component.parse(raw);
  const result = requiredFleetRecord(await tx.insert(f.fleetComponents).values({ ...input, expectedLife: input.expectedLife ? new Decimal(input.expectedLife) : null, createdById: scope.actorId }).returning());
  return { id: result.id, type: "COMPONENT" };
}
export async function installFleetComponent(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.installComponent.parse(raw);
  await lockFleetResources(tx, [`COMPONENT:${input.componentId}`, `UNIT:${input.unitId}`]);
  const unit = await scopedFleetUnit(tx, scope, input.unitId, false), component = requiredFleetRecord(await tx.select().from(f.fleetComponents).where(eq(f.fleetComponents.id, input.componentId)).limit(1));
  if (component.status !== "ESTOQUE" || (await tx.select({ id: f.fleetComponentInstallations.id }).from(f.fleetComponentInstallations).where(and(eq(f.fleetComponentInstallations.componentId, component.id), isNull(f.fleetComponentInstallations.removedAt))).limit(1)).length) throw new FleetControlError("Componente já instalado ou indisponível.");
  const installedAt = new Date(input.installedAt);
  if (installedAt > new Date()) throw new FleetControlError("Instalação realizada não pode ter data futura.");
  const reading = input.reading ? new Decimal(input.reading) : null;
  if (unit.control?.meterType === "SEM_MARCADOR" && reading) throw new FleetControlError("Unidade sem marcador não recebe leitura.");
  if (input.workOrderId && !(await tx.select({ id: f.fleetWorkOrders.id }).from(f.fleetWorkOrders).where(and(eq(f.fleetWorkOrders.id, input.workOrderId), eq(f.fleetWorkOrders.unitId, unit.id))).limit(1)).length) throw new FleetControlError("OS deve pertencer à unidade da instalação.");
  let cost = input.cost ? new Decimal(input.cost) : null;
  if (input.stockMovementId) {
    if (!scope.canReadAssets) throw new FleetControlError("Origem de material exige consulta de Patrimônio/Estoque.");
    const movement = await readFleetStockMovement(tx, input.stockMovementId, unit.departmentId, true);
    if (!movement || !new Decimal(movement.quantityDecimal || String(movement.quantity)).eq(1)) throw new FleetControlError("Vincule uma saída real de um componente, sem destinação anterior.");
    const sourceCost = movement.totalValueDecimal || (movement.unitValue !== null ? new Decimal(String(movement.unitValue)) : null);
    if (cost && sourceCost && !cost.eq(sourceCost)) throw new FleetControlError("Custo difere da origem de estoque.");
    cost = sourceCost;
  }
  const [current] = await tx.select({ id: f.fleetComponentInstallations.id, componentId: f.fleetComponentInstallations.componentId, installedAt: f.fleetComponentInstallations.installedAt, kind: f.fleetComponents.kind }).from(f.fleetComponentInstallations).innerJoin(f.fleetComponents, eq(f.fleetComponents.id, f.fleetComponentInstallations.componentId)).where(and(eq(f.fleetComponentInstallations.unitId, unit.id), eq(f.fleetComponentInstallations.position, input.position), isNull(f.fleetComponentInstallations.removedAt))).limit(1);
  if (current) {
    if (current.installedAt > installedAt || current.kind !== component.kind) throw new FleetControlError("Posição/tipo ou data da troca divergente.");
    await tx.update(f.fleetComponentInstallations).set({ removedAt: installedAt, removeReading: reading }).where(eq(f.fleetComponentInstallations.id, current.id));
    await tx.update(f.fleetComponents).set({ status: "RETIRADO" }).where(eq(f.fleetComponents.id, current.componentId));
  }
  const installation = requiredFleetRecord(await tx.insert(f.fleetComponentInstallations).values({ componentId: component.id, unitId: unit.id, position: input.position, installedAt, installReading: reading, reason: input.reason, cost, stockMovementId: input.stockMovementId || null, workOrderId: input.workOrderId || null, createdById: scope.actorId }).returning());
  const expense = requiredFleetRecord(await tx.insert(f.fleetExpenses).values({ unitId: unit.id, nature: "MANUTENCAO", occurredAt: installedAt, amount: cost, description: `${component.kind} ${component.identifier}: ${input.reason}`, sourceType: "COMPONENTE", sourceId: installation.id, sourceKey: `component:${installation.id}`, createdById: scope.actorId }).returning());
  await tx.update(f.fleetComponentInstallations).set({ expenseId: expense.id }).where(eq(f.fleetComponentInstallations.id, installation.id));
  await tx.update(f.fleetComponents).set({ status: "EM_USO" }).where(eq(f.fleetComponents.id, component.id));
  return { id: installation.id, type: "INSTALLATION", unitId: unit.id };
}
export async function removeFleetComponent(tx: FleetControlTx, scope: FleetScope, raw: unknown) {
  const input = controlSchemas.removeComponent.parse(raw), record = requiredFleetRecord(await tx.select().from(f.fleetComponentInstallations).where(eq(f.fleetComponentInstallations.id, input.installationId)).limit(1));
  await lockFleetResources(tx, [`UNIT:${record.unitId}`, `COMPONENT:${record.componentId}`]); await scopedFleetUnit(tx, scope, record.unitId, false);
  const removedAt = new Date(input.removedAt), reading = input.reading ? new Decimal(input.reading) : null;
  if (record.removedAt || removedAt < record.installedAt || removedAt > new Date() || reading && record.installReading && reading.lt(record.installReading)) throw new FleetControlError("Retirada já registrada ou data/leitura incoerente.");
  await tx.update(f.fleetComponentInstallations).set({ removedAt, removeReading: reading }).where(eq(f.fleetComponentInstallations.id, record.id));
  await tx.update(f.fleetComponents).set({ status: "RETIRADO" }).where(eq(f.fleetComponents.id, record.componentId));
  return { id: record.id, type: "INSTALLATION", unitId: record.unitId };
}
