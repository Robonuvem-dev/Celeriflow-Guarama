import { createHash } from "node:crypto";
import { and, eq, inArray, lte, notInArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { getPostgresError, PersistenceError } from "@/db/errors";
import * as f from "@/db/schema/fleet";
import { departments, employees } from "@/db/schema/administration";
import { assets, assetMaintenances } from "@/db/schema/assets";
import { fleetDepartmentFilter, fleetUnitScope as scopedUnits, readFleetUnit, requiredFleetRecord } from "@/db/repositories/fleet/records";
import { readFleetStock, readFleetStockMovement, readFleetSupplier } from "@/db/repositories/fleet/sources";
import type { FleetContext as AppContext } from "@/lib/contracts/fleet";
import { AccessError, canPerformModuleOperation, canViewModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { dateOnly, fleetMutationOperation, fleetMutationSchema, nextOccurrence, todayInBrazil, type FleetMutation } from "./contract";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { validateFleetHistoricalUsage } from "./control-motion";
import { FleetControlError } from "./control-access";

export class FleetError extends Error {}
export type FleetScope = { actorId: string; employeeId: string | null; departmentId: string | null; administrator: boolean; canReadAssets: boolean; canIssueStock: boolean };
type Tx = DatabaseTransaction;
export function fleetScope(context: AppContext): FleetScope {
  if (!canViewModule(context.user, "FROTAS")) throw new AccessError("Seu perfil não permite acessar Frotas.", 403);
  const administrator = isSystemAdministrator(context.user);
  if (!administrator && !context.user.departmentId) throw new AccessError("Vincule o usuário a um setor para acessar os registros de Frotas.", 403);
  return { actorId: context.user.id, employeeId: context.user.employeeId, departmentId: context.user.departmentId, administrator, canReadAssets: canViewModule(context.user, "PATRIMONIO"), canIssueStock: canPerformModuleOperation(context.user, "PATRIMONIO", "create") };
}
export function departmentWhere(scope: FleetScope): { departmentId?: string } {
  return scope.administrator ? {} : { departmentId: scope.departmentId! };
}
async function requireDepartment(tx: Tx, scope: FleetScope, id: string) {
  if (!scope.administrator && id !== scope.departmentId) throw new FleetError("O setor está fora do seu escopo de acesso.");
  const [department] = await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, id), eq(departments.isActive, true))).limit(1);
  if (!department) throw new FleetError("Selecione um setor ativo do organograma.");
}
async function requireUnit(tx: Tx, scope: FleetScope, id: string, active = true) {
  const unit = await readFleetUnit(tx, scope, id);
  if (!unit || (active && (unit.status === "INATIVO" || !unit.departmentId || unit.asset?.status === "Baixado" || unit.asset?.status === "Inativo"))) throw new FleetError("Unidade da frota não encontrada, inativa, baixada, sem setor ou fora do seu setor.");
  return unit;
}
async function requireReplayScope(tx: Tx, scope: FleetScope, type: string, id: string) {
  if (scope.administrator) return;
  if (type === "FLEET_UNIT") { await requireUnit(tx, scope, id, false); return; }
  if (type === "FLEET_ROUTE") {
    if (!(await tx.select({ id: f.fleetRoutes.id }).from(f.fleetRoutes).where(and(eq(f.fleetRoutes.id, id), fleetDepartmentFilter(scope, f.fleetRoutes.departmentId))).limit(1)).length) throw new FleetError("Rota fora do seu setor atual.");
    return;
  }
  const records = type === "FLEET_USAGE" ? await tx.select({ unitId: f.fleetUsages.unitId }).from(f.fleetUsages).where(eq(f.fleetUsages.id, id))
    : type === "FLEET_PLAN" ? await tx.select({ unitId: f.fleetPlans.unitId }).from(f.fleetPlans).where(eq(f.fleetPlans.id, id))
    : type === "FLEET_WORK_ORDER" ? await tx.select({ unitId: f.fleetWorkOrders.unitId }).from(f.fleetWorkOrders).where(eq(f.fleetWorkOrders.id, id))
    : type === "FLEET_CONSUMPTION" ? await tx.select({ unitId: f.fleetConsumptions.unitId }).from(f.fleetConsumptions).where(eq(f.fleetConsumptions.id, id))
    : type === "FLEET_EXPENSE" ? await tx.select({ unitId: f.fleetExpenses.unitId }).from(f.fleetExpenses).where(eq(f.fleetExpenses.id, id))
    : type === "FLEET_DOCUMENT" ? await tx.select({ unitId: f.fleetDocuments.unitId }).from(f.fleetDocuments).where(eq(f.fleetDocuments.id, id))
    : type === "FLEET_OCCURRENCE" ? await tx.select({ unitId: f.fleetOccurrences.unitId }).from(f.fleetOccurrences).where(eq(f.fleetOccurrences.id, id)) : [];
  const record = records[0];
  if (!record) throw new FleetError("Registro confirmado não encontrado.");
  await requireUnit(tx, scope, record.unitId, false);
}
async function requireEmployee(tx: Tx, scope: FleetScope, id: string | null, departmentId: string | null) {
  if (!id) return null;
  const [employee] = await tx.select({ id: employees.id, name: employees.name }).from(employees).where(and(eq(employees.id, id), eq(employees.isActive, true), scope.administrator ? undefined : departmentId ? eq(employees.departmentId, departmentId) : sql`${employees.departmentId} is null`)).limit(1);
  if (!employee) throw new FleetError("Servidor não encontrado, inativo ou fora do seu setor.");
  return employee;
}
async function supplier(tx: Tx, id: string | null) {
  if (!id) return null;
  const row = await readFleetSupplier(tx, id);
  if (!row) throw new FleetError("Fornecedor não encontrado ou inativo.");
  return { id: row.id, name: row.person?.fullName || row.company?.tradeName || row.company?.corporateName || "Fornecedor cadastrado" };
}
const decimal = (value: string | null) => value === null ? null : new Decimal(value);
async function hasUnitHistory(tx: Tx, id: string) {
  const result = await tx.execute<{ exists: boolean }>(sql`select exists(select 1 from "FleetExpense" where "unitId"=${id} union all select 1 from "FleetUsage" where "unitId"=${id} union all select 1 from "FleetPlan" where "unitId"=${id} union all select 1 from "FleetDocument" where "unitId"=${id} union all select 1 from "FleetOccurrence" where "unitId"=${id}) as exists`);
  return result.rows[0].exists;
}
function checkVersion(actual: Date, version?: string) {
  if (!version || actual.toISOString() !== version) throw new FleetError("Este registro foi atualizado por outra sessão. Reabra a ficha antes de editar.");
}
async function apply(tx: Tx, scope: FleetScope, input: FleetMutation): Promise<{ targetType: string; targetId: string }> {
  const createdById = scope.actorId;
  switch (input.kind) {
    case "unit": {
      const d = input.data, { id, version, status, ...data } = d;
      await requireDepartment(tx, scope, d.departmentId);
      const existing = id ? await requireUnit(tx, scope, id, false) : null;
      if (existing) {
        checkVersion(existing.updatedAt, version);
        if (existing.assetId && d.assetId !== existing.assetId && await hasUnitHistory(tx, existing.id)) throw new FleetError("Uma unidade vinculada com histórico não pode trocar ou remover seu bem patrimonial.");
        if (existing.departmentId !== d.departmentId) throw new FleetError("O setor de uma unidade cadastrada não pode ser transferido por esta ficha.");
        if (existing.category !== d.category && await hasUnitHistory(tx, existing.id)) throw new FleetError("Uma unidade com histórico não pode mudar de categoria.");
        if (d.category === "AGREGADO" && (await tx.select({ id: f.fleetUnits.id }).from(f.fleetUnits).where(eq(f.fleetUnits.parentId, existing.id)).limit(1)).length) throw new FleetError("Uma unidade principal com agregados não pode se tornar agregado.");
      }
      if (d.category !== "AGREGADO" && d.parentId) throw new FleetError("Apenas agregados podem ter unidade principal.");
      if (d.parentId) {
        const parent = await requireUnit(tx, scope, d.parentId);
        if (parent.id === d.id || parent.category === "AGREGADO" || parent.departmentId !== d.departmentId) throw new FleetError("Selecione uma unidade principal do mesmo setor, diferente do agregado.");
      }
      if (d.assetId && d.assetId !== existing?.assetId) {
        if (!scope.canReadAssets) throw new FleetError("Seu perfil não permite consultar Patrimônio para criar esse vínculo.");
        const [asset] = await tx.select({ id: assets.id }).from(assets).where(and(eq(assets.id, d.assetId), eq(assets.departmentId, d.departmentId), notInArray(assets.status, ["Baixado", "Inativo"]))).limit(1);
        if (!asset) throw new FleetError("O bem patrimonial deve estar ativo e pertencer ao mesmo setor.");
      }
      if (d.assetId) {
        const asset = requiredFleetRecord(await tx.select({ departmentId: assets.departmentId, responsibleId: assets.responsibleId }).from(assets).where(eq(assets.id, d.assetId)).limit(1));
        if (asset.departmentId !== d.departmentId || asset.responsibleId !== d.responsibleId) throw new FleetError("Setor e responsável do bem são definidos em Patrimônio. Recarregue os dados de origem.");
      }
      await requireEmployee(tx, scope, d.responsibleId, d.departmentId);
      const values = { ...data, operationalStatus: status };
      const unit = requiredFleetRecord(existing ? await tx.update(f.fleetUnits).set(values).where(and(eq(f.fleetUnits.id, existing.id), eq(f.fleetUnits.updatedAt, existing.updatedAt))).returning() : await tx.insert(f.fleetUnits).values({ ...values, createdById }).returning());
      return { targetType: "FLEET_UNIT", targetId: unit.id };
    }
    case "route": {
      const { id, version, ...data } = input.data;
      await requireDepartment(tx, scope, data.departmentId);
      const existing = id ? (await tx.select().from(f.fleetRoutes).where(and(eq(f.fleetRoutes.id, id), fleetDepartmentFilter(scope, f.fleetRoutes.departmentId))).limit(1))[0] : null;
      if (id && !existing) throw new FleetError("Rota não encontrada ou fora do seu setor.");
      if (existing) { checkVersion(existing.updatedAt, version); if (existing.departmentId !== data.departmentId) throw new FleetError("O setor da rota não pode ser alterado."); }
      const route = requiredFleetRecord(existing ? await tx.update(f.fleetRoutes).set(data).where(and(eq(f.fleetRoutes.id, existing.id), eq(f.fleetRoutes.updatedAt, existing.updatedAt))).returning() : await tx.insert(f.fleetRoutes).values({ ...data, createdById }).returning());
      return { targetType: "FLEET_ROUTE", targetId: route.id };
    }
    case "usage": {
      const d = input.data, unit = await requireUnit(tx, scope, d.unitId);
      if (!["VEICULO", "MAQUINA"].includes(unit.category)) throw new FleetError("O histórico de utilização deve selecionar veículo ou máquina.");
      if (unit.status === "EM_MANUTENCAO") throw new FleetError("O veículo está em manutenção e não pode registrar nova utilização.");
      const startedAt = new Date(`${d.startedAt}:00-03:00`), endedAt = new Date(`${d.endedAt}:00-03:00`);
      dateOnly(d.startedAt.slice(0, 10)); dateOnly(d.endedAt.slice(0, 10));
      if (Number.isNaN(startedAt.valueOf()) || Number.isNaN(endedAt.valueOf()) || startedAt > endedAt || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.startedAt.slice(11)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.endedAt.slice(11))) throw new FleetError("Informe um período de utilização válido (horário de Brasília).");
      if ((d.initialReading === null) !== (d.finalReading === null) || (d.initialReading !== null && decimal(d.finalReading)!.lt(decimal(d.initialReading)!))) throw new FleetError("Informe as duas leituras; a final deve ser igual ou maior que a inicial.");
      const employee = await requireEmployee(tx, scope, d.employeeId, unit.departmentId);
      let eligibility;
      try { eligibility = await validateFleetHistoricalUsage(tx, scope, { unitId: unit.id, employeeId: d.employeeId, driverId: d.driverId, startedAt, endedAt, initialReading: decimal(d.initialReading), finalReading: decimal(d.finalReading) }); }
      catch (error) { if (error instanceof FleetControlError) throw new FleetError(error.message); throw error; }
      const route = d.routeId ? (await tx.select().from(f.fleetRoutes).where(and(eq(f.fleetRoutes.id, d.routeId), eq(f.fleetRoutes.departmentId, unit.departmentId!), eq(f.fleetRoutes.active, true))).limit(1))[0] : null;
      if (d.routeId && !route) throw new FleetError("Selecione uma rota ativa do mesmo setor do veículo.");
      const row = requiredFleetRecord(await tx.insert(f.fleetUsages).values({ ...d, ...eligibility, startedAt, endedAt, initialReading: decimal(d.initialReading), finalReading: decimal(d.finalReading), employeeName: employee?.name || eligibility.employeeName, routeSnapshot: route ? `${route.code} · ${route.name} | ${route.origin} → ${route.destination} | ${route.itinerary}` : null, createdById }).returning());
      return { targetType: "FLEET_USAGE", targetId: row.id };
    }
    case "plan": {
      const d = input.data; await requireUnit(tx, scope, d.unitId);
      const row = requiredFleetRecord(await tx.insert(f.fleetPlans).values({ ...d, firstDueAt: dateOnly(d.firstDueAt), nextDueAt: dateOnly(d.firstDueAt), estimatedCost: decimal(d.estimatedCost), createdById }).returning());
      return { targetType: "FLEET_PLAN", targetId: row.id };
    }
    case "generateOrder": {
      const [plan] = await tx.select().from(f.fleetPlans).where(and(eq(f.fleetPlans.id, input.planId), inArray(f.fleetPlans.unitId, scopedUnits(scope)))).limit(1);
      if (!plan || !plan.active) throw new FleetError("Plano não encontrado ou inativo.");
      await requireUnit(tx, scope, plan.unitId);
      const scheduledAt = dateOnly(input.scheduledAt), days = (scheduledAt.valueOf() - plan.firstDueAt.valueOf()) / 86400000;
      if (days < 0 || days % plan.intervalDays !== 0) throw new FleetError("A data deve corresponder a uma ocorrência da periodicidade do plano.");
      const [existing] = await tx.select().from(f.fleetWorkOrders).where(and(eq(f.fleetWorkOrders.planId, plan.id), eq(f.fleetWorkOrders.scheduledAt, scheduledAt))).limit(1);
      if (existing) return { targetType: "FLEET_WORK_ORDER", targetId: existing.id };
      const order = requiredFleetRecord(await tx.insert(f.fleetWorkOrders).values({ planId: plan.id, unitId: plan.unitId, scheduledAt, title: plan.title, type: plan.type, services: plan.services, intervalDays: plan.intervalDays, estimatedCost: plan.estimatedCost, createdById }).returning());
      return { targetType: "FLEET_WORK_ORDER", targetId: order.id };
    }
    case "startOrder": {
      const [order] = await tx.select().from(f.fleetWorkOrders).where(and(eq(f.fleetWorkOrders.id, input.orderId), inArray(f.fleetWorkOrders.unitId, scopedUnits(scope)))).limit(1);
      if (!order) throw new FleetError("OS não encontrada ou fora do seu setor.");
      if (order.status === "CONCLUIDA") throw new FleetError("Esta ordem já foi concluída.");
      const unit = await requireUnit(tx, scope, order.unitId);
      if (order.status === "EMITIDA") {
        const maintenance = unit.assetId ? requiredFleetRecord(await tx.insert(assetMaintenances).values({ assetId: unit.assetId, description: `${order.title}\n${order.services}`, status: "Em manutenção", startDate: order.scheduledAt }).returning()) : null;
        requiredFleetRecord(await tx.update(f.fleetWorkOrders).set({ status: "EM_EXECUCAO", startedAt: new Date(), assetMaintenanceId: maintenance?.id }).where(and(eq(f.fleetWorkOrders.id, order.id), eq(f.fleetWorkOrders.status, "EMITIDA"))).returning());
      }
      return { targetType: "FLEET_WORK_ORDER", targetId: order.id };
    }
    case "completeOrder": {
      const d = input.data, [order] = await tx.select().from(f.fleetWorkOrders).where(and(eq(f.fleetWorkOrders.id, d.orderId), inArray(f.fleetWorkOrders.unitId, scopedUnits(scope)))).limit(1);
      if (!order) throw new FleetError("OS não encontrada ou fora do seu setor.");
      if ((await tx.select({ id: f.fleetAuthorizations.id }).from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.workOrderId, order.id)).limit(1)).length) throw new FleetError("Conclua esta OS pela autorização de serviço em Gestão de Frota, com a conferência da oficina quando terceirizada.");
      if (order.status === "CONCLUIDA") {
        if (order.completedAt?.getTime() !== dateOnly(d.completedAt).getTime() || order.performed !== d.performed || order.result !== d.result || (order.actualCost?.toString() ?? null) !== (decimal(d.actualCost)?.toString() ?? null)) throw new FleetError("A OS já foi concluída com outros dados; seu histórico foi preservado.");
        return { targetType: "FLEET_WORK_ORDER", targetId: order.id };
      }
      const unit = await requireUnit(tx, scope, order.unitId, false);
      if (unit.asset?.status === "Baixado" || unit.asset?.status === "Inativo") throw new FleetError("O bem está baixado ou inativo. Conclua a manutenção em Patrimônio antes de registrar a operação.");
      if (order.status !== "EM_EXECUCAO") throw new FleetError("Inicie a execução antes de concluir a OS.");
      const completedAt = dateOnly(d.completedAt);
      if (completedAt > dateOnly(todayInBrazil())) throw new FleetError("Uma execução realizada não pode ter data futura.");
      requiredFleetRecord(await tx.update(f.fleetWorkOrders).set({ status: "CONCLUIDA", completedAt, performed: d.performed, result: d.result, actualCost: decimal(d.actualCost) }).where(and(eq(f.fleetWorkOrders.id, order.id), eq(f.fleetWorkOrders.status, "EM_EXECUCAO"))).returning());
      if (order.assetMaintenanceId) requiredFleetRecord(await tx.update(assetMaintenances).set({ status: "Concluída", endDate: completedAt, description: `${d.performed}\nResultado: ${d.result}`, cost: d.actualCost === null ? null : Number(d.actualCost) }).where(eq(assetMaintenances.id, order.assetMaintenanceId)).returning());
      const expense = { unitId: order.unitId, nature: "MANUTENCAO", occurredAt: completedAt, amount: decimal(d.actualCost), description: d.performed, sourceType: "OS", sourceId: order.id, sourceKey: order.assetMaintenanceId ? `asset-maintenance:${order.assetMaintenanceId}` : `order:${order.id}`, reference: d.reference, createdById };
      await tx.insert(f.fleetExpenses).values(expense).onConflictDoUpdate({ target: f.fleetExpenses.sourceKey, set: { description: expense.description, reference: expense.reference, createdById } });
      if (order.planId) await tx.update(f.fleetPlans).set({ nextDueAt: nextOccurrence(order.scheduledAt, order.intervalDays) }).where(and(eq(f.fleetPlans.id, order.planId), lte(f.fleetPlans.nextDueAt, order.scheduledAt)));
      return { targetType: "FLEET_WORK_ORDER", targetId: order.id };
    }
    case "consumption": {
      const d = input.data, unit = await requireUnit(tx, scope, d.unitId);
      const { stockMode, stockId, stockMovementId, ...data } = d;
      let movementId: string | null = null, cost = decimal(d.cost), material = d.material, measurementUnit = d.measurementUnit, quantity = new Decimal(d.quantity), occurredAt = dateOnly(d.occurredAt);
      if (stockMode !== "LOCAL") {
        if (!scope.canReadAssets || (stockMode === "STOCK_EXIT" && !scope.canIssueStock)) throw new FleetError("Seu perfil não permite consultar ou baixar materiais do Almoxarifado.");
        if (d.origin !== "PROPRIO") throw new FleetError("Somente consumo de material próprio pode usar uma saída do Almoxarifado.");
        if (stockMode === "STOCK_EXIT" && (!stockId || stockMovementId)) throw new FleetError("Selecione um estoque/lote, sem informar uma saída existente.");
        if (stockMode === "STOCK_MOVEMENT" && (!stockMovementId || stockId)) throw new FleetError("Selecione uma saída existente, sem informar estoque para nova baixa.");
        const movement = stockMode === "STOCK_MOVEMENT" ? await readFleetStockMovement(tx, stockMovementId!, unit.departmentId) : null;
        const stock = stockMode === "STOCK_EXIT" ? await readFleetStock(tx, stockId!) : null;
        if (!movement && !stock) throw new FleetError("Estoque ou saída não encontrados, já destinados a outro processo ou fora do setor da unidade.");
        const sourceMaterial = (movement || stock)!.material;
        if (!["L", "KG", "UN"].includes(sourceMaterial.unitOfMeasure.toUpperCase())) throw new FleetError("O material deve estar cadastrado em L, KG ou UN, sem conversão implícita de unidades.");
        if (stock?.expirationDate && stock.expirationDate < dateOnly(todayInBrazil())) throw new FleetError("O lote está vencido e não pode ser consumido.");
        material = `${sourceMaterial.code} · ${sourceMaterial.name}`; measurementUnit = sourceMaterial.unitOfMeasure.toUpperCase() as typeof measurementUnit;
        if (movement) { quantity = new Decimal(String(movement.quantity)); occurredAt = dateOnly(movement.date.toISOString().slice(0, 10)); }
        if (quantity.lte(0)) throw new FleetError("A saída deve ter quantidade positiva.");
        const source = movement || (await applyStockMovement(tx, { kind: "EXIT", warehouseId: stock!.warehouseId, materialId: stock!.materialId, batchNumber: stock!.batchNumber, quantity: quantity.toNumber(), departmentId: unit.departmentId, reason: `Consumo Frotas · ${unit.code}`, actor: { usuarioId: scope.actorId, employeeId: scope.employeeId } })).movement;
        movementId = source.id;
        const [prior] = await tx.select().from(f.fleetConsumptions).where(eq(f.fleetConsumptions.stockMovementId, movementId)).limit(1);
        if (prior) {
          if (prior.unitId !== unit.id || prior.type !== d.type || prior.workOrderId !== d.workOrderId) throw new FleetError("Esta saída já foi apropriada em outro consumo. Abra o registro de origem.");
          return { targetType: "FLEET_CONSUMPTION", targetId: prior.id };
        }
        cost = source.totalValueDecimal ?? (source.unitValue == null ? null : new Decimal(String(source.unitValue)).mul(quantity).toDecimalPlaces(2));
      } else if (stockId || stockMovementId) throw new FleetError("Um registro local não pode informar vínculo de estoque.");
      const provider = await supplier(tx, d.supplierId);
      if (d.workOrderId && !(await tx.select({ id: f.fleetWorkOrders.id }).from(f.fleetWorkOrders).where(and(eq(f.fleetWorkOrders.id, d.workOrderId), eq(f.fleetWorkOrders.unitId, d.unitId))).limit(1)).length) throw new FleetError("A OS vinculada deve pertencer à mesma unidade.");
      const row = requiredFleetRecord(await tx.insert(f.fleetConsumptions).values({ ...data, occurredAt, quantity, cost, material, measurementUnit, stockMovementId: movementId, supplierName: provider?.name, createdById }).returning());
      await tx.insert(f.fleetExpenses).values({ unitId: d.unitId, nature: d.type, occurredAt: row.occurredAt, amount: row.cost, description: material, sourceType: "CONSUMO", sourceId: row.id, sourceKey: `consumption:${row.id}`, reference: d.reference, createdById });
      return { targetType: "FLEET_CONSUMPTION", targetId: row.id };
    }
    case "document": {
      const d = input.data, unit = await requireUnit(tx, scope, d.unitId);
      if (d.kind === "OBRIGACAO" && (unit.category !== "VEICULO" || !["IPVA", "LICENCIAMENTO", "OUTRO"].includes(d.type) || !d.scheduledAt)) throw new FleetError("A obrigação deve selecionar veículo, tipo e data de agendamento.");
      if (d.kind === "SEGURO" && !d.startsAt) throw new FleetError("Informe o início da vigência do seguro.");
      if (d.startsAt && d.startsAt > d.dueAt) throw new FleetError("O início da vigência deve preceder o vencimento.");
      if (d.scheduledAt && d.scheduledAt > d.dueAt) throw new FleetError("O agendamento deve preceder o vencimento.");
      const insurer = await supplier(tx, d.insurerId);
      const { id, version, ...data } = d;
      const values = { ...data, startsAt: d.startsAt ? dateOnly(d.startsAt) : null, scheduledAt: d.scheduledAt ? dateOnly(d.scheduledAt) : null, dueAt: dateOnly(d.dueAt), value: decimal(d.value), insurerName: insurer?.name ?? null };
      const existing = id ? (await tx.select().from(f.fleetDocuments).where(and(eq(f.fleetDocuments.id, id), inArray(f.fleetDocuments.unitId, scopedUnits(scope)))).limit(1))[0] : null;
      if (id && !existing) throw new FleetError("Documento não encontrado ou fora do seu setor.");
      if (existing) { checkVersion(existing.updatedAt, version); if (existing.status === "CUMPRIDA" || existing.unitId !== d.unitId || existing.kind !== d.kind) throw new FleetError("Documento cumprido, objeto e natureza têm histórico protegido."); }
      const row = requiredFleetRecord(existing ? await tx.update(f.fleetDocuments).set(values).where(and(eq(f.fleetDocuments.id, existing.id), eq(f.fleetDocuments.updatedAt, existing.updatedAt))).returning() : await tx.insert(f.fleetDocuments).values({ ...values, createdById }).returning());
      return { targetType: "FLEET_DOCUMENT", targetId: row.id };
    }
    case "fulfillDocument": {
      const d = input.data, [row] = await tx.select().from(f.fleetDocuments).where(and(eq(f.fleetDocuments.id, d.documentId), inArray(f.fleetDocuments.unitId, scopedUnits(scope)))).limit(1);
      if (!row || row.kind === "SEGURO") throw new FleetError("Selecione uma obrigação ou documento do seu setor.");
      if (row.status === "CUMPRIDA") return { targetType: "FLEET_DOCUMENT", targetId: row.id };
      const fulfilledAt = dateOnly(d.fulfilledAt);
      if (fulfilledAt > dateOnly(todayInBrazil())) throw new FleetError("O cumprimento administrativo não pode ter data futura.");
      await tx.update(f.fleetDocuments).set({ status: "CUMPRIDA", fulfilledAt, fulfillmentNote: d.fulfillmentNote }).where(eq(f.fleetDocuments.id, row.id));
      return { targetType: "FLEET_DOCUMENT", targetId: row.id };
    }
    case "occurrence": {
      const d = input.data; await requireUnit(tx, scope, d.unitId);
      const row = requiredFleetRecord(await tx.insert(f.fleetOccurrences).values({ ...d, occurredAt: dateOnly(d.occurredAt), involvedValue: decimal(d.involvedValue), createdById }).returning());
      return { targetType: "FLEET_OCCURRENCE", targetId: row.id };
    }
    case "expense": {
      const d = input.data; await requireUnit(tx, scope, d.unitId);
      if (d.occurrenceId && !(await tx.select({ id: f.fleetOccurrences.id }).from(f.fleetOccurrences).where(and(eq(f.fleetOccurrences.id, d.occurrenceId), eq(f.fleetOccurrences.unitId, d.unitId))).limit(1)).length) throw new FleetError("A ocorrência deve pertencer à mesma unidade da frota.");
      const row = requiredFleetRecord(await tx.insert(f.fleetExpenses).values({ unitId: d.unitId, occurredAt: dateOnly(d.occurredAt), amount: decimal(d.amount), description: d.description, nature: "OUTROS", reference: d.reference, sourceType: d.occurrenceId ? "OCORRENCIA" : "LOCAL", sourceId: d.occurrenceId || input.requestId, sourceKey: d.occurrenceId ? `occurrence:${d.occurrenceId}` : `manual:${input.requestId}`, createdById }).returning());
      return { targetType: "FLEET_EXPENSE", targetId: row.id };
    }
  }
}

/** Join an existing transaction, including replay and audit, without opening a pool connection. */
export async function mutateFleetInTransaction(tx: DatabaseTransaction, context: AppContext, raw: unknown) {
  const input = fleetMutationSchema.parse(raw), scope = fleetScope(context);
  if (!canPerformModuleOperation(context.user, "FROTAS", fleetMutationOperation(input))) throw new AccessError("Seu perfil não permite confirmar esta operação de Frotas.", 403);
  const payloadHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return persistFleetMutation(tx, scope, input, payloadHash);
}

async function persistFleetMutation(tx: DatabaseTransaction, scope: FleetScope, input: FleetMutation, payloadHash: string) {
  const [prior] = await tx.select().from(f.fleetMutations).where(eq(f.fleetMutations.requestId, input.requestId)).limit(1);
  if (prior) {
    if (prior.actorId !== scope.actorId || prior.payloadHash !== payloadHash) throw new FleetError("A identificação desta confirmação já foi utilizada com outros dados.");
    await requireReplayScope(tx, scope, prior.targetType, prior.targetId);
    return { id: prior.targetId, type: prior.targetType, repeated: true };
  }
  const target = await apply(tx, scope, input);
  await tx.insert(f.fleetMutations).values({ requestId: input.requestId, actorId: scope.actorId, payloadHash, ...target });
  await insertAuditEvent(tx, { actorUsuarioId: scope.actorId, eventType: auditEventTypes.fleetOperationRegistered, ...target });
  return { id: target.targetId, type: target.targetType, repeated: false };
}

export async function mutateFleet(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = fleetMutationSchema.parse(raw), scope = fleetScope(context);
  if (!canPerformModuleOperation(context.user, "FROTAS", fleetMutationOperation(input))) throw new AccessError("Seu perfil não permite confirmar esta operação de Frotas.", 403);
  const payloadHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await withDatabaseTransaction(connection, tx => persistFleetMutation(tx, scope, input, payloadHash), { isolationLevel: "serializable", timeoutMs: 15000 });
    } catch (error) {
      const code = getPostgresError(error)?.code;
      if (["40001", "40P01", "23505"].includes(code || "") && attempt < 3) continue;
      if (code === "23505") throw new FleetError("Já existe um registro com essa identificação, vínculo ou origem. Reabra o registro existente.");
      if (error instanceof PersistenceError && error.kind === "not-found") throw new FleetError("O registro mudou durante a operação. Recarregue e tente novamente.");
      throw error;
    }
  }
  throw new FleetError("Não foi possível confirmar após concorrência. Tente novamente.");
}
